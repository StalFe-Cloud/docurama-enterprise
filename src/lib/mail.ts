import { createTransport } from "nodemailer";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

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
export type OutboxMessage = { id: string; toEmail: string; fromEmail: string; subject: string; bodyText: string };

/** A dedicated transport lets a deadline close only this message's connection. */
export async function sendViaSmtp(mode: Extract<SmtpMode, { configured: true }>, msg: OutboxMessage): Promise<void> {
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
      transporter.sendMail({ from: msg.fromEmail, to: msg.toEmail, subject: msg.subject, text: msg.bodyText,
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

export type ProcessOutboxResult = { mode: "smtp" | "outbox-only"; processed: number; sent: number; failed: number; deferred: number };
/** At least once. A crash after SMTP accepts but before acknowledgement may retry. */
export async function processOutbox(limit = 20): Promise<ProcessOutboxResult> {
  const mode = smtpMode();
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
      await sendViaSmtp(mode, row);
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
