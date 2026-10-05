/** Real Nodemailer MIME/envelope compilation via stream transport; no socket or server. */
import { beforeEach, expect, mock, test } from "bun:test";
import nodemailer from "nodemailer";
import { resolveConfiguredMailSender, validateMailSender } from "../src/lib/mail-sender";
const realCreateTransport = nodemailer.createTransport;
let transports = 0;
let compiled: any[] = [];
let tenantSettings: any = null;
let platform: any = null;
let domainProof: any = null;
let proofQuery: any;
let row: any;
let scope: { tenantId: string } | null = null;
let replaceClaimAtResolution = false;
let expireLeaseAtResolution = false;
let shortenLeaseAtResolution = false;
let reclaimAtResolution = false;
let leasesAtSend: Date[] = [];
let delayBindingAcknowledgement = false;
let clockAdvanceMs = 0;
const db: any = {
  notificationSettings: { findUnique: async () => tenantSettings },
  platformSetting: { findUnique: async () => {
    if (replaceClaimAtResolution) {
      row.status = "SENT"; row.claimToken = "successor"; row.lastError = "successor-marker";
    }
    if (expireLeaseAtResolution) row.claimUntil = new Date(Date.now() - 1);
    if (shortenLeaseAtResolution) row.claimUntil = new Date(Date.now() + 1000);
    if (reclaimAtResolution) {
      row.claimToken = "reclaimed-by-successor"; row.claimUntil = new Date(Date.now() + 90_000);
      row.attempts = 2; row.lastError = "successor-marker";
    }
    return platform;
  } },
  envelope: { findUnique: async () => scope },
  domain: { findFirst: async (query: any) => { proofQuery = query; return domainProof; } },
  mailOutbox: {
    findMany: async () => [{ ...row }],
    updateMany: async ({ where, data }: any) => {
      if (where.attempts?.gte !== undefined) return { count: 0 };
      if (where.status !== row.status || (where.claimToken && where.claimToken !== row.claimToken)) return { count: 0 };
      if (where.claimUntil?.gt && (!(row.claimUntil instanceof Date) || row.claimUntil <= where.claimUntil.gt)) return { count: 0 };
      Object.assign(row, data, data.attempts?.increment ? { attempts: row.attempts + data.attempts.increment } : {});
      if (where.claimUntil?.gt && delayBindingAcknowledgement) clockAdvanceMs = 61_000;
      return { count: 1 };
    },
  },
};
mock.module("../src/lib/db", () => ({ db }));
mock.module("nodemailer", () => ({ createTransport: () => {
  transports++;
  const transport = realCreateTransport({ streamTransport: true, buffer: true, newline: "windows" });
  return { sendMail: async (message: any) => { leasesAtSend.push(row.claimUntil); const result = await transport.sendMail(message); compiled.push(result); return result; }, close: () => transport.close() };
} }));
const { sendViaSmtp, processOutbox } = await import("../src/lib/mail");
beforeEach(() => {
  transports = 0; compiled = []; platform = null; tenantSettings = null; domainProof = null; proofQuery = null;
  scope = null; replaceClaimAtResolution = false; expireLeaseAtResolution = false;
  shortenLeaseAtResolution = false; reclaimAtResolution = false; leasesAtSend = [];
  delayBindingAcknowledgement = false; clockAdvanceMs = 0;
  delete process.env.SMTP_FROM;
  process.env.SMTP_URL = "smtp://127.0.0.1:49123?tls=off";
  row = { id: "synthetic", fromEmail: "untrusted@attacker.test", toEmail: "recipient@example.test", subject: "Synthetic", bodyText: "Synthetic", template: "TEST", status: "QUEUED", attempts: 0, envelopeId: null, claimToken: null };
});
test("sender rejects control characters, multiple mailboxes, invalid domains and empty configuration", () => {
  for (const value of ["", "Sender\r\nBcc: thief@example.test", "Sender\t<sender@example.test>", "a@example.test,b@example.test", "Sender <a@example.test> <b@example.test>", "a@-bad.test", "a@localhost", "a..b@example.test"]) expect(() => validateMailSender(value)).toThrow();
});
test("trusted environment sender wins platform; no SMTP credential or request-host inference", async () => {
  process.env.SMTP_FROM = "Configured Sender <sender@approved.test>";
  platform = { smtpHost: "relay.test", smtpFrom: "platform@platform.test" };
  expect(await resolveConfiguredMailSender(db)).toBe('"Configured Sender" <sender@approved.test>');
  delete process.env.SMTP_FROM; platform = null;
  expect(await resolveConfiguredMailSender(db, { required: false })).toBeNull();
  await expect(resolveConfiguredMailSender(db)).rejects.toThrow("Configure");
});
test("schema default is not approval; explicitly configured default is legitimate", async () => {
  platform = { smtpHost: "smtp.eu.mailprovider.io", smtpFrom: "Docurama Sign <notifications@docurama.eu>" };
  expect(await resolveConfiguredMailSender(db, { required: false })).toBeNull();
  process.env.SMTP_FROM = platform.smtpFrom;
  expect(await resolveConfiguredMailSender(db)).toBe('"Docurama Sign" <notifications@docurama.eu>');
});
test("platform configured sender survives absent or blank env; nonblank invalid never falls back", async () => {
  platform = { smtpHost: "configured-relay.test", smtpFrom: "Platform <sender@platform.test>" };
  expect(await resolveConfiguredMailSender(db)).toBe('"Platform" <sender@platform.test>');
  process.env.SMTP_FROM = "   ";
  expect(await resolveConfiguredMailSender(db)).toBe('"Platform" <sender@platform.test>');
  process.env.SMTP_FROM = "bad@bad.test\r\nBcc: bad@bad.test";
  await expect(resolveConfiguredMailSender(db, { required: false })).rejects.toThrow();
});
test("tenant custom sender requires active tenant-owned verified SENDING proof", async () => {
  process.env.SMTP_FROM = "platform@approved.test";
  tenantSettings = { smtpFrom: "Tenant <sender@tenant.test>" };
  await expect(resolveConfiguredMailSender(db, { tenantId: "tenant-one" })).rejects.toThrow("verified");
  domainProof = { id: "proof" };
  expect(await resolveConfiguredMailSender(db, { tenantId: "tenant-one" })).toBe('"Tenant" <sender@tenant.test>');
  expect(proofQuery.where).toMatchObject({ tenantId: "tenant-one", domain: "tenant.test", purpose: "SENDING", status: "VERIFIED", verifiedAt: { not: null }, tenant: { status: { in: ["ACTIVE", "TRIAL"] } } });
  tenantSettings.smtpFrom = "Docurama Sign <notifications@docurama.eu>";
  expect(await resolveConfiguredMailSender(db, { tenantId: "tenant-one" })).toBe("platform@approved.test");
});
test("Nodemailer compiles the actual SMTP envelope and header with configured identity", async () => {
  process.env.SMTP_FROM = "Approved Sender <sender@approved.test>";
  expect((await processOutbox()).sent).toBe(1);
  expect(compiled[0].envelope.from).toBe("sender@approved.test");
  expect(compiled[0].message.toString()).toContain("From: Approved Sender <sender@approved.test>");
  expect(compiled[0].message.toString()).not.toContain("untrusted@attacker.test");
  expect(row.fromEmail).toBe('"Approved Sender" <sender@approved.test>');
});
test("invalid or missing approved identity defers without creating transport or sending", async () => {
  for (const value of [undefined, "sender@bad.test\r\nBcc: thief@example.test"]) {
    if (value === undefined) delete process.env.SMTP_FROM; else process.env.SMTP_FROM = value;
    row.status = "QUEUED"; row.attempts = 0; row.claimToken = null;
    const result = await processOutbox();
    expect(result.sent).toBe(0); expect(result.deferred).toBe(1); expect(transports).toBe(0); expect(compiled).toHaveLength(0);
  }
});
test("direct SMTP helper rejects injection before any transport is created", async () => {
  await expect(sendViaSmtp({ configured: true, url: new URL("smtp://127.0.0.1:49123?tls=off"), tls: false }, { ...row, fromEmail: "a@example.test\r\nBcc: b@example.test" })).rejects.toThrow();
  expect(transports).toBe(0);
});

test("blank optional environment is absence, while invalid configured identity remains an error", async () => {
  for (const value of ["", "   "]) {
    process.env.SMTP_FROM = value;
    expect(await resolveConfiguredMailSender(db, { required: false })).toBeNull();
    await expect(resolveConfiguredMailSender(db)).rejects.toThrow("Configure");
  }
});
test("tenant sender-domain revocation after queueing prevents a new dispatch", async () => {
  process.env.SMTP_FROM = "platform@approved.test";
  scope = { tenantId: "tenant-one" };
  tenantSettings = { smtpFrom: "Tenant <sender@tenant.test>" };
  domainProof = { id: "proof" };
  row.envelopeId = "envelope";
  expect((await processOutbox()).sent).toBe(1);
  expect(compiled[0].envelope.from).toBe("sender@tenant.test");
  domainProof = null;
  row = { ...row, id: "synthetic-revoked", status: "QUEUED", attempts: 0, claimToken: null, claimUntil: null, nextAttemptAt: null, sentAt: null };
  const result = await processOutbox();
  expect(result.sent).toBe(0); expect(result.deferred).toBe(1);
  expect(transports).toBe(1); expect(compiled).toHaveLength(1);
  expect(row.status).toBe("QUEUED"); expect(row.sentAt).toBeNull();
  expect(row.lastError).toContain("verified sending domain");
});
test("lost lease during sender resolution prevents transport and preserves successor state", async () => {
  platform = { smtpHost: "approved-relay.test", smtpFrom: "sender@approved.test" };
  replaceClaimAtResolution = true;
  const result = await processOutbox();
  expect(result.sent).toBe(0); expect(transports).toBe(0); expect(compiled).toHaveLength(0);
  expect(row.status).toBe("SENT"); expect(row.claimToken).toBe("successor");
  expect(row.lastError).toBe("successor-marker"); expect(row.fromEmail).toBe("untrusted@attacker.test");
});

test("expired preparation lease cannot begin SMTP even before any successor reclaims it", async () => {
  platform = { smtpHost: "approved-relay.test", smtpFrom: "sender@approved.test" };
  expireLeaseAtResolution = true; row.lastError = "prior-marker"; row.sentAt = null;
  const result = await processOutbox();
  expect(result.processed).toBe(1); expect(result.sent).toBe(0); expect(transports).toBe(0); expect(compiled).toHaveLength(0);
  expect(row.status).toBe("QUEUED"); expect(row.attempts).toBe(1); expect(row.sentAt).toBeNull();
  expect(row.lastError).toBe("prior-marker"); expect(row.fromEmail).toBe("untrusted@attacker.test");
  expect(row.claimUntil.getTime()).toBeLessThanOrEqual(Date.now()); expect(row.claimToken).toBeTruthy();
});
test("a still-current short lease is renewed before SMTP to cover the bounded send deadline", async () => {
  platform = { smtpHost: "approved-relay.test", smtpFrom: "sender@approved.test" };
  shortenLeaseAtResolution = true;
  const startedAt = Date.now();
  expect((await processOutbox()).sent).toBe(1); expect(compiled).toHaveLength(1);
  expect(leasesAtSend).toHaveLength(1); expect(leasesAtSend[0]!.getTime()).toBeGreaterThan(startedAt + 30_000);
  expect(row.status).toBe("SENT"); expect(row.claimToken).toBeNull(); expect(row.claimUntil).toBeNull();
});
test("a reclaimed queued successor prevents stale SMTP and acknowledgement", async () => {
  platform = { smtpHost: "approved-relay.test", smtpFrom: "sender@approved.test" };
  expireLeaseAtResolution = true; reclaimAtResolution = true;
  const result = await processOutbox();
  expect(result.sent).toBe(0); expect(transports).toBe(0); expect(compiled).toHaveLength(0);
  expect(row.status).toBe("QUEUED"); expect(row.claimToken).toBe("reclaimed-by-successor");
  expect(row.attempts).toBe(2); expect(row.lastError).toBe("successor-marker"); expect(row.fromEmail).toBe("untrusted@attacker.test");
});

test("a delayed lease-renewal acknowledgement cannot start SMTP with insufficient lease remaining", async () => {
  platform = { smtpHost: "approved-relay.test", smtpFrom: "sender@approved.test" };
  delayBindingAcknowledgement = true; row.lastError = "prior-marker";
  const realNow = Date.now;
  Date.now = () => realNow() + clockAdvanceMs;
  try {
    const result = await processOutbox();
    expect(result.sent).toBe(0); expect(transports).toBe(0); expect(compiled).toHaveLength(0);
    expect(row.status).toBe("QUEUED"); expect(row.attempts).toBe(1); expect(row.claimToken).toBeTruthy();
    expect(row.lastError).toBe("prior-marker");
  } finally { Date.now = realNow; }
});
