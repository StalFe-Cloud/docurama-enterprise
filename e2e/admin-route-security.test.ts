/// <reference types="bun-types" />
/** Run alone with --no-env-file. Only Next's request-context access is mocked. */
import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const scratch = mkdtempSync(join(tmpdir(), "docurama-admin-security-"));
process.env.DATABASE_URL = `file:${join(scratch, "admin.db").replace(/\\/g, "/")}`;
process.env.DOCURAMA_WORKER = "off";
process.env.NEXT_PUBLIC_DEMO_MODE = "false";
new Database(join(scratch, "admin.db"), { create: true }).close();
execFileSync("node", ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: process.env, stdio: "pipe" });
let token = "";
mock.module("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ authorization: `Bearer ${token}` }),
}));
const { db } = await import("../src/lib/db");
const hasExpandedAdmin = Prisma.dmmf.datamodel.models.find((m) => m.name === "PlatformSetting")!.fields.some((f) => f.name === "smtpPassword");
const adminRoute = await import("../src/app/api/admin/[section]/route");
const tenant = await db.tenant.create({ data: { name: "Admin fixture", slug: "admin-fixture", status: "ACTIVE" } });
const admin = await db.user.create({ data: { email: "admin@fixture.test", firstName: "Admin", lastName: "Fixture", role: "PLATFORM_ADMIN", passwordHash: "synthetic-admin-hash" } });
token = (await db.session.create({ data: { userId: admin.id, expiresAt: new Date(Date.now() + 600_000) } })).id;
const user = await db.user.create({ data: {
  email: "member@fixture.test", firstName: "Member", lastName: "Fixture", passwordHash: "synthetic-private-hash",
  totpSecret: null, totpPendingSecret: "synthetic-pending", totpRecoveryCodes: "synthetic-recovery", activeTenantId: tenant.id,
} });
await db.member.create({ data: { userId: user.id, tenantId: tenant.id, role: "MEMBER", status: "ACTIVE" } });
await db.platformSetting.create({ data: { id: "singleton", certExpiryAt: new Date(Date.now() + 86_400_000) } });
const sub = await db.subscription.create({ data: { tenantId: tenant.id, planCode: "STARTER", status: "PAST_DUE", failedPayment: true, mrrEur: 29, seats: 1, renewalAt: new Date() } });
const ctx = (section: string) => ({ params: Promise.resolve({ section }) });
const get = (section: string, query = "") => adminRoute.GET(new NextRequest(`http://localhost/api/admin/${section}${query}`), ctx(section));
const post = (section: string, op: string, id: string, data: unknown = {}) => adminRoute.POST(new NextRequest(`http://localhost/api/admin/${section}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, id, data }),
}), ctx(section));

beforeEach(async () => { await db.tenant.update({ where: { id: tenant.id }, data: { enforceTwoFactor: false } }); });
afterAll(async () => { await db.$disconnect(); mock.restore(); rmSync(scratch, { recursive: true, force: true }); });

test("tenant detail omits nested member authentication material", async () => {
  const res = await get("tenant-detail", `?id=${tenant.id}`);
  expect(res.status).toBe(200);
  const text = await res.text();
  for (const field of ["passwordHash", "totpSecret", "totpPendingSecret", "totpRecoveryCodes"]) expect(text.includes(`"${field}"`)).toBe(false);
  expect(text.includes("member@fixture.test")).toBe(true);
});

test("force 2FA requires workspace enrollment without faking an enrolled factor", async () => {
  await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 60_000) } });
  const res = await post("users", "force-2fa", user.id);
  expect(res.status).toBe(200);
  expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).totpEnabled).toBe(false);
  expect((await db.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).enforceTwoFactor).toBe(true);
  expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
});

test("payment retry cannot activate an unpaid subscription", async () => {
  const res = await post("billing", "retry-payment", sub.id);
  expect(res.status).toBe(409);
  const current = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
  expect(current.status).toBe("PAST_DUE");
  expect(current.failedPayment).toBe(true);
});

test("admin user creation requires a supplied password", async () => {
  const res = await post("users", "create", "", { email: "new@fixture.test", firstName: "New", lastName: "User" });
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(await db.user.findUnique({ where: { email: "new@fixture.test" } })).toBeNull();
});

test("manual approval cannot activate an unsettled provider-managed payment", async () => {
  const payment = await db.payment.create({ data: {
    tenantId: tenant.id, provider: "stripe", kind: "checkout", planCode: "STARTER",
    amountCents: 2900, description: "Synthetic pending provider payment", status: "PENDING",
  } });
  const res = await post("billing", "payment.approve", payment.id, { note: "Synthetic operator note" });
  expect(res.status).toBe(409);
  expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PENDING");
});

test("admin profile updates cannot fabricate MFA enrollment", async () => {
  const res = await post("users", "update", user.id, { totpEnabled: true });
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).totpEnabled).toBe(false);
});

test("unimplemented plan editing does not advertise a successful catalog change", async () => {
  const res = await post("billing", "create-plan", "", { code: "FIXTURE", name: "Fixture", monthlyEur: 1 });
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(await db.plan.findUnique({ where: { code: "FIXTURE" } })).toBeNull();
});

test("integration listings exclude stored API and webhook secrets", async () => {
  await db.apiKey.create({ data: { tenantId: tenant.id, name: "Fixture key", prefix: "fixture", secretHash: "synthetic-key-hash", createdBy: "Fixture" } });
  await db.webhookEndpoint.create({ data: { tenantId: tenant.id, url: "https://receiver.example.test", events: "*", secretMasked: "fixture-preview", secret: "synthetic-webhook-secret" } });
  const res = await get("integrations");
  expect(res.status).toBe(200);
  const text = await res.text();
  for (const marker of ["synthetic-key-hash", "synthetic-webhook-secret", '"secretHash"', '"secret"']) expect(text.includes(marker)).toBe(false);
  expect(text.includes("fixture-preview")).toBe(true);
});

test("DSAR export GET preserves workflow state; completion requires explicit POST", async () => {
  const dsar = await db.dsarRequest.create({ data: { type: "ACCESS", subjectEmail: user.email, status: "RUNNING", dueAt: new Date(Date.now() + 86_400_000) } });
  expect((await get("dsar-export", `?id=${dsar.id}`)).status).toBe(200);
  const exported = await db.dsarRequest.findUniqueOrThrow({ where: { id: dsar.id } });
  expect(exported.status).toBe("RUNNING");
  expect(exported.completedAt).toBeNull();
  expect((await post("legal", "complete-dsar", dsar.id)).status).toBe(200);
  expect((await db.dsarRequest.findUniqueOrThrow({ where: { id: dsar.id } })).status).toBe("COMPLETED");
});

test.skipIf(!hasExpandedAdmin)("overview/settings/health exclude persisted SMTP credentials", async () => {
  await db.$executeRaw`UPDATE "PlatformSetting" SET "smtpPassword" = ${"synthetic-smtp-secret"} WHERE "id" = ${"singleton"}`;
  for (const section of ["overview", "settings", "health"]) {
    const res = await get(section);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.includes("synthetic-smtp-secret")).toBe(false);
    expect(text.includes('"smtpPassword"')).toBe(false);
  }
});

test.skipIf(!hasExpandedAdmin)("successful admin user creation and update exclude credentials", async () => {
  const create = await post("users", "create", "", { email: "safe@fixture.test", firstName: "Safe", lastName: "Fixture", password: "SyntheticFixturePass123" });
  expect(create.status).toBe(200);
  const created = await create.json();
  expect(created.user.email).toBe("safe@fixture.test");
  expect(Object.hasOwn(created.user, "passwordHash")).toBe(false);
  const update = await post("users", "update", created.user.id, { firstName: "Changed" });
  expect(update.status).toBe(200);
  const updated = await update.json();
  expect(updated.user.firstName).toBe("Changed");
  for (const field of ["passwordHash", "totpSecret", "totpPendingSecret", "totpRecoveryCodes"]) expect(Object.hasOwn(updated.user, field)).toBe(false);
});
