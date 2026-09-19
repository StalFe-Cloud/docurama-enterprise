/// <reference types="bun-types" />

/** Run alone: bun test e2e/auth-security.test.ts. Owns a fresh scratch DB and next/headers. */
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { Database } from "bun:sqlite";

const scratchDir = mkdtempSync(join(tmpdir(), "docurama-auth-security-"));
process.env.DATABASE_URL = `file:${join(scratchDir, "auth.db").replace(/\\/g, "/")}`;
new Database(join(scratchDir, "auth.db"), { create: true }).close();
execFileSync("node", ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], {
  env: process.env, stdio: "pipe",
});
let bearerToken: string | undefined;
let cookieToken: string | undefined;
mock.module("next/headers", () => ({
  cookies: async () => ({ get: () => cookieToken ? { value: cookieToken } : undefined }),
  headers: async () => new Headers(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
}));

const { db } = await import("../src/lib/db");
const auth = await import("../src/lib/auth");
const onboarding = await import("../src/lib/onboarding");
const signup = await import("../src/app/api/auth/signup/route");
const onboardingRoute = await import("../src/app/api/onboarding/route");
const workspaceRoute = await import("../src/app/api/workspace/[section]/route");
const invitationRoute = await import("../src/app/api/invitations/[token]/route");
const { bootstrapAdmin } = await import("../scripts/bootstrap-admin");

let sequence = 0;
const unique = () => `security-${++sequence}`;
const request = (path: string, payload: unknown) => new NextRequest(`http://localhost${path}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
});
const newUser = (extra: Record<string, unknown> = {}) => db.user.create({
  data: { email: `${unique()}@example.test`, firstName: "Security", lastName: "Test", passwordHash: auth.hashPassword("SecurePass123"), ...extra },
});
const newTenant = () => db.tenant.create({ data: { name: "Security workspace", slug: unique(), status: "ACTIVE" } });
const sessionFor = async (userId: string) => (await db.session.create({ data: { userId, expiresAt: new Date(Date.now() + 60_000) } })).id;
const signupRequest = (email: string, extra: Record<string, unknown> = {}) => signup.POST(request("/api/auth/signup", {
  firstName: "Security", lastName: "Signup", email, password: "SecurePass123", organization: "New company", consent: true,
  formStartedAt: Date.now() - 10_000, ...extra,
}));
const verificationFor = async (email: string) => {
  const mail = await db.mailOutbox.findFirstOrThrow({ where: { toEmail: email, template: "SIGNUP_VERIFICATION" }, orderBy: { createdAt: "desc" } });
  return new URL(mail.linkUrl!).searchParams.get("verify")!;
};

beforeEach(() => {
  bearerToken = undefined;
  cookieToken = undefined;
  process.env.DOCURAMA_DEPLOYMENT_MODE = "saas";
  process.env.DOCURAMA_PUBLIC_REGISTRATION = "true";
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  delete process.env.TURNSTILE_SECRET_KEY;
});
afterAll(async () => {
  await db.$disconnect();
  mock.restore();
  rmSync(scratchDir, { recursive: true, force: true });
});

describe("installation bootstrap", () => {
  test("only a pre-provisioned platform admin can create the first dedicated tenant", async () => {
    process.env.DOCURAMA_DEPLOYMENT_MODE = "selfhost";
    await expect(bootstrapAdmin({ email: "admin@bootstrap.test", password: "weak" })).rejects.toThrow("Bootstrap password");
    const admin = await bootstrapAdmin({ email: "admin@bootstrap.test", password: "StrongBootstrapSecret123!" });
    await expect(bootstrapAdmin({ email: "second@bootstrap.test", password: "AnotherBootstrapSecret123!" })).rejects.toThrow("already contains");
    const bootstrapUser = await db.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(auth.verifyPassword("StrongBootstrapSecret123!", bootstrapUser.passwordHash)).toBe(true);
    expect(bootstrapUser.role).toBe("PLATFORM_ADMIN");
    expect(await db.auditEvent.count({ where: { action: "installation.admin_bootstrapped" } })).toBe(1);
    const outsider = await newUser();
    bearerToken = await sessionFor(outsider.id);
    const postOrg = () => workspaceRoute.POST(request("/api/workspace/settings", { op: "org.create", data: { name: "Dedicated tenant" } }), { params: Promise.resolve({ section: "settings" }) });
    expect((await postOrg()).status).toBe(403);
    expect(await db.tenant.count()).toBe(0);
    bearerToken = await sessionFor(admin.id);
    expect((await postOrg()).status).toBe(200);
    expect(await db.tenant.count()).toBe(1);
    expect((await postOrg()).status).toBe(403);
    expect(await db.tenant.count()).toBe(1);
  });
});

describe("session authentication", () => {
  test("raw user IDs cannot authenticate by cookie or bearer, including admin IDs", async () => {
    const user = await newUser({ role: "PLATFORM_ADMIN" });
    bearerToken = user.id;
    expect(await auth.getSessionUser()).toBeNull();
    bearerToken = undefined;
    cookieToken = user.id;
    expect(await auth.getSessionUser()).toBeNull();
    cookieToken = await sessionFor(user.id);
    expect((await auth.getSessionUser())?.id).toBe(user.id);
  });

  test("expired, revoked, deleted sessions and suspended users are rejected", async () => {
    const user = await newUser();
    const token = await sessionFor(user.id);
    await db.session.update({ where: { id: token }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await auth.resolveSessionUser(token)).toBeNull();
    await db.session.update({ where: { id: token }, data: { expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() } });
    expect(await auth.resolveSessionUser(token)).toBeNull();
    await db.session.delete({ where: { id: token } });
    expect(await auth.resolveSessionUser(token)).toBeNull();
    const live = await sessionFor(user.id);
    await db.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    expect(await auth.resolveSessionUser(live)).toBeNull();
  });

  test("inactive membership cannot be selected or switched into", async () => {
    const active = await newTenant();
    const disabled = await newTenant();
    const user = await newUser({ activeTenantId: disabled.id });
    await db.member.createMany({ data: [
      { userId: user.id, tenantId: active.id, role: "OWNER", status: "ACTIVE" },
      { userId: user.id, tenantId: disabled.id, status: "SUSPENDED" },
    ] });
    bearerToken = await sessionFor(user.id);
    const session = await auth.getSessionUser();
    expect(session?.tenantId).toBe(active.id);
    expect(session?.orgs.map((org) => org.id)).toEqual([active.id]);
    const switched = await workspaceRoute.POST(request("/api/workspace/settings", { op: "org.switch", data: { tenantId: disabled.id } }), { params: Promise.resolve({ section: "settings" }) });
    expect(switched.status).toBe(403);
  });
});

describe("mailbox proof before corporate access", () => {
  test("domain signup stays isolated until mailbox verification and cannot use demo bypass", async () => {
    const tenant = await newTenant();
    const domain = `${unique()}.test`;
    await db.domain.create({ data: { tenantId: tenant.id, domain, purpose: "AUTO_JOIN", status: "VERIFIED", token: unique() } });
    const email = `person@${domain}`;
    const response = await signupRequest(email);
    expect(response.status).toBe(200);
    const body = await response.json();
    bearerToken = body.token;
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.activeTenantId).toBeNull();
    expect((await auth.getSessionUser())?.tenantId).toBeNull();
    expect((await auth.getSessionUser())?.orgs).toEqual([]);
    expect((await onboarding.computeOnboardingState(user.id)).org).toBeNull();
    const workspace = await workspaceRoute.GET(new NextRequest("http://localhost/api/workspace/envelopes"), { params: Promise.resolve({ section: "envelopes" }) });
    expect(workspace.status).toBe(403);
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    expect((await onboardingRoute.POST(request("/api/onboarding", { op: "verify.demo" }))).status).toBe(403);
    const token = await verificationFor(email);
    expect((await onboarding.consumeVerificationToken(token))?.userId).toBe(user.id);
    expect((await auth.getSessionUser())?.tenantId).toBe(tenant.id);
    expect(await onboarding.consumeVerificationToken(token)).toBeNull();
    // Newly joined MEMBER cannot rename the company or invite an admin through onboarding.
    for (const op of ["org.update", "invite.send", "invite.revoke"]) {
      expect((await onboardingRoute.POST(request("/api/onboarding", { op, data: { name: "Hijacked", email: "attacker@example.test", role: "ADMIN" } }))).status).toBe(403);
    }
    for (const op of ["invite-member", "invite-revoke", "save-org", "create-key", "revoke-key"]) {
      expect((await workspaceRoute.POST(request("/api/workspace/settings", { op, data: { name: "Hijacked", email: "attacker@example.test", role: "ADMIN" } }), { params: Promise.resolve({ section: "settings" }) })).status).toBe(403);
    }
  });

  test("verification cannot restore disabled membership or trust a removed domain", async () => {
    for (const scenario of ["revoked-domain", "suspended-member"]) {
      const tenant = await newTenant();
      const domain = `${unique()}.test`;
      const domainRow = await db.domain.create({ data: { tenantId: tenant.id, domain, purpose: "AUTO_JOIN", status: "VERIFIED", token: unique() } });
      const email = `person@${domain}`;
      const response = await signupRequest(email);
      const { token: session } = await response.json();
      const user = await db.user.findUniqueOrThrow({ where: { email } });
      if (scenario === "revoked-domain") await db.domain.update({ where: { id: domainRow.id }, data: { status: "PENDING" } });
      else await db.member.updateMany({ where: { userId: user.id }, data: { status: "SUSPENDED" } });
      expect(await onboarding.consumeVerificationToken(await verificationFor(email))).not.toBeNull();
      expect((await auth.resolveSessionUser(session))?.tenantId).toBeNull();
    }
  });

  test("wrong-purpose, old-mailbox, expired and suspended-account proofs are rejected", async () => {
    for (const scenario of ["wrong-purpose", "old-email", "expired", "suspended"]) {
      const user = await newUser();
      const token = await onboarding.issueEmailVerification(user.id, user.email, "http://localhost");
      if (scenario === "wrong-purpose") await db.emailVerification.updateMany({ where: { userId: user.id }, data: { purpose: "PASSWORD_RESET" } });
      if (scenario === "old-email") await db.user.update({ where: { id: user.id }, data: { email: `${unique()}@changed.test` } });
      if (scenario === "expired") await db.emailVerification.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1) } });
      if (scenario === "suspended") await db.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
      expect(await onboarding.consumeVerificationToken(token)).toBeNull();
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();
    }
  });
});

describe("closed registration", () => {
  test("selfhost, private cloud and explicitly closed SaaS reject uninvited signup", async () => {
    for (const mode of ["selfhost", "private_cloud", "saas"]) {
      process.env.DOCURAMA_DEPLOYMENT_MODE = mode;
      process.env.DOCURAMA_PUBLIC_REGISTRATION = mode === "saas" ? "false" : "true";
      const before = { users: await db.user.count(), tenants: await db.tenant.count() };
      expect((await signupRequest(`${unique()}@example.test`)).status).toBe(403);
      expect(await db.user.count()).toBe(before.users);
      expect(await db.tenant.count()).toBe(before.tenants);
    }
  });

  test("closed installation accepts a valid mailbox-bound invite without creating a tenant", async () => {
    process.env.DOCURAMA_DEPLOYMENT_MODE = "private_cloud";
    process.env.DOCURAMA_PUBLIC_REGISTRATION = "false";
    const tenant = await newTenant();
    const email = `${unique()}@invited.test`;
    const inv = await db.invitation.create({ data: { tenantId: tenant.id, email, token: unique(), role: "MEMBER", invitedBy: "Administrator", expiresAt: new Date(Date.now() + 60_000) } });
    const tenantCount = await db.tenant.count();
    expect((await signupRequest(`${unique()}@wrong.test`, { inviteToken: inv.token })).status).toBe(400);
    const response = await signupRequest(email, { inviteToken: inv.token });
    expect(response.status).toBe(200);
    const { token } = await response.json();
    expect((await auth.resolveSessionUser(token))?.tenantId).toBe(tenant.id);
    expect(await db.tenant.count()).toBe(tenantCount);
    expect((await db.invitation.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("ACCEPTED");
  });

  test("existing invited accounts can accept in closed mode, but disabled memberships stay disabled", async () => {
    process.env.DOCURAMA_DEPLOYMENT_MODE = "selfhost";
    const tenant = await newTenant();
    const user = await newUser();
    bearerToken = await sessionFor(user.id);
    const invite = async () => db.invitation.create({ data: { tenantId: tenant.id, email: user.email, token: unique(), role: "MEMBER", invitedBy: "Admin", expiresAt: new Date(Date.now() + 60_000) } });
    const inv = await invite();
    expect((await invitationRoute.POST(request(`/api/invitations/${inv.token}`, {}), { params: Promise.resolve({ token: inv.token }) })).status).toBe(200);
    await db.member.updateMany({ where: { userId: user.id }, data: { status: "SUSPENDED" } });
    const blocked = await invite();
    expect((await invitationRoute.POST(request(`/api/invitations/${blocked.token}`, {}), { params: Promise.resolve({ token: blocked.token }) })).status).toBe(403);
    expect((await auth.getSessionUser())?.tenantId).toBeNull();
  });

  test("public SaaS still supports legitimate new organizations", async () => {
    const response = await signupRequest(`${unique()}@selfserve.test`);
    expect(response.status).toBe(200);
    const { token } = await response.json();
    expect((await auth.resolveSessionUser(token))?.workspaceRole).toBe("OWNER");
  });
});
