import { db } from "@/lib/db";
import type { Prisma, Subscription } from "@prisma/client";
import { ENVELOPE_LIMITS, planDef, termFor } from "@/lib/plans";
import { monthlyWindow, shiftUtcMonth, usageAnchor } from "@/lib/monthly-period";
import { serializableTransaction } from "@/lib/transaction";
export { periodStart, periodKey } from "@/lib/monthly-period";

export interface Allowance {
  limit: number;
  carriedForward: number;
  total: number;
  used: number;
  remaining: number;
}

/** Advance monthly usage independently of the provider's paid-through date. */
async function advanceUsage(tx: Prisma.TransactionClient, sub: Subscription, limit: number, now: Date) {
  const anchor = usageAnchor(sub, now);
  // Legacy subscriptions with an elapsed term retain their final closed month
  // so its unused capacity is carried once. Never guess an earlier audit identity.
  const initialAt = new Date(Math.min(now.getTime(), anchor.getTime()));
  const initial = monthlyWindow({ ...sub, usageAnchorAt: anchor }, initialAt);
  let start = sub.usagePeriodStart ?? initial.start;
  let end = sub.usagePeriodEnd ?? initial.end;
  let carried = Math.min(Math.max(0, sub.carriedForwardEnvelopes), limit);
  let usedInPeriod = 0;
  let iterations = 0;
  while (end <= now) {
    if (++iterations > 1200) throw new Error("Subscription usage history exceeds the supported migration window");
    const [count, counter] = await Promise.all([
      tx.envelope.count({ where: { tenantId: sub.tenantId, createdAt: { gte: start, lt: end } } }),
      tx.envelopeQuotaUsage.findUnique({ where: { tenantId_periodKey: { tenantId: sub.tenantId, periodKey: start.toISOString() } } }),
    ]);
    usedInPeriod = Math.max(count, counter?.used ?? 0);
    carried = Math.min(Math.max(0, limit + carried - usedInPeriod), limit);
    const next = monthlyWindow({ ...sub, usageAnchorAt: anchor }, end);
    start = next.start;
    end = next.end;
  }
  if (!sub.usageAnchorAt || !sub.usagePeriodStart || !sub.usagePeriodEnd ||
      sub.usagePeriodStart.getTime() !== start.getTime() || sub.carriedForwardEnvelopes !== carried) {
    await tx.subscription.update({ where: { id: sub.id }, data: {
      usageAnchorAt: anchor, usagePeriodStart: start, usagePeriodEnd: end,
      carriedForwardEnvelopes: carried,
    } });
  }
  return { start, end, carried, usedInPeriod };
}

async function usageContext(tx: Prisma.TransactionClient, tenantId: string, now: Date) {
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId },
    include: { subscriptions: { orderBy: { renewalAt: "desc" }, take: 1 } } });
  if (!tenant || tenant.status === "SUSPENDED") return null;
  const sub = tenant.subscriptions[0] ?? null;
  const plan = planDef(tenant.planCode);
  const limit = Math.max(0, sub?.envelopeLimitOverride ?? ENVELOPE_LIMITS[tenant.planCode] ?? plan.envelopeLimit);
  const state = sub ? await advanceUsage(tx, sub, limit, now) : { ...monthlyWindow(null, now), carried: 0 };
  const key = state.start.toISOString();
  const [actual, row] = await Promise.all([
    tx.envelope.count({ where: { tenantId, createdAt: { gte: state.start, lt: state.end } } }),
    tx.envelopeQuotaUsage.findUnique({ where: { tenantId_periodKey: { tenantId, periodKey: key } } }),
  ]);
  const used = Math.max(actual, row?.used ?? 0);
  const total = limit + state.carried;
  return { key, actual, allowance: { limit, carriedForward: state.carried, total, used, remaining: Math.max(0, total - used) } };
}

export async function currentAllowance(tenantId: string, now = new Date()): Promise<Allowance> {
  await renewDueSubscriptions(50, tenantId, now);
  return serializableTransaction(async (tx) => {
    const state = await usageContext(tx, tenantId, now);
    return state?.allowance ?? { limit: 0, carriedForward: 0, total: 0, used: 0, remaining: 0 };
  });
}

/** The caller MUST use a serializable, retried, database-only transaction. */
export async function reserveEnvelopeAllowance(tenantId: string, tx: Prisma.TransactionClient, now = new Date()): Promise<Allowance | null> {
  const state = await usageContext(tx, tenantId, now);
  if (!state || state.allowance.remaining <= 0) return null;
  const { key, actual, allowance } = state;
  await tx.envelopeQuotaUsage.upsert({
    where: { tenantId_periodKey: { tenantId, periodKey: key } },
    create: { tenantId, periodKey: key, used: actual }, update: {},
  });
  await tx.envelopeQuotaUsage.updateMany({
    where: { tenantId, periodKey: key, used: { lt: actual } }, data: { used: actual },
  });
  const reserved = await tx.envelopeQuotaUsage.updateMany({
    where: { tenantId, periodKey: key, used: { lt: allowance.total } }, data: { used: { increment: 1 } },
  });
  if (reserved.count !== 1) return null;
  const row = await tx.envelopeQuotaUsage.findUniqueOrThrow({ where: { tenantId_periodKey: { tenantId, periodKey: key } } });
  return { ...allowance, used: row.used, remaining: Math.max(0, allowance.total - row.used) };
}

export interface RenewalOutcome {
  subscriptionId: string;
  tenantSlug: string;
  planCode: string;
  carriedForward: number;
  usedInPeriod: number;
  renewedUntil: Date;
}

/** Manual paid-term renewal. Stripe paid-through dates remain webhook-driven. */
export async function renewDueSubscriptions(limit = 50, tenantId?: string, now = new Date()): Promise<RenewalOutcome[]> {
  const due = await db.subscription.findMany({ where: {
    status: "ACTIVE", ...(tenantId ? { tenantId } : {}), renewalAt: { lte: now },
    OR: [{ provider: null }, { provider: "manual" }],
  }, select: { id: true }, take: limit });
  const results: RenewalOutcome[] = [];
  for (const candidate of due) {
    const result = await serializableTransaction(async (tx) => {
      const sub = await tx.subscription.findUnique({ where: { id: candidate.id }, include: { tenant: true } });
      if (!sub || sub.status !== "ACTIVE" || sub.renewalAt > now || (sub.provider !== null && sub.provider !== "manual")) return null;
      const plan = planDef(sub.planCode);
      const allowance = sub.envelopeLimitOverride ?? ENVELOPE_LIMITS[sub.planCode] ?? plan.envelopeLimit;
      const usage = await advanceUsage(tx, sub, allowance, now);
      const term = termFor(sub.termMonths).months;
      const paymentAnchor = sub.paymentAnchorAt ?? shiftUtcMonth(sub.renewalAt, -term);
      let count = 1;
      let renewalAt = shiftUtcMonth(paymentAnchor, term);
      while (renewalAt <= now) {
        if (++count > 1200) throw new Error("Subscription renewal history exceeds the supported migration window");
        renewalAt = shiftUtcMonth(paymentAnchor, term * count);
      }
      const updated = await tx.subscription.updateMany({
        where: { id: sub.id, renewalAt: sub.renewalAt, status: "ACTIVE" },
        data: { renewalAt, paymentAnchorAt: paymentAnchor, lastInvoiceAt: now },
      });
      if (updated.count !== 1) return null;
      await tx.auditEvent.create({ data: {
        actor: "Docurama Billing", actorRole: "SYSTEM", tenantId: sub.tenantId,
        action: "subscription.renewed", resource: `subscription:${sub.id}`,
        tenantName: sub.tenant.name, ip: "system",
        detail: `Renewed ${plan.name} for ${term} month(s). Monthly usage metering remains independent; ${usage.carried} carried forward.`,
      } });
      return { subscriptionId: sub.id, tenantSlug: sub.tenant.slug, planCode: sub.planCode,
        carriedForward: usage.carried, usedInPeriod: usage.usedInPeriod, renewedUntil: renewalAt };
    });
    if (result) results.push(result);
  }
  return results;
}

export function termAppliedPrice(monthlyEur: number, months: number): { discountPct: number; totalEur: number } {
  const term = termFor(months);
  return { discountPct: term.discountPct, totalEur: Math.round(monthlyEur * (100 - term.discountPct) * term.months) / 100 };
}

export interface SeatCapacity {
  planCode: string;
  seatLimit: number;
  members: number;
  pendingInvites: number;
  used: number;
  remaining: number;
}

export async function seatCapacity(tenantId: string, client: Prisma.TransactionClient = db): Promise<SeatCapacity> {
  const tenant = await client.tenant.findUnique({ where: { id: tenantId } });
  const plan = planDef(tenant?.planCode ?? "STARTER");
  const [members, pendingInvites, sub] = await Promise.all([
    client.member.count({ where: { tenantId, status: { in: ["ACTIVE", "PENDING_VERIFICATION"] } } }),
    client.invitation.count({ where: { tenantId, status: "PENDING", expiresAt: { gt: new Date() } } }),
    client.subscription.findFirst({ where: { tenantId, status: { in: ["ACTIVE", "TRIALING"] } },
      orderBy: { renewalAt: "desc" }, select: { seatLimitOverride: true } }),
  ]);
  const seatLimit = sub?.seatLimitOverride ?? plan.seatLimit;
  const used = members + pendingInvites;
  return { planCode: plan.code, seatLimit, members, pendingInvites, used, remaining: Math.max(0, seatLimit - used) };
}

export async function apiAccessAllowed(tenantId: string): Promise<boolean> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { status: true, planCode: true } });
  return Boolean(tenant && tenant.status !== "SUSPENDED" && planDef(tenant.planCode).apiAccess);
}
