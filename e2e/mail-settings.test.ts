/** Standalone process: synthetic persistence and Nodemailer double; no provider sockets. */
import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import type { SessionUser } from "../src/lib/auth";

const storedPlatformRelaySupported = false;
let notifications: Record<string, any>;
let platform: Record<string, any>;
let domains: Record<string, any>[];
let writes: Record<string, any>[];
let audits: Record<string, any>[];
let transports = 0;
let accepted: any[] = [];
let relayFailure = false;
let denyAdministrator = false;
let databaseProbeFails = false;
let storageProbeFails = false;
let beforeNotificationUpdate: (() => void) | null = null;
const administrator = { id: "synthetic-admin", firstName: "Synthetic", lastName: "Admin", email: "admin@example.test",
  tenantId: "tenant-one", tenantSlug: "synthetic", tenantName: "Synthetic", workspaceRole: "OWNER", role: "PLATFORM_ADMIN" } as unknown as SessionUser;
mock.module("../src/lib/db", () => ({ db: {
  user: { findUnique: async () => ({ id: administrator.id }) },
  notificationSettings: {
    findUnique: async () => notifications,
    upsert: async () => ({ ...notifications }),
    update: async ({ data }: { data: Record<string, any> }) => {
      beforeNotificationUpdate?.(); beforeNotificationUpdate = null;
      writes.push(data); Object.assign(notifications, data); return notifications;
    },
  },
  platformSetting: {
    findUnique: async () => platform,
    update: async ({ data }: { data: Record<string, any> }) => { writes.push(data); Object.assign(platform, data); return platform; },
  },
  domain: { findFirst: async ({ where }: any) => domains.find(domain =>
    domain.tenantId === where.tenantId && domain.domain === where.domain && domain.purpose === where.purpose &&
    domain.status === where.status && domain.verifiedAt !== null && where.tenant.status.in.includes(domain.tenantStatus)) ?? null },
  dailyStat: { findMany: async () => [] }, auditEvent: { findFirst: async () => null },
  securityEvent: { count: async () => 0 }, webhookEndpoint: { count: async () => 0 },
  mailOutbox: { count: async () => 0, findFirst: async () => null },
  $queryRaw: async () => { if (databaseProbeFails) throw new Error("Synthetic database failure"); return [{ ok: 1 }]; },
} }));
mock.module("../src/lib/auth", () => ({
  requirePlatformAdmin: async () => { if (denyAdministrator) throw new Response("Denied", { status: 403 }); return administrator; },
  recordAudit: async (entry: Record<string, any>) => { audits.push(entry); },
  hashPasswordAsync: async () => "synthetic-unused", verifyPasswordAsync: async () => false,
}));
mock.module("../src/lib/document-store", () => ({
  MAX_UPLOAD_BYTES: 50 * 1024 * 1024,
  readStoredBytes: async () => { throw new Error("Unexpected document read in SMTP settings fixture"); },
  storageHealthProbe: async () => { if (storageProbeFails) throw new Error("Synthetic storage failure"); return { ok: true, backend: "synthetic" }; },
  purgeExpired: async () => ({ removed: 0 }),
}));
mock.module("nodemailer", () => ({ createTransport: () => {
  transports++;
  return {
    verify: async () => { if (relayFailure) throw new Error("Synthetic relay rejected synthetic-private-password"); },
    sendMail: async (message: any) => { accepted.push(message); return { accepted: [message.to] }; }, close: () => {},
  };
} }));
const { getSettingsSection, postSettingsOp } = await import("../src/lib/settings-handlers");
const { GET, POST } = await import("../src/app/api/admin/[section]/route");
const { configuredMailState } = await import("../src/lib/mail-configuration");
const { resolveSmtpMode } = await import("../src/lib/mail");
const workspaceSave = (data: Record<string, unknown>, me = administrator) => postSettingsOp(me,
  { op: "notifications.save", data }, new NextRequest("http://127.0.0.1/api/workspace/settings"));
const adminPost = (op: string, data: Record<string, unknown>) => POST(new NextRequest("http://127.0.0.1/api/admin/settings", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, data }),
}), { params: Promise.resolve({ section: "settings" }) });
const adminGet = (section: string) => GET(new NextRequest("http://127.0.0.1/api/admin/" + section), { params: Promise.resolve({ section }) });
beforeEach(() => {
  delete process.env.SMTP_FROM; delete process.env.SMTP_URL;
  notifications = { smtpFrom: "Docurama Sign <notifications@docurama.eu>", smtpHost: "inactive-relay.test", smtpPort: 465,
    smtpUser: "synthetic-tenant-user", smtpPassword: "synthetic-tenant-relay-secret", smtpSecure: true,
    alertOnSent: true, alertOnViewed: false, alertOnSigned: true, alertOnCompleted: true, alertOnDeclined: false,
    dailyDigest: false, digestTime: "09:00", reminderMode: "manual", reminderIntervalDays: 3, reminderMaxCount: 5,
    quietHoursStart: "21:00", quietHoursEnd: "08:00", skipWeekends: true, escalateToSms: false, escalateAfterDays: 7 };
  platform = { smtpHost: "smtp.eu.mailprovider.io", smtpPort: 587, smtpFrom: "Docurama Sign <notifications@docurama.eu>",
    smtpUser: "synthetic-platform-user", ...(storedPlatformRelaySupported ? { smtpPassword: "synthetic-private-password" } : {}), smtpTls: true,
    maintenanceMode: false, sweeperLastRunAt: new Date(0), signingConformance: "B-LTA", tsaReachable: true, tsaUrl: "https://unused.test" };
  domains = []; writes = []; audits = []; transports = 0; accepted = []; relayFailure = false;
  denyAdministrator = false; beforeNotificationUpdate = null; databaseProbeFails = false; storageProbeFails = false;
});
const sendingDomain = () => ({ id: "proof", tenantId: "tenant-one", domain: "owned.test", purpose: "SENDING",
  status: "VERIFIED", verifiedAt: new Date(0), tenantStatus: "ACTIVE" });

test("notification GET exposes resolved identity and configuration source without SMTP credentials", async () => {
  process.env.SMTP_URL = "smtp://synthetic:synthetic-private-password@127.0.0.1:49123?tls=off";
  process.env.SMTP_FROM = "Operator <sender@approved.test>";
  const response = await getSettingsSection("settings-notifications", administrator);
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.settings.configuredFrom).toBe('"Operator" <sender@approved.test>');
  expect(result.settings.senderTrusted).toBe(true); expect(result.settings.senderError).toBeNull();
  expect(result.settings.transportSource).toBe("SMTP_URL"); expect(result.settings.deliveryConfigured).toBe(true);
  expect(result.settings.smtpOverrideActive).toBe(false);
  expect(JSON.stringify(result)).not.toContain("synthetic-private-password");
  expect(JSON.stringify(result)).not.toContain("synthetic-tenant-relay-secret"); expect(transports).toBe(0);
});
test("an available SMTP transport cannot hide invalid identity in status or health", async () => {
  process.env.SMTP_URL = "smtp://127.0.0.1:49123?tls=off";
  process.env.SMTP_FROM = "sender@approved.test\r\nBcc: thief@attacker.test";
  const state = await configuredMailState("tenant-one");
  expect(state.transportConfigured).toBe(true); expect(state.senderTrusted).toBe(false);
  expect(state.configuredFrom).toBeNull(); expect(state.deliveryConfigured).toBe(false); expect(state.senderError).toBeTruthy();
  const result = await (await adminGet("health")).json();
  expect(result.services.find((service: any) => service.name === "SMTP configuration").status).toBe("DEGRADED");
  expect(JSON.stringify(result)).not.toContain("thief@attacker.test"); expect(transports).toBe(0);
});
test("blank optional identity and no relay truthfully report outbox only", async () => {
  process.env.SMTP_FROM = "   ";
  const state = await configuredMailState("tenant-one");
  expect(state.transportSource).toBe("OUTBOX_ONLY"); expect(state.transportConfigured).toBe(false);
  expect(state.configuredFrom).toBeNull(); expect(state.deliveryConfigured).toBe(false); expect(state.senderError).toContain("Configure");
});
test("relay status follows actual edition transport capabilities and keeps STARTTLS required", async () => {
  platform.smtpHost = "operator-relay.test"; platform.smtpFrom = "Operator <sender@approved.test>";
  const state = await configuredMailState();
  expect(state.transportSource).toBe(storedPlatformRelaySupported ? "PLATFORM_SETTINGS" : "OUTBOX_ONLY");
  expect(state.deliveryConfigured).toBe(storedPlatformRelaySupported);
  const mode = await resolveSmtpMode(); expect(mode.configured).toBe(storedPlatformRelaySupported);
  if (mode.configured) { expect(mode.tls).toBe(true); expect(mode.url.hostname).toBe("operator-relay.test"); }
  if (!storedPlatformRelaySupported) {
    process.env.SMTP_URL = "smtp://operator-relay.test:587";
    const environment = await configuredMailState(); expect(environment.transportSource).toBe("SMTP_URL"); expect(environment.deliveryConfigured).toBe(true);
    const configured = await resolveSmtpMode(); if (configured.configured) expect(configured.tls).toBe(true); else throw new Error("Configured operator relay missing");
  }
  expect(JSON.stringify(await (await adminGet("settings")).json())).not.toContain("synthetic-private-password");
});
test("invalid From syntax is rejected before workspace settings update", async () => {
  for (const smtpFrom of ["", "a@localhost", "a@example.test,b@example.test", "a@example.test\r\nBcc: b@attacker.test", null, 42]) {
    const response = await workspaceSave({ smtpFrom }); expect(response.status).toBe(422);
    expect(notifications.smtpFrom).toBe("Docurama Sign <notifications@docurama.eu>");
  }
  expect(writes).toHaveLength(0); expect(audits).toHaveLength(0); expect(transports).toBe(0);
});
test("custom tenant From cannot use foreign, receiving-only, stale or suspended domain proof", async () => {
  for (const change of [{ tenantId: "tenant-other" }, { purpose: "RECEIVING" }, { status: "PENDING" }, { verifiedAt: null }, { tenantStatus: "SUSPENDED" }, { domain: "foreign.test" }]) {
    domains = [{ ...sendingDomain(), ...change }];
    expect((await workspaceSave({ smtpFrom: "Tenant <ops@owned.test>" })).status).toBe(422);
    expect(notifications.smtpFrom).toBe("Docurama Sign <notifications@docurama.eu>");
  }
  expect(writes).toHaveLength(0); expect(audits).toHaveLength(0); expect(transports).toBe(0);
});
test("verified tenant From can be saved and resolves without activating tenant relay fields", async () => {
  domains = [sendingDomain()]; process.env.SMTP_URL = "smtp://127.0.0.1:49123?tls=off";
  const response = await workspaceSave({ smtpFrom: "Tenant Sender <ops@OWNED.test>" });
  expect(response.status).toBe(200); expect(notifications.smtpFrom).toBe('"Tenant Sender" <ops@owned.test>');
  expect(notifications.smtpHost).toBe("inactive-relay.test"); expect(notifications.smtpPassword).toBe("synthetic-tenant-relay-secret");
  const result = await response.json(); expect(result.configuredFrom).toBe('"Tenant Sender" <ops@owned.test>');
  expect(result.senderTrusted).toBe(true); expect(result.smtpOverrideActive).toBe(false); expect(result.transportSource).toBe("SMTP_URL");
  expect(accepted).toHaveLength(0);
});
test("partial alerts save cannot overwrite concurrent sender, TLS or reminder changes", async () => {
  beforeNotificationUpdate = () => Object.assign(notifications, { smtpFrom: "Concurrent <ops@owned.test>", smtpSecure: false, reminderMode: "user_job" });
  domains = [sendingDomain()];
  expect((await workspaceSave({ alertOnViewed: true })).status).toBe(200);
  expect(notifications.alertOnViewed).toBe(true); expect(notifications.smtpFrom).toBe("Concurrent <ops@owned.test>");
  expect(notifications.smtpSecure).toBe(false); expect(notifications.reminderMode).toBe("user_job");
  expect(notifications.smtpPassword).toBe("synthetic-tenant-relay-secret");
});
test("workspace configuration check cannot claim delivery or invoke SMTP", async () => {
  process.env.SMTP_FROM = "sender@approved.test"; process.env.SMTP_URL = "smtp://127.0.0.1:49123?tls=off";
  const response = await postSettingsOp(administrator, { op: "smtp.test" }, new NextRequest("http://127.0.0.1/api/workspace/settings"));
  const result = await response.json(); expect(result.configurationOnly).toBe(true); expect(result.delivered).toBe(false);
  expect(result.transportConfigured).toBe(true); expect(result.senderTrusted).toBe(true);
  expect(notifications.smtpLastTestStatus).toBe("CONFIGURATION_ONLY"); expect(accepted).toHaveLength(0); expect(transports).toBe(0);
});
test("stored PAdES and TSA flags cannot become healthy signing acceptance", async () => {
  const result = await (await adminGet("health")).json();
  const signing = result.services.find((service: any) => service.name === "Signing runtime");
  const timestamp = result.services.find((service: any) => service.name === "Timestamp authority");
  expect(signing.status).toBe("PENDING"); expect(signing.detail).toContain("Email-link typed signing");
  expect(timestamp.status).toBe("PENDING"); expect(timestamp.detail).toContain("Not used");
});
test("platform saves reject malformed identities and preserve omitted TLS and credentials", async () => {
  for (const smtpFrom of ["a@localhost", "a@example.test,b@example.test", "a@example.test\r\nBcc: b@attacker.test"]) {
    expect((await adminPost("save-smtp", { smtpHost: "operator-relay.test", smtpFrom })).status).toBe(422);
  }
  expect(writes).toHaveLength(0);
  expect((await adminPost("save-smtp", { smtpHost: "operator-relay.test", smtpFrom: "Operator <sender@approved.test>" })).status).toBe(200);
  expect(platform.smtpTls).toBe(true); expect(platform.smtpUser).toBe("synthetic-platform-user");
  expect(platform.smtpPassword).toBe(storedPlatformRelaySupported ? "synthetic-private-password" : undefined); expect(platform.smtpFrom).toBe('"Operator" <sender@approved.test>');
  if (!storedPlatformRelaySupported) {
    const before = writes.length;
    expect((await adminPost("save-smtp", { smtpHost: "operator-relay.test", smtpFrom: "sender@approved.test", smtpPassword: "synthetic-private-password" })).status).toBe(422);
    expect(writes).toHaveLength(before); expect(platform.smtpPassword).toBeUndefined();
  }
});
test("admin test rejects invalid mailboxes before transport and sanitizes relay failures", async () => {
  expect((await adminPost("test-smtp", { smtpFrom: "a@example.test\r\nBcc: b@attacker.test" })).status).toBe(422);
  expect(transports).toBe(0); expect(accepted).toHaveLength(0);
  relayFailure = true;
  const response = await adminPost("test-smtp", { smtpHost: "operator-relay.test", smtpFrom: "sender@approved.test" });
  expect(response.status).toBe(502); expect(await response.text()).not.toContain("synthetic-private-password");
  expect(JSON.stringify(audits)).not.toContain("synthetic-private-password"); expect(accepted).toHaveLength(0);
});
test("explicit admin SMTP test reports relay acceptance without claiming inbox delivery", async () => {
  const response = await adminPost("test-smtp", { smtpHost: "operator-relay.test", smtpFrom: "Operator <sender@approved.test>" });
  expect(response.status).toBe(200); expect(transports).toBe(1); expect(accepted).toHaveLength(1);
  expect(accepted[0].from.address).toBe("sender@approved.test"); expect(accepted[0].to).toBe("admin@example.test");
  expect((await response.json()).message).toContain("verify the destination mailbox separately");
});
test("workspace members and unauthorized platform callers cannot change SMTP settings", async () => {
  expect((await workspaceSave({ smtpFrom: "sender@approved.test" }, { ...administrator, role: "USER", workspaceRole: "MEMBER" })).status).toBe(403);
  denyAdministrator = true;
  expect((await adminPost("save-smtp", { smtpHost: "operator-relay.test", smtpFrom: "sender@approved.test" })).status).toBe(403);
  expect(writes).toHaveLength(0); expect(audits).toHaveLength(0); expect(transports).toBe(0);
});

test("failed database and storage probes report degraded status instead of fabricated health", async () => {
  databaseProbeFails = true; storageProbeFails = true;
  const response = await adminGet("health"); expect(response.status).toBe(200);
  const result = await response.json();
  const gateway = result.services.find((service: any) => service.name === "API gateway");
  const storage = result.services.find((service: any) => service.name === "Document storage");
  expect(gateway.status).toBe("DEGRADED"); expect(gateway.detail).toContain("Database probe failed");
  expect(storage.status).toBe("DEGRADED"); expect(storage.detail).toContain("unknown");
  expect(JSON.stringify(result.services)).not.toContain("2 replicas");
  expect(JSON.stringify(result.services)).not.toContain("p95 84 ms");
});
