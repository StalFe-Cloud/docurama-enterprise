import { createHmac, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { serializableTransaction } from "@/lib/transaction";
import { postWebhook } from "@/lib/safe-webhook-http";
export { assertSafeWebhookUrl } from "@/lib/safe-webhook-http";

export const MAX_WEBHOOK_ATTEMPTS = 5;
const LEASE_MS = 30_000; // Larger than the transport's total eight-second deadline.
const BACKOFF_MS = [60_000, 300_000, 900_000, 1_800_000];
export function webhookBackoffMs(attempt: number): number {
  return BACKOFF_MS[Math.max(0, Math.min(attempt - 1, BACKOFF_MS.length - 1))];
}

export type EnvelopeEventData = {
  code: string;
  title: string;
  status: string;
  tenantId?: never;
  [key: string]: unknown;
};
export function signPayload(secret: string | null | undefined, body: string): string | null {
  return secret ? `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}` : null;
}
function subscribed(events: string, event: string): boolean {
  return events.split("|").some((entry) => ["*", event].includes(entry.trim().toLowerCase()));
}
export const postOnce = postWebhook;

/** Call INSIDE the envelope transaction. Database failure rolls back the action. */
export async function queueEnvelopeEvent(tx: Prisma.TransactionClient, tenantId: string, event: string, data: EnvelopeEventData): Promise<string[]> {
  const endpoints = await tx.webhookEndpoint.findMany({ where: { tenantId, status: { not: "PAUSED" } } });
  const ids: string[] = [];
  for (const endpoint of endpoints) {
    if (!subscribed(endpoint.events, event)) continue;
    const id = randomUUID();
    const payload = JSON.stringify({ id, event, createdAt: new Date().toISOString(), data });
    await tx.webhookDelivery.create({ data: {
      id, endpointId: endpoint.id, event, payload, statusCode: 0, durationMs: 0,
      success: false, attempts: 0, nextAttemptAt: new Date(),
    } });
    ids.push(id);
  }
  return ids;
}

export type DispatchResult = { endpoints: number; delivered: number; failed: number };
/** Compatibility entry point for callers without a business transaction. */
export async function dispatchEnvelopeEvent(tenantId: string, event: string, data: EnvelopeEventData): Promise<DispatchResult> {
  const ids = await serializableTransaction((tx) => queueEnvelopeEvent(tx, tenantId, event, data));
  const result = await processDeliveries(ids.length, ids);
  return { endpoints: ids.length, delivered: result.recovered, failed: result.retried - result.recovered };
}

/** Legacy rows used CUID database ids but UUID payload ids. Never rewrite bytes. */
export function publicDeliveryId(id: string, payload: string): string {
  const decoded: unknown = JSON.parse(payload);
  const publicId = decoded && typeof decoded === "object" ? (decoded as { id?: unknown }).id : undefined;
  if (typeof publicId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(publicId)) {
    throw new Error(`Invalid public delivery id for stored delivery ${id}`);
  }
  return publicId;
}

async function refreshEndpointHealth(endpointId: string): Promise<void> {
  const recent = await db.webhookDelivery.findMany({ where: { endpointId, attempts: { gt: 0 } },
    orderBy: { at: "desc" }, take: 20, select: { success: true } });
  if (!recent.length) return;
  const lastFive = recent.slice(0, 5);
  const failing = lastFive.length === 5 && lastFive.every((row) => !row.success);
  await db.webhookEndpoint.updateMany({ where: { id: endpointId, status: { not: "PAUSED" } }, data: {
    successRate: Math.round(100 * recent.filter((row) => row.success).length / recent.length),
    lastDeliveryAt: new Date(), status: failing ? "FAILING" : "ACTIVE",
  } });
}

export type RetryResult = { retried: number; recovered: number; exhausted: number };
async function processDeliveries(limit: number, ids?: string[]): Promise<RetryResult> {
  const result: RetryResult = { retried: 0, recovered: 0, exhausted: 0 };
  if (limit <= 0) return result;
  const now = new Date();
  // A worker that died on its final attempt leaves a recoverable terminal row.
  await db.webhookDelivery.updateMany({ where: {
    success: false, attempts: { gte: MAX_WEBHOOK_ATTEMPTS }, nextAttemptAt: { not: null },
    OR: [{ claimUntil: null }, { claimUntil: { lte: now } }],
    ...(ids ? { id: { in: ids } } : {}),
  }, data: { nextAttemptAt: null, claimToken: null, claimUntil: null } });
  const candidates = await db.webhookDelivery.findMany({ where: {
    success: false, payload: { not: null }, attempts: { lt: MAX_WEBHOOK_ATTEMPTS },
    nextAttemptAt: { lte: now }, endpoint: { status: { not: "PAUSED" } },
    OR: [{ claimUntil: null }, { claimUntil: { lte: now } }],
    ...(ids ? { id: { in: ids } } : {}),
  }, include: { endpoint: true }, orderBy: { nextAttemptAt: "asc" }, take: Math.min(limit, 100) });
  for (const row of candidates) {
    const claimToken = randomUUID();
    const claimedAt = new Date();
    const claimed = await db.webhookDelivery.updateMany({ where: {
      id: row.id, success: false, attempts: row.attempts, nextAttemptAt: { lte: claimedAt },
      endpoint: { status: { not: "PAUSED" } },
      OR: [{ claimUntil: null }, { claimUntil: { lte: claimedAt } }],
    }, data: { claimToken, claimUntil: new Date(Date.now() + LEASE_MS), attempts: { increment: 1 } } });
    if (claimed.count !== 1) continue;
    const attempt = row.attempts + 1;
    const started = Date.now();
    let statusCode = 0;
    let success = false;
    try {
      const payload = row.payload!;
      const headers: Record<string, string> = { "X-Docurama-Event": row.event,
        "X-Docurama-Delivery": publicDeliveryId(row.id, payload) };
      const signature = signPayload(row.endpoint.secret, payload);
      if (signature) headers["X-Docurama-Signature"] = signature;
      statusCode = (await postOnce(row.endpoint.url, payload, headers)).statusCode;
      success = true;
    } catch (error) {
      statusCode = (error as { statusCode?: number }).statusCode ?? 0;
    }
    const terminal = !success && attempt >= MAX_WEBHOOK_ATTEMPTS;
    // Fencing: a stale worker must never overwrite a newer claimant's state.
    const acknowledged = await db.webhookDelivery.updateMany({ where: { id: row.id, claimToken }, data: {
      success, statusCode, durationMs: Date.now() - started, at: new Date(),
      nextAttemptAt: success || terminal ? null : new Date(Date.now() + webhookBackoffMs(attempt)),
      claimToken: null, claimUntil: null,
    } });
    if (acknowledged.count !== 1) continue;
    result.retried++;
    if (success) result.recovered++;
    if (terminal) result.exhausted++;
    await refreshEndpointHealth(row.endpointId);
  }
  return result;
}

/** At-least-once delivery: a crash after external acceptance can cause a retry. */
export async function retryFailedDeliveries(limit = 10): Promise<RetryResult> {
  return processDeliveries(limit);
}
