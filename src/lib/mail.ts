/**
 * Mail delivery engine — drains the MailOutbox over a real SMTP transport.
 *
 * Modes, in order of precedence:
 *   1. SMTP_URL is set          → real delivery via nodemailer, with
 *                                 attempt counting, exponential backoff and
 *                                 terminal FAILED after 5 attempts.
 *   2. SMTP_URL unset           → outbox-only mode: rows stay QUEUED and
 *                                 (demo / air-gapped / pre-configuration) and
 *                                 remain inspectable in the admin console.
 *                                 Nothing is silently dropped.
 *
 * SMTP_URL grammar:
 *   smtp://user:pass@host:587[?tls=off]   — STARTTLS when the server offers it
 *   smtps://user:pass@host:465            — implicit TLS
 * `?tls=off` disables STARTTLS negotiation (hermetic test transports).
 *
 * Triggers: the background worker (src/instrumentation.ts) calls
 * processOutbox() every 30s; request paths that just queued mail (envelope
 * send, password reset…) call it inline fire-and-forget so a configured
 * relay delivers within the same second in the common case. Both paths are
 * safe to race: a row is claimed by its status transition (QUEUED → SENT /
 * FAILED / QUEUED+nextAttemptAt), never by row locking.
 */

import { createTransport, type Transporter } from "nodemailer";
import { db } from "@/lib/db";

export const MAX_MAIL_ATTEMPTS = 5;

/** Backoff for attempt n (1-based): 30s, 2m, 8m, 30m — capped at 30m. */
export function mailBackoffMs(attempt: number): number {
  return Math.min(30_000 * Math.pow(4, Math.max(0, attempt - 1)), 30 * 60_000);
}

export type SmtpMode = { configured: true; url: URL; tls: boolean } | { configured: false };

/** Parsed view of SMTP_URL, read at call time (test-friendly, hot-reloadable). */
export function smtpMode(): SmtpMode {
  const raw = process.env.SMTP_URL?.trim();
  if (!raw) return { configured: false };
  try {
    const url = new URL(raw);
    if (url.protocol !== "smtp:" && url.protocol !== "smtps:") return { configured: false };
    return { configured: true, url, tls: url.searchParams.get("tls") !== "off" };
  } catch {
    console.warn("[mail] SMTP_URL is set but not a valid URL — falling back to outbox-only mode");
    return { configured: false };
  }
}

let cachedTransporter: { key: string; transporter: Transporter } | null = null;

function transporterFor(mode: Extract<SmtpMode, { configured: true }>): Transporter {
  const key = mode.url.href;
  if (cachedTransporter?.key === key) return cachedTransporter.transporter;
  const secure = mode.url.protocol === "smtps:";
  const transporter = createTransport({
    host: mode.url.hostname,
    port: Number(mode.url.port || (secure ? 465 : 587)),
    secure,
    // STARTTLS is opportunistic: offered → used; `?tls=off` opts out entirely
    // (local test transports). Never requireTLS — a plain relay still works.
    requireTLS: false,
    ignoreTLS: !mode.tls,
    auth: mode.url.username
      ? { user: decodeURIComponent(mode.url.username), pass: decodeURIComponent(mode.url.password) }
      : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    pool: true,
    maxConnections: 3,
  });
  cachedTransporter = { key, transporter };
  return transporter;
}

export type OutboxMessage = {
  id: string;
  toEmail: string;
  fromEmail: string;
  subject: string;
  bodyText: string;
};

/** Send one message through the configured transport. Throws on failure. */
export async function sendViaSmtp(mode: Extract<SmtpMode, { configured: true }>, msg: OutboxMessage): Promise<void> {
  await transporterFor(mode).sendMail({
    from: msg.fromEmail,
    to: msg.toEmail,
    subject: msg.subject,
    text: msg.bodyText,
  });
}

export type ProcessOutboxResult = {
  mode: "smtp" | "outbox-only";
  processed: number;
  sent: number;
  failed: number;
  deferred: number; // still QUEUED with a future nextAttemptAt or attempt budget left
};

/**
 * Drain due QUEUED rows. Idempotent and safe to call from the worker, from
 * request paths, or manually — everything is journal through the table.
 */
export async function processOutbox(limit = 20): Promise<ProcessOutboxResult> {
  const mode = smtpMode();
  if (!mode.configured) return { mode: "outbox-only", processed: 0, sent: 0, failed: 0, deferred: 0 };

  const due = await db.mailOutbox.findMany({
    where: {
      status: "QUEUED",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
      attempts: { lt: MAX_MAIL_ATTEMPTS },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;
  let deferred = 0;

  for (const row of due) {
    const attempt = row.attempts + 1;
    try {
      await sendViaSmtp(mode, {
        id: row.id,
        toEmail: row.toEmail,
        fromEmail: row.fromEmail,
        subject: row.subject,
        bodyText: row.bodyText,
      });
      await db.mailOutbox.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: new Date(), attempts: attempt, lastError: null },
      });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const terminal = attempt >= MAX_MAIL_ATTEMPTS;
      await db.mailOutbox.update({
        where: { id: row.id },
        data: {
          status: terminal ? "FAILED" : "QUEUED",
          attempts: attempt,
          lastError: message.slice(0, 500),
          nextAttemptAt: terminal ? null : new Date(Date.now() + mailBackoffMs(attempt)),
        },
      });
      if (terminal) failed++;
      else deferred++;
      console.warn(`[mail] send attempt ${attempt} failed for ${row.toEmail}: ${message}`);
    }
  }

  return { mode: "smtp", processed: due.length, sent, failed, deferred };
}

/** Queue depth for the health endpoint / admin console. */
export async function outboxStats() {
  const [queued, failed, oldestQueued] = await Promise.all([
    db.mailOutbox.count({ where: { status: "QUEUED" } }),
    db.mailOutbox.count({ where: { status: "FAILED" } }),
    db.mailOutbox.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  return {
    queued,
    failed,
    oldestQueuedAt: oldestQueued?.createdAt?.toISOString() ?? null,
  };
}
