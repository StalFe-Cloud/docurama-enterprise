import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

// Actual route callbacks, synthetic persistence only. This fixture does not
// establish database isolation, SMTP delivery, or browser behavior.
let envelope: any;
let recipients: any[] = [];
let outbox: any[] = [];
let events: any[] = [];
let hooks: any[] = [];
const me = { id: "sender", tenantId: "tenant", firstName: "Synthetic", lastName: "Sender", email: "sender@example.test", role: "ADMIN", tenantName: "Fixture" };
const template = { id: "template", name: "Synthetic agreement", version: "1.0", bodyMarkdown: "Synthetic agreement terms.", pages: 1 };
const clone = (value: any) => structuredClone(value);
const hydrated = () => ({ ...clone(envelope), recipients: clone(recipients), createdBy: me, tenant: { status: "ACTIVE", esignPrefs: { requireReauth: false, part11Mode: false } } });
const db: any = {
  member: { findFirst: async () => ({ id: "membership" }) },
  template: { findFirst: async () => template, update: async () => template },
  document: { findFirst: async () => null },
  domain: { findFirst: async () => null },
  tenant: { findUnique: async () => ({ id: "tenant", name: "Fixture" }) },
  envelope: {
    create: async ({ data }: any) => (envelope = { id: "envelope", reminderCount: 0, lastRemindedAt: null, ...data }),
    findFirst: async ({ where }: any) => envelope && where.tenantId === "tenant" ? hydrated() : null,
    findUnique: async () => hydrated(),
    update: async ({ data }: any) => { Object.assign(envelope, data); return clone(envelope); },
  },
  recipient: {
    createMany: async ({ data }: any) => { recipients = data.map((r: any, i: number) => ({ id: `recipient-${i}`, authMethod: "EMAIL_LINK", signedAt: null, ...r })); return { count: data.length }; },
    findUnique: async ({ where }: any) => { const r = recipients.find(r => r.accessToken === where.accessToken); return r ? { ...clone(r), envelope: hydrated() } : null; },
    findMany: async ({ where }: any = {}) => clone(recipients.filter(r => !where?.role || r.role === where.role)),
    update: async ({ where, data }: any) => { const r = recipients.find(r => r.id === where.id); Object.assign(r, data); return clone(r); },
    updateMany: async ({ where, data }: any) => { const r = recipients.find(r => r.id === where.id && (!where.status || r.status === where.status)); if (!r) return { count: 0 }; Object.assign(r, data); return { count: 1 }; },
  },
  mailOutbox: {
    createMany: async ({ data }: any) => { outbox.push(...clone(data)); return { count: data.length }; },
    create: async ({ data }: any) => { outbox.push(clone(data)); return data; },
  },
  envelopeEvent: {
    createMany: async ({ data }: any) => { events.push(...clone(data)); return { count: data.length }; },
    create: async ({ data }: any) => { events.push(clone(data)); return data; },
    findMany: async () => clone(events),
  },
  auditEvent: { create: async () => ({}) },
};
mock.module("@/lib/db", () => ({ db }));
mock.module("@/lib/transaction", () => ({ serializableTransaction: async (work: any) => work(db) }));
mock.module("@/lib/auth", () => ({ requireUser: async () => me }));
mock.module("@/lib/billing", () => ({ currentAllowance: async () => ({}), reserveEnvelopeAllowance: async () => true }));
mock.module("@/lib/webhooks", () => ({ queueEnvelopeEvent: async (_tx: any, _tenant: any, name: any, data: any) => { hooks.push({ name, data }); }, retryFailedDeliveries: async () => ({}) }));
mock.module("@/lib/mail", () => ({ processOutbox: async () => ({}) }));
mock.module("@/lib/attestation", () => ({ pushAttestationForEnvelope: async () => ({ pushed: false, note: "synthetic fixture" }) }));
mock.module("@/lib/transparency", () => ({ appendSealCommitment: async () => ({}) }));
mock.module("../src/app/api/workspace/[section]/route", () => ({ GET: async () => new Response("unused") }));
const sendRoute = await import("../src/app/api/workspace/envelopes/route");
const signRoute = await import("../src/app/api/sign/[token]/route");
beforeEach(() => { envelope = null; recipients = []; outbox = []; events = []; hooks = []; });
const request = (path: string, body: any) => new NextRequest(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const send = () => sendRoute.POST(request("/api/workspace/envelopes", { op: "send", data: { title: "Fixture contract", templateId: "template", recipients: [ { name: "Alpha", email: "alpha@example.test", role: "SIGNER" }, { name: "Beta", email: "beta@example.test", role: "SIGNER" }, { name: "Copy", email: "copy@example.test", role: "CC" } ] } }));
const sign = (index: number, extra: any = {}) => signRoute.POST(request("/api/sign/fixture", { op: "sign", name: recipients[index].name, font: "caveat", consentAccepted: true, consent: true, ...extra }), { params: Promise.resolve({ token: recipients[index].accessToken }) });
const mails = (template: string) => outbox.filter(row => row.template === template);
const effects = () => ({ events: clone(events), hooks: clone(hooks), outbox: clone(outbox) });

test("sequential send queues first signer and copy notice, not second signer", async () => {
  expect((await send()).status).toBe(200);
  expect(mails("SIGN_INVITE").map(r => r.toEmail)).toEqual(["alpha@example.test"]);
  expect(mails("COPY_NOTICE").map(r => r.toEmail)).toEqual(["copy@example.test"]);
  expect(events.filter(e => e.action === "VIEWED")).toHaveLength(0);
});
test("later signer cannot sign early or create side effects", async () => {
  await send(); const before = effects(); expect((await sign(1)).status).toBe(409); expect(effects()).toEqual(before);
});
test("reminder targets only the signer whose turn is active", async () => {
  await send(); const response = await sendRoute.POST(request("/api/workspace/envelopes", { op: "remind", id: envelope.id }));
  expect(response.status).toBe(200); expect(mails("REMINDER").map(r => r.toEmail)).toEqual(["alpha@example.test"]);
});
test("first signature waits and queues exactly one next invitation plus own receipt", async () => {
  await send(); const response = await sign(0); expect(response.status).toBe(200);
  expect((await response.json()).envelopeStatus).toBe("PARTIALLY_SIGNED");
  expect(mails("SIGN_INVITE").map(r => r.toEmail)).toEqual(["alpha@example.test", "beta@example.test"]);
  expect(mails("SIGN_RECEIPT").map(r => r.toEmail)).toEqual(["alpha@example.test"]);
  expect(mails("SIGN_COMPLETED")).toHaveLength(0);
  const before = effects(); expect((await sign(0)).status).toBe(409); expect(effects()).toEqual(before);
});
test("completion waits for both signers, includes CC and sender once, repeat has no effects", async () => {
  await send(); await sign(0); expect(envelope.completedAt).toBeUndefined();
  const response = await sign(1); expect(response.status).toBe(200); const body = await response.json();
  expect(body.sealed).toBe(true); expect(body.envelopeStatus).toBe("COMPLETED");
  expect(recipients[2].status).toBe("PENDING");
  expect(mails("SIGN_COMPLETED").map(r => r.toEmail).sort()).toEqual(["alpha@example.test", "beta@example.test", "copy@example.test", "sender@example.test"].sort());
  expect(hooks.filter(h => h.name === "envelope.completed")).toHaveLength(1);
  const before = effects(); expect((await sign(1)).status).toBe(409); expect(effects()).toEqual(before);
});
test("view is an opened-link event exactly once, never SMTP delivery evidence", async () => {
  await send(); const token = recipients[0].accessToken;
  for (let i = 0; i < 2; i++) expect((await signRoute.POST(request("/api/sign/fixture", { op: "view" }), { params: Promise.resolve({ token }) })).status).toBe(200);
  expect(events.filter(e => e.action === "VIEWED")).toHaveLength(1);
  expect(events.filter(e => ["DELIVERED", "EMAIL_DELIVERED"].includes(e.action))).toHaveLength(0);
});
test("copy token cannot sign or trigger invitations and completion", async () => {
  await send(); const before = effects(); expect((await sign(2)).status).toBe(409); expect(effects()).toEqual(before);
});
test("unaccepted disclosure cannot sign or create workflow side effects", async () => {
  await send(); const before = effects(); expect((await sign(0, { consent: false })).status).toBe(400); expect(effects()).toEqual(before);
  expect(recipients[0].status).toBe("PENDING");
});
test("invalid token cannot alter recipients or queue mail", async () => {
  await send(); const before = effects();
  const response = await signRoute.POST(request("/api/sign/invalid", { op: "sign", name: "Stranger", consentAccepted: true, consent: true }), { params: Promise.resolve({ token: "not-a-recipient-token" }) });
  expect(response.status).toBe(404); expect(effects()).toEqual(before);
});
