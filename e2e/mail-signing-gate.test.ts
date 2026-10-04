/** Standalone process: this suite owns its synthetic DB/SMTP module doubles. */
import { expect, mock, test } from "bun:test";
let sends = 0;
let lookupFails = false;
let envelope: { status: string; tenant: { status: string }; recipients: { id: string; role: string; status: string; order: number }[] } | null = null;
let row: Record<string, unknown>;
const database = {
  mailOutbox: {
    findMany: async () => [{ ...row }],
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if ((where.attempts as { gte?: number } | undefined)?.gte !== undefined) return { count: 0 };
      if (where.status !== row.status || (where.claimToken && where.claimToken !== row.claimToken)) return { count: 0 };
      const attempts = data.attempts as { increment?: number } | undefined;
      Object.assign(row, data, attempts?.increment ? { attempts: Number(row.attempts) + attempts.increment } : {});
      return { count: 1 };
    },
  },
  envelope: { findUnique: async () => { if (lookupFails) throw new Error("Synthetic state lookup failed"); return envelope; } },
};
mock.module("../src/lib/db", () => ({ db: database }));
mock.module("nodemailer", () => ({ createTransport: () => ({
  sendMail: async () => { sends++; return { accepted: ["synthetic@example.invalid"] }; },
  close: () => {},
}) }));
process.env.SMTP_URL = "smtp://127.0.0.1:49123?tls=off";
const { processOutbox } = await import("../src/lib/mail");
const signer = { id: "first", role: "SIGNER", status: "PENDING", order: 1 };
function fixture(template = "SIGN_INVITE", recipientId: string | null = "first", envelopeId: string | null = "envelope") {
  sends = 0;
  lookupFails = false;
  row = { id: "mail", envelopeId, recipientId, template, status: "QUEUED", attempts: 0, claimToken: null, claimUntil: null, nextAttemptAt: null, fromEmail: "sender@example.invalid", toEmail: "synthetic@example.invalid", subject: "Synthetic invitation", bodyText: "Synthetic" };
}
test("superseded invitation remains durably CANCELLED without invoking SMTP", async () => {
  for (const status of ["DRAFT", "COMPLETED", "VOIDED", "DECLINED", "EXPIRED", null]) {
    fixture();
    envelope = status ? { status, tenant: { status: "ACTIVE" }, recipients: [signer] } : null;
    const result = await processOutbox();
    expect(sends).toBe(0);
    expect(row.status).toBe("CANCELLED");
    expect(row.lastError).toBe("Signing invitation superseded by envelope state");
    expect(row.claimToken).toBeNull();
    expect(row.claimUntil).toBeNull();
    expect(result.cancelled).toBe(1);
  }
});
test("failed state lookup defers instead of sending unchecked invitation", async () => {
  fixture();
  lookupFails = true;
  const result = await processOutbox();
  expect(sends).toBe(0);
  expect(row.status).toBe("QUEUED");
  expect(row.nextAttemptAt).toBeInstanceOf(Date);
  expect(row.claimToken).toBeNull();
  expect(result.deferred).toBe(1);
});
test("missing, signed, CC and out-of-order recipients do not receive invitations", async () => {
  for (const recipients of [[], [{ ...signer, status: "SIGNED" }], [{ ...signer, role: "CC" }], [{ ...signer, id: "earlier", order: 0 }, signer]]) {
    fixture("REMINDER");
    envelope = { status: "PARTIALLY_SIGNED", tenant: { status: "ACTIVE" }, recipients };
    await processOutbox();
    expect(sends).toBe(0);
    expect(row.status).toBe("CANCELLED");
  }
});
test("current signer and unrelated mail kinds retain SMTP behavior", async () => {
  for (const [template, recipientId, envelopeId] of [["SIGN_INVITE", "first", "envelope"], ["TEAM_INVITE", null, null], ["TEST", "first", null]]) {
    fixture(template!, recipientId!, envelopeId!);
    envelope = { status: template === "SIGN_COMPLETED" ? "COMPLETED" : "SENT", tenant: { status: "ACTIVE" }, recipients: [{ ...signer, status: "DELIVERED" }] };
    await processOutbox();
    expect(sends).toBe(1);
    expect(row.status).toBe("SENT");
  }
});
test("unbound signing invitation reminder and completion cancel without SMTP", async () => {
  for (const template of ["SIGN_INVITE", "REMINDER", "SIGN_COMPLETED"]) {
    fixture(template, null, null);
    const result=await processOutbox();
    expect(sends).toBe(0);
    expect(row.status).toBe("CANCELLED");
    expect(row.lastError).toBe("Signing notification is missing envelope correlation; review before requeue");
    expect(row.claimToken).toBeNull();
    expect(row.claimUntil).toBeNull();
    expect(result.cancelled).toBe(1);
  }
});
test("suspended workspace invitation is cancelled before SMTP", async () => {
  fixture();
  envelope = { status: "SENT", tenant: { status: "SUSPENDED" }, recipients: [signer] };
  await processOutbox();
  expect(sends).toBe(0);
  expect(row.status).toBe("CANCELLED");
});
