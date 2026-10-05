import { resolveConfiguredMailSender, validateMailSender, MailSenderError } from "@/lib/mail-sender";
import { createTransport } from "nodemailer";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { buildFinalDocument } from "@/lib/final-document";
import { signerReadRestriction } from "@/lib/signing-policy";

export const MAX_MAIL_ATTEMPTS = 5;
const MAIL_LEASE_MS = 90_000;
const SEND_DEADLINE_MS = 30_000;
export function mailBackoffMs(attempt: number): number {
  return Math.min(30_000 * 4 ** Math.max(0, attempt - 1), 30 * 60_000);
}
export type SmtpMode = { configured: true; url: URL; tls: boolean } | { configured: false };
export function smtpMode(): SmtpMode {
  const raw = process.env.SMTP_URL?.trim();
  if (!raw) return { configured: false };
  try {
    const url = new URL(raw);
    if (!["smtp:", "smtps:"].includes(url.protocol)) return { configured: false };
    return { configured: true, url, tls: url.searchParams.get("tls") !== "off" };
  } catch {
    console.warn("[mail] Invalid SMTP_URL; messages remain in the outbox");
    return { configured: false };
  }
}
/** Enterprise relay credentials are provided through the operator's SMTP_URL.
 * Platform SMTP metadata has no stored-password capability in this edition. */
export async function resolveSmtpMode(): Promise<SmtpMode> {
  return smtpMode();
}

/** Explicit SMTP verification and optional test email dispatch for admin UI testing. */
export async function testSmtpConnection(opts: {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  tls?: boolean;
  from: string;
  to?: string;
}): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const testSender = validateMailSender(opts.from);
  const t0 = Date.now();
  const secure = opts.port === 465;
  const transporter = createTransport({
    host: opts.host,
    port: opts.port,
    secure,
    requireTLS: opts.tls && !secure,
    ignoreTLS: !opts.tls,
    auth: opts.user ? { user: opts.user, pass: opts.pass ?? "" } : undefined,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 10_000,
    pool: false,
  });

  try {
    await transporter.verify();
    if (opts.to) {
      await transporter.sendMail({
        from: { name: testSender.name, address: testSender.address },
        to: opts.to,
        subject: "Docurama Sign - SMTP Test Message",
        text: `This is an automated test message from Docurama Sign to confirm SMTP connectivity.\n\nTimestamp: ${new Date().toISOString()}\nHost: ${opts.host}:${opts.port}`,
      });
    }
    const latencyMs = Date.now() - t0;
    return { ok: true, message: `SMTP connection verified (${latencyMs}ms)${opts.to ? ` - test email sent to ${opts.to}` : ""}`, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - t0;
    return { ok: false, message: `SMTP verification failed: ${err.message || String(err)}`, latencyMs };
  } finally {
    transporter.close();
  }
}

export type OutboxMessage = { id: string; toEmail: string; fromEmail: string; subject: string; bodyText: string; bodyHtml?: string | null;
  attachments?: Array<{ filename: string; content: Buffer; contentType: "application/pdf" }> };

/** A dedicated transport lets a deadline close only this message's connection. */
export async function sendViaSmtp(mode: Extract<SmtpMode, { configured: true }>, msg: OutboxMessage): Promise<void> {
  const sender = validateMailSender(msg.fromEmail);
  const secure = mode.url.protocol === "smtps:";
  const transporter = createTransport({
    host: mode.url.hostname, port: Number(mode.url.port || (secure ? 465 : 587)),
    secure, requireTLS: mode.tls && !secure, ignoreTLS: !mode.tls,
    auth: mode.url.username ? { user: decodeURIComponent(mode.url.username), pass: decodeURIComponent(mode.url.password) } : undefined,
    connectionTimeout: 8_000, greetingTimeout: 8_000, socketTimeout: 15_000,
    pool: false,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      transporter.sendMail({ from: { name: sender.name, address: sender.address }, envelope: { from: sender.address, to: msg.toEmail }, to: msg.toEmail, subject: msg.subject, text: msg.bodyText, html: msg.bodyHtml || undefined,
        attachments: msg.attachments,
        messageId: `<${msg.id}@outbox.docurama>` }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { transporter.close(); reject(new Error("SMTP delivery deadline exceeded")); }, SEND_DEADLINE_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    transporter.close();
  }
}

export type ProcessOutboxResult = { mode: "smtp" | "outbox-only"; processed: number; sent: number; failed: number; deferred: number; cancelled?: number };
/** At least once. A crash after SMTP accepts but before acknowledgement may retry. */
export async function processOutbox(limit = 20): Promise<ProcessOutboxResult> {
  const mode = await resolveSmtpMode();
  if (!mode.configured) return { mode: "outbox-only", processed: 0, sent: 0, failed: 0, deferred: 0 };
  const now = new Date();
  const unclaimed = { OR: [{ claimUntil: null }, { claimUntil: { lte: now } }] };
  await db.mailOutbox.updateMany({ where: { status: "QUEUED", attempts: { gte: MAX_MAIL_ATTEMPTS }, ...unclaimed },
    data: { status: "FAILED", nextAttemptAt: null, claimToken: null, claimUntil: null, lastError: "Attempt budget exhausted; last acknowledgement unavailable" } });
  const due = { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] };
  const candidates = await db.mailOutbox.findMany({ where: {
    status: "QUEUED", attempts: { lt: MAX_MAIL_ATTEMPTS }, AND: [due, unclaimed],
  }, orderBy: { createdAt: "asc" }, take: Math.max(0, Math.min(limit, 100)) });
  const result: ProcessOutboxResult = { mode: "smtp", processed: 0, sent: 0, failed: 0, deferred: 0 };
  for (const row of candidates) {
    const claimToken = randomUUID();
    const claimedAt = new Date();
    const claimed = await db.mailOutbox.updateMany({ where: {
      id: row.id, status: "QUEUED", attempts: row.attempts,
      AND: [
        { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: claimedAt } }] },
        { OR: [{ claimUntil: null }, { claimUntil: { lte: claimedAt } }] },
      ],
    }, data: { claimToken, claimUntil: new Date(Date.now() + MAIL_LEASE_MS), attempts: { increment: 1 } } });
    if (claimed.count !== 1) continue;
    result.processed++;
    const attempt = row.attempts + 1;
    let lastError: string | null = null;
    try {
      let senderTenantId: string | null = null;
      if (["SIGN_INVITE", "REMINDER", "SIGN_COMPLETED"].includes(row.template) && !row.envelopeId) {
        const cancelled = await db.mailOutbox.updateMany({ where: { id: row.id, claimToken, status: "QUEUED" },
          data: { status: "CANCELLED", lastError: "Signing notification is missing envelope correlation; review before requeue",
            nextAttemptAt: null, claimToken: null, claimUntil: null } });
        if (cancelled.count === 1) result.cancelled = (result.cancelled ?? 0) + 1;
        continue;
      }
      if (row.envelopeId && ["SIGN_INVITE", "REMINDER"].includes(row.template)) {
        const envelope = await db.envelope.findUnique({ where: { id: row.envelopeId },
          select: { tenantId: true, status: true, tenant: { select: { status: true } }, recipients: { select: { id: true, role: true, status: true, order: true } } } });
        const firstPending = envelope?.recipients
          .filter(recipient => recipient.role === "SIGNER" && ["PENDING", "DELIVERED"].includes(recipient.status))
          .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))[0];
        if (!envelope || signerReadRestriction(envelope.tenant) || !["SENT", "PARTIALLY_SIGNED"].includes(envelope.status)
          || !row.recipientId || firstPending?.id !== row.recipientId) {
          const cancelled = await db.mailOutbox.updateMany({ where: { id: row.id, claimToken, status: "QUEUED" },
            data: { status: "CANCELLED", lastError: "Signing invitation superseded by envelope state",
              nextAttemptAt: null, claimToken: null, claimUntil: null } });
          if (cancelled.count === 1) result.cancelled = (result.cancelled ?? 0) + 1;
          continue;
        }
        senderTenantId = envelope.tenantId;
      }
      // This check suppresses stale queued invitations. State may still change
      // after the check while SMTP is accepting the message; it is not atomic.
      let message: OutboxMessage = row;
      if (row.envelopeId && row.template === "SIGN_COMPLETED") {
        const envelope = await db.envelope.findUnique({ where: { id: row.envelopeId }, include: {
          document: true, recipients: { orderBy: { order: "asc" } }, events: { orderBy: { at: "asc" } },
          createdBy: { select: { email: true } }, tenant: { select: { status: true } },
        } });
        if (!envelope || envelope.status !== "COMPLETED" || signerReadRestriction(envelope.tenant)) {
          throw new Error("Completed mail requires a completed envelope in an available workspace");
        }
        const recipient = row.recipientId ? envelope.recipients.find(item => item.id === row.recipientId) : null;
        const destination = row.recipientId
          ? recipient && ["SIGNER", "CC"].includes(recipient.role) ? recipient.email : null
          : envelope.createdBy.email;
        if (!destination || destination !== row.toEmail) throw new Error("Completed mail recipient binding is invalid");
        if (envelope.document && envelope.document.tenantId !== envelope.tenantId) {
          throw new Error("Completed mail document workspace binding is invalid");
        }
        senderTenantId = envelope.tenantId;
        const final = await buildFinalDocument(envelope);
        const code = envelope.publicCode.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 100) || "document";
        message = { ...row, attachments: [
          { filename: code + "-completed.pdf", content: final.bytes, contentType: "application/pdf" },
          { filename: code + "-completion-record.pdf", content: final.recordBytes, contentType: "application/pdf" },
        ] };
      }
      if (row.envelopeId && !senderTenantId) {
        const scope = await db.envelope.findUnique({ where: { id: row.envelopeId }, select: { tenantId: true } });
        if (!scope?.tenantId) throw new MailSenderError("Mail envelope workspace binding is invalid");
        senderTenantId = scope.tenantId;
      }
      const fromEmail = await resolveConfiguredMailSender(db, { tenantId: senderTenantId });
      if (!fromEmail) throw new MailSenderError("Configured sender is missing at dispatch");
      // Preparation can outlast the initial claim. An expired owner must not
      // begin SMTP, even if no successor has reclaimed the row yet. Renew only
      // the still-current lease, leaving more than the bounded send deadline.
      const dispatchAt = new Date();
      const dispatchLeaseUntil = new Date(dispatchAt.getTime() + MAIL_LEASE_MS);
      const identityBound = await db.mailOutbox.updateMany({
        where: { id: row.id, claimToken, status: "QUEUED", claimUntil: { gt: dispatchAt } },
        data: { fromEmail, claimUntil: dispatchLeaseUntil },
      });
      if (identityBound.count !== 1 || dispatchLeaseUntil.getTime() - Date.now() <= SEND_DEADLINE_MS) continue;
      await sendViaSmtp(mode, { ...message, fromEmail });
    } catch (error) {
      lastError = (error instanceof Error ? error.message : "SMTP delivery failed").slice(0, 500);
    }
    const success = lastError === null;
    const terminal = !success && attempt >= MAX_MAIL_ATTEMPTS;
    const acknowledged = await db.mailOutbox.updateMany({ where: { id: row.id, claimToken, status: "QUEUED" }, data: {
      status: success ? "SENT" : terminal ? "FAILED" : "QUEUED",
      sentAt: success ? new Date() : null, lastError,
      nextAttemptAt: success || terminal ? null : new Date(Date.now() + mailBackoffMs(attempt)),
      claimToken: null, claimUntil: null,
    } });
    if (acknowledged.count !== 1) continue;
    if (success) result.sent++;
    else if (terminal) result.failed++;
    else result.deferred++;
  }
  return result;
}

export async function outboxStats() {
  const [queued, failed, oldestQueued] = await Promise.all([
    db.mailOutbox.count({ where: { status: "QUEUED" } }),
    db.mailOutbox.count({ where: { status: "FAILED" } }),
    db.mailOutbox.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  return { queued, failed, oldestQueuedAt: oldestQueued?.createdAt.toISOString() ?? null };
}
