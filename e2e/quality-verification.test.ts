/// <reference types="bun-types" />
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { currentAllowance, reserveEnvelopeAllowance } from "../src/lib/billing";
import { monthlyWindow, shiftUtcMonth } from "../src/lib/monthly-period";
import { serializableTransaction } from "../src/lib/transaction";
import { db } from "../src/lib/db";
import { hashPasswordAsync } from "../src/lib/password-async";
import { queueEnvelopeEvent, retryFailedDeliveries } from "../src/lib/webhooks";

// Never repoint these tests at customer data. The workflow creates this database.
const url = process.env.DATABASE_URL ?? "";
if (process.env.DOCURAMA_VERIFICATION_DATABASE !== "1" ||
    !(url.startsWith("file:") && url.includes("quality-verification") ||
      url.startsWith("postgresql:") && new URL(url).pathname === "/docurama_verification")) {
  throw new Error("Use an explicitly opted-in disposable quality-verification database");
}
const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const direct = new PrismaClient();
const tenantIds: string[] = [];
const userIds: string[] = [];
const receipts: Array<{ headers: Headers; body: string }> = [];
let receiver: ReturnType<typeof Bun.serve>;
let receiveStatus = 200;
let receiveDelay = 0;
let onReceive: (() => void) | undefined;
let releaseRequest: Promise<void> | undefined;
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPasswordAsync("DisposableVerificationPassword123!");
  receiver = Bun.serve({ hostname: "127.0.0.1", port: 3501, async fetch(req) {
    receipts.push({ headers: req.headers, body: await req.text() });
    onReceive?.();
    if (receiveDelay) await Bun.sleep(receiveDelay);
    if (releaseRequest) await releaseRequest;
    return new Response("fixture", { status: receiveStatus });
  } });
});

afterAll(async () => {
  receiver?.stop(true);
  await direct.envelopeQuotaUsage.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await direct.auditEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await direct.securityEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await direct.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await direct.user.deleteMany({ where: { id: { in: userIds } } });
  await direct.$disconnect();
  await db.$disconnect();
});

async function fixture(limit = 100, role = "OWNER") {
  const unique = randomUUID();
  const tenant = await direct.tenant.create({ data: { name: `Verification ${unique}`, slug: `verify-${unique}`, planCode: "STARTER", status: "ACTIVE" } });
  tenantIds.push(tenant.id);
  const user = await direct.user.create({ data: { email: `verify-${unique}@example.test`, firstName: "Identical", lastName: "Name", passwordHash, activeTenantId: tenant.id, status: "ACTIVE" } });
  userIds.push(user.id);
  const member = await direct.member.create({ data: { tenantId: tenant.id, userId: user.id, role, status: "ACTIVE" } });
  const now = new Date();
  const subscription = await direct.subscription.create({ data: {
    tenantId: tenant.id, planCode: "STARTER", provider: "manual", status: "ACTIVE", termMonths: 1,
    envelopeLimitOverride: limit, renewalAt: shiftUtcMonth(now, 1), paymentAnchorAt: now,
    usageAnchorAt: now, usagePeriodStart: now, usagePeriodEnd: shiftUtcMonth(now, 1),
  } });
  const session = await direct.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) } });
  return { tenant, user, member, subscription, token: session.id };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function anotherMember(owner: Fixture, role: string) {
  const unique = randomUUID();
  const user = await direct.user.create({ data: { email: `verify-${unique}@example.test`, firstName: "Other", lastName: "Member", passwordHash, activeTenantId: owner.tenant.id } });
  userIds.push(user.id);
  const member = await direct.member.create({ data: { tenantId: owner.tenant.id, userId: user.id, role } });
  const session = await direct.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 3_600_000) } });
  return { user, member, token: session.id };
}
async function request(path: string, token?: string, body?: unknown) {
  const response = await fetch(`${BASE}${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  const text = await response.text();
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(text); } catch { throw new Error(`Non-JSON response (${response.status}) for ${path}: ${text.slice(0, 300)}`); }
  return { status: response.status, body: parsed };
}
const settings = (token: string, op: string, id = "", data: unknown = {}) => request("/api/workspace/settings", token, { op, id, data });
const send = (f: Fixture, title = `Concurrency ${randomUUID()}`) => request("/api/workspace/envelopes", f.token, {
  op: "send", data: { title, recipients: [{ name: "Fixture Signer", email: "signer@example.test" }] },
});
async function endpoint(f: Fixture, events = "*") {
  return direct.webhookEndpoint.create({ data: { tenantId: f.tenant.id, url: `http://127.0.0.1:${receiver.port}/hooks`, events, secret: "fixture-secret-not-a-credential", secretMasked: "test", status: "ACTIVE" } });
}
async function latestEnvelope(f: Fixture) {
  return direct.envelope.findFirstOrThrow({ where: { tenantId: f.tenant.id }, orderBy: { createdAt: "desc" }, include: { recipients: true } });
}

// Exercise real HTTP routes, not mocked authentication or extracted handler bodies.
describe("HTTP settings authorization and audit isolation", () => {
  test("members cannot remove administrators or revoke another user's certificate", async () => {
    const owner = await fixture();
    const admin = await anotherMember(owner, "ADMIN");
    const member = await anotherMember(owner, "MEMBER");
    expect((await settings(member.token, "remove-member", admin.member.id)).status).toBe(403);
    expect(await direct.member.findUnique({ where: { id: admin.member.id } })).not.toBeNull();
    const certificate = await direct.signingCertificate.create({ data: {
      tenantId: owner.tenant.id, userId: owner.user.id, commonName: "Fixture certificate", status: "ISSUED",
      purpose: "signing", serialNumber: "fixture", thumbprint: "fixture", issuer: "fixture",
      notBefore: new Date(), notAfter: new Date(Date.now() + 86_400_000),
    } });
    expect((await settings(member.token, "cert.revoke", certificate.id)).status).toBe(403);
    expect((await direct.signingCertificate.findUniqueOrThrow({ where: { id: certificate.id } })).status).toBe("ISSUED");
    expect((await settings(admin.token, "cert.revoke", certificate.id)).status).toBe(200);
    expect((await settings(owner.token, "remove-member", member.member.id)).status).toBe(200);
  });

  test("cross-tenant member targets and revoked memberships cannot mutate", async () => {
    const a = await fixture();
    const b = await fixture();
    const target = await anotherMember(b, "ADMIN");
    expect((await settings(a.token, "remove-member", target.member.id)).status).toBe(404);
    expect(await direct.member.findUnique({ where: { id: target.member.id } })).not.toBeNull();
    await direct.member.delete({ where: { id: a.member.id } });
    expect((await send(a)).status).toBe(403);
    expect(await direct.envelope.count({ where: { tenantId: a.tenant.id } })).toBe(0);
  });

  test("identical display names and profile renames never disclose another account's events", async () => {
    const a = await fixture();
    const b = await fixture();
    for (const f of [a, b]) {
      await direct.auditEvent.create({ data: { actor: "Identical Name", actorUserId: f.user.id, tenantId: f.tenant.id,
        actorRole: "MEMBER", action: "fixture.audit", resource: `user:${f.user.email}`, detail: f.tenant.id, ip: "unknown" } });
      await direct.securityEvent.create({ data: { actor: "Identical Name", actorUserId: f.user.id, tenantId: f.tenant.id,
        type: "FIXTURE", detail: f.tenant.id, ip: "unknown" } });
    }
    await direct.auditEvent.create({ data: { actor: "Identical Name", actorRole: "MEMBER", action: "legacy.ambiguous", resource: "unknown", detail: "LEGACY-MUST-STAY-RESTRICTED", ip: "unknown" } });
    await settings(a.token, "save-profile", "", { firstName: "Identical", lastName: "Name" });
    const read = await request("/api/workspace/settings-account", a.token);
    expect(read.status).toBe(200);
    const output = JSON.stringify(read.body);
    expect(output).toContain(a.tenant.id);
    expect(output).not.toContain(b.tenant.id);
    expect(output).not.toContain("LEGACY-MUST-STAY-RESTRICTED");
  });
});

describe("atomic quota and lifecycle actions", () => {
  test("competing HTTP sends commit exactly one final quota slot", async () => {
    const f = await fixture(1);
    const ep = await endpoint(f, "envelope.sent");
    const results = await Promise.all(Array.from({ length: 6 }, () => send(f)));
    expect(results.filter((item) => item.status === 200)).toHaveLength(1);
    expect(results.filter((item) => item.status === 402)).toHaveLength(5);
    expect(await direct.envelope.count({ where: { tenantId: f.tenant.id } })).toBe(1);
    expect(await direct.recipient.count({ where: { envelope: { tenantId: f.tenant.id } } })).toBe(1);
    expect(await direct.webhookDelivery.count({ where: { endpointId: ep.id } })).toBe(1);
    expect((await currentAllowance(f.tenant.id)).used).toBe(1);
  });

  test("a failed transaction releases quota and leaves no mail or webhook rows", async () => {
    const f = await fixture(1);
    const ep = await endpoint(f);
    const subject = randomUUID();
    await expect(serializableTransaction(async (tx) => {
      expect(await reserveEnvelopeAllowance(f.tenant.id, tx)).not.toBeNull();
      await tx.mailOutbox.create({ data: { toEmail: "rollback@example.test", subject, template: "TEST", bodyText: "rollback" } });
      await queueEnvelopeEvent(tx, f.tenant.id, "envelope.sent", { code: "DOC-ROLLBACK", title: "Rollback", status: "SENT" });
      throw new Error("Injected transaction failure");
    })).rejects.toThrow("Injected transaction failure");
    expect((await currentAllowance(f.tenant.id)).used).toBe(0);
    expect(await direct.mailOutbox.count({ where: { subject } })).toBe(0);
    expect(await direct.webhookDelivery.count({ where: { endpointId: ep.id } })).toBe(0);
  });

  test("duplicate views and competing signatures produce one committed lifecycle event", async () => {
    const f = await fixture();
    const ep = await endpoint(f);
    expect((await send(f)).status).toBe(200);
    const e = await latestEnvelope(f);
    const path = `/api/sign/${e.recipients[0].accessToken}`;
    const views = await Promise.all([request(path, undefined, { op: "view" }), request(path, undefined, { op: "view" })]);
    expect(views.every((item) => item.status === 200)).toBe(true);
    expect(await direct.envelopeEvent.count({ where: { envelopeId: e.id, action: "VIEWED" } })).toBe(1);
    const signed = await Promise.all([request(path, undefined, { op: "sign", name: "Fixture Signer" }), request(path, undefined, { op: "sign", name: "Fixture Signer" })]);
    expect(signed.map((item) => item.status).sort()).toEqual([200, 409]);
    expect((await direct.envelope.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("COMPLETED");
    for (const action of ["SIGNED", "SEALED"]) expect(await direct.envelopeEvent.count({ where: { envelopeId: e.id, action } })).toBe(1);
    for (const event of ["envelope.sent", "envelope.viewed", "envelope.signed", "envelope.completed"]) {
      expect(await direct.webhookDelivery.count({ where: { endpointId: ep.id, event } })).toBe(1);
    }
    expect((await request("/api/workspace/envelopes", f.token, { op: "void", id: e.id, data: { reason: "too late" } })).status).toBe(400);
  });

  test("reminders queue real messages once under contention; void and decline are durable", async () => {
    const f = await fixture();
    const ep = await endpoint(f);
    expect((await send(f)).status).toBe(200);
    const e = await latestEnvelope(f);
    const reminders = await Promise.all([0, 1].map(() => request("/api/workspace/envelopes", f.token, { op: "remind", id: e.id })));
    expect(reminders.map((item) => item.status).sort()).toEqual([200, 400]);
    expect(await direct.mailOutbox.count({ where: { template: "REMINDER", linkUrl: { contains: e.recipients[0].accessToken! } } })).toBe(1);
    expect((await request("/api/workspace/envelopes", f.token, { op: "void", id: e.id, data: { reason: "Fixture cancellation" } })).status).toBe(200);
    expect(await direct.webhookDelivery.count({ where: { endpointId: ep.id, event: "envelope.voided" } })).toBe(1);
    expect((await request(`/api/sign/${e.recipients[0].accessToken}`, undefined, { op: "sign", name: "Too Late" })).status).toBe(409);
    expect((await send(f)).status).toBe(200);
    const other = await latestEnvelope(f);
    expect((await request(`/api/sign/${other.recipients[0].accessToken}`, undefined, { op: "decline", reason: "Fixture rejection" })).status).toBe(200);
    expect(await direct.webhookDelivery.count({ where: { endpointId: ep.id, event: "envelope.declined" } })).toBe(1);
  });
});

describe("monthly entitlements independent of paid terms", () => {
  for (const term of [1, 3, 6, 12]) test(`${term}-month commitment refreshes at each UTC anniversary without month-end drift`, async () => {
    const f = await fixture(3);
    const anchor = new Date("2026-01-31T12:00:00.000Z");
    await direct.subscription.update({ where: { id: f.subscription.id }, data: {
      provider: "stripe", providerRef: `sub_fixture_${randomUUID()}`, termMonths: term,
      paymentAnchorAt: anchor, renewalAt: shiftUtcMonth(anchor, term), usageAnchorAt: anchor,
      usagePeriodStart: anchor, usagePeriodEnd: shiftUtcMonth(anchor, 1), carriedForwardEnvelopes: 0,
    } });
    for (let i = 0; i < 2; i++) await direct.envelope.create({ data: { tenantId: f.tenant.id, createdById: f.user.id,
      publicCode: randomUUID(), title: "First monthly window", createdAt: new Date("2026-02-01T12:00:00Z") } });
    const feb = shiftUtcMonth(anchor, 1);
    expect(feb.toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(await currentAllowance(f.tenant.id, feb)).toEqual({ limit: 3, carriedForward: 1, total: 4, used: 0, remaining: 4 });
    for (let i = 0; i < 4; i++) await direct.envelope.create({ data: { tenantId: f.tenant.id, createdById: f.user.id,
      publicCode: randomUUID(), title: "Second monthly window", createdAt: new Date("2026-03-01T12:00:00Z") } });
    const march = shiftUtcMonth(anchor, 2);
    expect(march.toISOString()).toBe("2026-03-31T12:00:00.000Z");
    expect((await currentAllowance(f.tenant.id, march)).total).toBe(3);
    expect((await direct.subscription.findUniqueOrThrow({ where: { id: f.subscription.id } })).renewalAt).toEqual(shiftUtcMonth(anchor, term));
    expect(monthlyWindow({ renewalAt: shiftUtcMonth(anchor, term), termMonths: term, usageAnchorAt: anchor }, march).start).toEqual(march);
  });
});

describe("durable webhook claims and retry identity", () => {
  test("two processors cannot send the same claimed row", async () => {
    const f = await fixture();
    const ep = await endpoint(f);
    const [id] = await serializableTransaction((tx) => queueEnvelopeEvent(tx, f.tenant.id, "envelope.sent", { code: "DOC-CLAIM", title: "Claim", status: "SENT" }));
    receiveDelay = 100;
    try { await Promise.all([retryFailedDeliveries(100), retryFailedDeliveries(100)]); } finally { receiveDelay = 0; }
    expect(receipts.filter((item) => item.headers.get("x-docurama-delivery") === id)).toHaveLength(1);
    expect((await direct.webhookDelivery.findUniqueOrThrow({ where: { id } })).attempts).toBe(1);
    await direct.webhookEndpoint.update({ where: { id: ep.id }, data: { status: "PAUSED" } });
  });

  test("legacy payload UUID stays stable across a failed attempt and retry", async () => {
    const f = await fixture();
    const ep = await endpoint(f);
    const publicId = randomUUID();
    const payload = JSON.stringify({ id: publicId, event: "envelope.sent", data: { code: "DOC-LEGACY" } });
    const row = await direct.webhookDelivery.create({ data: { endpointId: ep.id, event: "envelope.sent", payload,
      statusCode: 0, durationMs: 0, success: false, attempts: 0, nextAttemptAt: new Date(0) } });
    receiveStatus = 503;
    try { await retryFailedDeliveries(100); } finally { receiveStatus = 200; }
    await direct.webhookDelivery.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(0) } });
    await retryFailedDeliveries(100);
    const seen = receipts.filter((item) => item.headers.get("x-docurama-delivery") === publicId);
    expect(seen).toHaveLength(2);
    expect(seen[0].body).toBe(payload);
    expect(seen[1].body).toBe(payload);
    expect(seen[0].headers.get("x-docurama-signature")).toBe(seen[1].headers.get("x-docurama-signature"));
    expect((await direct.webhookDelivery.findUniqueOrThrow({ where: { id: row.id } })).success).toBe(true);
  });

  test("a stale claimant cannot overwrite a successor's acknowledgement", async () => {
    const f = await fixture();
    await endpoint(f);
    const [id] = await serializableTransaction((tx) => queueEnvelopeEvent(tx, f.tenant.id, "envelope.sent", { code: "DOC-FENCE", title: "Fence", status: "SENT" }));
    let arrived!: () => void;
    const arrival = new Promise<void>((resolve) => { arrived = resolve; });
    let release!: () => void;
    releaseRequest = new Promise<void>((resolve) => { release = resolve; });
    onReceive = arrived;
    const processing = retryFailedDeliveries(100);
    try {
      await Promise.race([arrival, Bun.sleep(10_000).then(() => { throw new Error("Receiver never observed the claimed request"); })]);
      await direct.webhookDelivery.update({ where: { id }, data: { claimToken: "successor-token", attempts: 2, success: true, statusCode: 202 } });
    } finally { onReceive = undefined; release(); releaseRequest = undefined; }
    await processing;
    const saved = await direct.webhookDelivery.findUniqueOrThrow({ where: { id } });
    expect(saved.statusCode).toBe(202);
    expect(saved.attempts).toBe(2);
    expect(saved.claimToken).toBe("successor-token");
  });

  test("expired claims are recovered, but exhausted attempts never send again", async () => {
    const f = await fixture();
    await endpoint(f);
    const [id] = await serializableTransaction((tx) => queueEnvelopeEvent(tx, f.tenant.id, "envelope.sent", { code: "DOC-RECOVER", title: "Recover", status: "SENT" }));
    await direct.webhookDelivery.update({ where: { id }, data: { claimToken: "dead-worker", claimUntil: new Date(0), attempts: 1 } });
    await retryFailedDeliveries(100);
    expect((await direct.webhookDelivery.findUniqueOrThrow({ where: { id } })).attempts).toBe(2);
    const before = receipts.filter((item) => item.headers.get("x-docurama-delivery") === id).length;
    await direct.webhookDelivery.update({ where: { id }, data: { success: false, attempts: 5, nextAttemptAt: new Date(0), claimUntil: new Date(0) } });
    await retryFailedDeliveries(100);
    expect(receipts.filter((item) => item.headers.get("x-docurama-delivery") === id)).toHaveLength(before);
    expect((await direct.webhookDelivery.findUniqueOrThrow({ where: { id } })).nextAttemptAt).toBeNull();
  });
});
