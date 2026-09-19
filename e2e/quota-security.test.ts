/// <reference types="bun-types" />

/** Hermetic, own process: bun test e2e/quota-security.test.ts. */
import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { NextRequest } from "next/server";
import { createHash } from "node:crypto";

const scratch = mkdtempSync(join(tmpdir(), "docurama-quota-security-"));
const dbPath = join(scratch, "quota.db");
new Database(dbPath, { create: true }).close();
process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, "/")}`;
execFileSync("node", ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: process.env, stdio: "pipe" });
const { db } = await import("../src/lib/db");
const billing = await import("../src/lib/billing");
const { createInvitation } = await import("../src/lib/onboarding");
const { resolveSessionUser } = await import("../src/lib/auth");
const { postSettingsOp } = await import("../src/lib/settings-handlers");
const api = await import("../src/app/api/v1/[...path]/route");
const mcp = await import("../src/app/api/mcp/route");
let counter = 0;
const unique = () => `quota-${++counter}`;
async function fixture(planCode = "STARTER") {
  const tenant = await db.tenant.create({ data: { name: "Quota fixture", slug: unique(), planCode, status: "ACTIVE" } });
  const user = await db.user.create({ data: { email: `${unique()}@example.test`, firstName: "Quota", lastName: "Owner", passwordHash: "unused", activeTenantId: tenant.id } });
  await db.member.create({ data: { userId: user.id, tenantId: tenant.id, role: "OWNER" } });
  return { tenant, user };
}
afterAll(async () => { await db.$disconnect(); rmSync(scratch, { recursive: true, force: true }); });

describe("lazy manual renewal", () => {
  test("a read renews an expired manual subscription once and carries unused allowance", async () => {
    const { tenant, user } = await fixture();
    const renewalAt = new Date(Date.now() - 86_400_000);
    const sub = await db.subscription.create({ data: { tenantId: tenant.id, planCode: "STARTER", renewalAt, provider: "manual", termMonths: 1 } });
    await db.envelope.create({ data: { tenantId: tenant.id, createdById: user.id, publicCode: unique(), title: "Last period", createdAt: new Date(renewalAt.getTime() - 86_400_000) } });
    const before = await billing.currentAllowance(tenant.id);
    expect(before.carriedForward).toBe(99);
    expect(before.total).toBe(199);
    expect(before.used).toBe(0);
    const after = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(after.renewalAt > new Date()).toBe(true);
    expect(await billing.currentAllowance(tenant.id)).toEqual(before);
    expect(await db.auditEvent.count({ where: { action: "subscription.renewed", resource: `subscription:${sub.id}` } })).toBe(1);
  });

  test("concurrent readers cannot double-renew or duplicate audit records", async () => {
    const { tenant } = await fixture();
    const sub = await db.subscription.create({ data: { tenantId: tenant.id, planCode: "STARTER", renewalAt: new Date(Date.now() - 86_400_000), provider: "manual" } });
    const values = await Promise.all([billing.currentAllowance(tenant.id), billing.currentAllowance(tenant.id)]);
    expect(values[0].total).toBe(200);
    expect(values[1].total).toBe(200);
    expect(await db.auditEvent.count({ where: { resource: `subscription:${sub.id}` } })).toBe(1);
  });

  test("Stripe subscriptions never advance from an allowance read", async () => {
    const { tenant } = await fixture();
    const renewalAt = new Date(Date.now() - 86_400_000);
    const sub = await db.subscription.create({ data: { tenantId: tenant.id, planCode: "STARTER", renewalAt, provider: "stripe", providerRef: "sub_local_test" } });
    await billing.currentAllowance(tenant.id);
    expect((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).renewalAt).toEqual(renewalAt);
    expect(await db.auditEvent.count({ where: { resource: `subscription:${sub.id}` } })).toBe(0);
  });
});

describe("seat reservations", () => {
  test("pending verification reserves capacity; disabled membership and expired invites do not", async () => {
    const { tenant } = await fixture("BUSINESS");
    for (const status of ["PENDING_VERIFICATION", "SUSPENDED"]) {
      const user = await db.user.create({ data: { email: `${unique()}@example.test`, firstName: "Seat", lastName: "User", passwordHash: "unused" } });
      await db.member.create({ data: { tenantId: tenant.id, userId: user.id, status } });
    }
    for (const offset of [60_000, -60_000]) {
      await db.invitation.create({ data: { tenantId: tenant.id, email: `${unique()}@example.test`, token: unique(), invitedBy: "Owner", expiresAt: new Date(Date.now() + offset) } });
    }
    const seats = await billing.seatCapacity(tenant.id);
    expect(seats.members).toBe(2);
    expect(seats.pendingInvites).toBe(1);
    expect(seats.remaining).toBe(7);
  });

  test("concurrent invites cannot overbook the final seat and refresh keeps one reservation", async () => {
    const { tenant, user } = await fixture();
    const other = await db.user.create({ data: { email: `${unique()}@example.test`, firstName: "Seat", lastName: "User", passwordHash: "unused" } });
    await db.member.create({ data: { tenantId: tenant.id, userId: other.id } });
    const invite = (email: string) => createInvitation({ tenantId: tenant.id, email, role: "MEMBER", invitedBy: "Owner", invitedById: user.id, origin: "http://localhost" });
    const results = await Promise.all([invite("first@example.test"), invite("second@example.test")]);
    expect(results.filter(Boolean).length).toBe(1);
    const winner = results.find(Boolean)!;
    const refreshed = await invite(winner.email);
    expect(refreshed?.id).toBe(winner.id);
    expect(refreshed?.token).not.toBe(winner.token);
    expect((await billing.seatCapacity(tenant.id)).used).toBe(3);
    expect(await invite("third@example.test")).toBeNull();
  });
});

describe("API entitlements", () => {
  test("Starter cannot issue keys; Business can, and existing keys stop working after downgrade", async () => {
    const { tenant, user } = await fixture();
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 60_000) } });
    const me = (await resolveSessionUser(session.id))!;
    const request = new NextRequest("http://localhost/api/workspace/settings", { method: "POST" });
    const body = { op: "create-key", data: { name: "Test integration", scope: "FULL" } };
    expect((await postSettingsOp(me, body, request)).status).toBe(403);
    expect(await db.apiKey.count({ where: { tenantId: tenant.id } })).toBe(0);
    await db.tenant.update({ where: { id: tenant.id }, data: { planCode: "BUSINESS" } });
    const issued = await postSettingsOp(me, body, request);
    expect(issued.status).toBe(200);
    const { key } = await issued.json();
    const read = () => api.GET(new NextRequest("http://localhost/api/v1/envelopes", { headers: { "x-api-key": key } }), { params: Promise.resolve({ path: ["envelopes"] }) });
    expect((await read()).status).toBe(200);
    await db.tenant.update({ where: { id: tenant.id }, data: { planCode: "STARTER" } });
    expect((await read()).status).toBe(403);
    expect((await mcp.POST(new NextRequest("http://localhost/api/mcp", { method: "POST", headers: { "x-api-key": key }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) }))).status).toBe(403);
    const stored = await db.apiKey.findFirstOrThrow({ where: { tenantId: tenant.id } });
    expect(stored.secretHash).toBe(createHash("sha256").update(key).digest("hex"));
    const publicVerify = await api.GET(new NextRequest("http://localhost/api/v1/verify/UNKNOWN"), { params: Promise.resolve({ path: ["verify", "UNKNOWN"] }) });
    expect(publicVerify.status).toBe(200);
  });
});
