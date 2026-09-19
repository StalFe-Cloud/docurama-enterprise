import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { ENVELOPE_LIMITS, planDef, rolloverCap, termFor } from "@/lib/plans";

/**
 * Billing engine (cycle 10): envelope allowances, committed-term discounts and
 * rollover of unused envelopes on renewal.
 *
 * Quota model:
 *   allowance(period) = plan.envelopeLimit + carriedForwardEnvelopes
 *
 * Renewal (triggered by the background worker, the admin console, or inline
 * when a send notices an elapsed term): when `renewalAt` has passed, the
 * subscription rolls to the next period. Unused envelopes carry forward,
 * capped at one monthly allowance (src/lib/plans.ts rolloverCap) — a quiet
 * month is never lost, but allowances can't be hoarded indefinitely.
 *
 * Manual/out-of-band subscriptions renew here and are audited. Stripe-managed
 * subscriptions advance only through verified payment-provider webhooks.
 */

export interface Allowance {
  /** Plan allowance for the current period. */
  limit: number;
  /** Rollover carried into the current period (0 when none). */
  carriedForward: number;
  /** Total sendable this period. */
  total: number;
  /** Envelopes sent since the current period started. */
  used: number;
  remaining: number;
}

/** Start of the metering window: the subscription's current period, or the calendar month as fallback. */
export function periodStart(subscription: { renewalAt: Date; termMonths: number } | null): Date {
  if (!subscription || subscription.termMonths <= 0) {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  // Current period = [renewalAt - termMonths, renewalAt)
  const start = new Date(subscription.renewalAt);
  start.setMonth(start.getMonth() - subscription.termMonths);
  return start;
}

export async function currentAllowance(tenantId: string): Promise<Allowance> {
  // A stopped worker must not freeze manual subscriptions in an expired window.
  // Provider-managed subscriptions remain webhook-driven.
  await renewDueSubscriptions(50, tenantId);
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    include: { subscriptions: { orderBy: { renewalAt: "desc" }, take: 1 } },
  });
  if (!tenant) {
    return { limit: 0, carriedForward: 0, total: 0, used: 0, remaining: 0 };
  }
  const plan = planDef(tenant.planCode);
  const sub = tenant.subscriptions[0] ?? null;
  const carriedForward = sub?.carriedForwardEnvelopes ?? 0;
  const used = await db.envelope.count({
    where: { tenantId, createdAt: { gte: periodStart(sub) } },
  });
  const total = ENVELOPE_LIMITS[tenant.planCode] ?? plan.envelopeLimit;
  return {
    limit: plan.envelopeLimit,
    carriedForward,
    total: total + carriedForward,
    used,
    remaining: Math.max(0, total + carriedForward - used),
  };
}

export interface RenewalOutcome {
  subscriptionId: string;
  tenantSlug: string;
  planCode: string;
  carriedForward: number;
  usedInPeriod: number;
  renewedUntil: Date;
}

/**
 * Renew every ACTIVE subscription whose term has elapsed. Idempotent: safe to
 * call repeatedly (worker cadence or manual) — only subscriptions with
 * renewalAt <= now are touched, each exactly once per elapsed term.
 */
export async function renewDueSubscriptions(limit = 50, tenantId?: string): Promise<RenewalOutcome[]> {
  const due = await db.subscription.findMany({
    // Stripe-managed subscriptions renew via webhook (invoice.paid) — the
    // worker only advances manual/out-of-band subscriptions.
    where: {
      status: "ACTIVE",
      ...(tenantId ? { tenantId } : {}),
      renewalAt: { lte: new Date() },
      OR: [{ provider: null }, { provider: "manual" }],
    },
    select: { id: true },
    take: limit,
  });

  const results: RenewalOutcome[] = [];
  for (const candidate of due) {
    const outcome = await db.$transaction(async (tx) => {
    const now = new Date();
    const sub = await tx.subscription.findUnique({
      where: { id: candidate.id }, include: { tenant: { select: { id: true, slug: true, name: true } } },
    });
    // Recheck after acquiring the transaction: another reader may have renewed.
    if (!sub || sub.status !== "ACTIVE" || sub.renewalAt > now ||
        (sub.provider !== null && sub.provider !== "manual")) return null;
    const plan = planDef(sub.planCode);
    let renewalAt = sub.renewalAt;
    let carriedForward = sub.carriedForwardEnvelopes;
    let usedInPeriod = 0;
    let allowance = 0;
    while (renewalAt <= now) {
      usedInPeriod = await tx.envelope.count({
        where: { tenantId: sub.tenantId, createdAt: { gte: periodStart({ renewalAt, termMonths: sub.termMonths }), lt: renewalAt } },
      });
      allowance = (ENVELOPE_LIMITS[sub.planCode] ?? plan.envelopeLimit) + carriedForward;
      carriedForward = Math.min(Math.max(0, allowance - usedInPeriod), rolloverCap(plan));
      const next = new Date(renewalAt);
      next.setMonth(next.getMonth() + Math.max(1, sub.termMonths));
      renewalAt = next;
    }
    const changed = await tx.subscription.updateMany({
      where: { id: sub.id, renewalAt: sub.renewalAt, status: "ACTIVE" },
      data: { renewalAt, carriedForwardEnvelopes: carriedForward, lastInvoiceAt: new Date() },
    });
    if (changed.count !== 1) return null;
    await tx.auditEvent.create({
      data: {
        actor: "Docurama Billing",
        actorRole: "SYSTEM",
        action: "subscription.renewed",
        resource: `subscription:${sub.id}`,
        tenantName: sub.tenant.name,
        ip: "system",
        detail:
          `Renewed ${plan.name} (${sub.termMonths}-month term, −${sub.discountPct}%). ` +
          `Used ${usedInPeriod}/${allowance} envelopes in the closed period; ${carriedForward} carried forward (cap ${rolloverCap(plan)}).`,
      },
    });
    return {
      subscriptionId: sub.id,
      tenantSlug: sub.tenant.slug,
      planCode: sub.planCode,
      carriedForward,
      usedInPeriod,
      renewedUntil: renewalAt,
    };
    });
    if (outcome) results.push(outcome);
  }
  return results;
}

/** Apply a billing term to a subscription (admin/console action). */
export function termAppliedPrice(monthlyEur: number, months: number): { discountPct: number; totalEur: number } {
  const term = termFor(months);
  const totalEur = Math.round(monthlyEur * (100 - term.discountPct) * months) / 100;
  return { discountPct: term.discountPct, totalEur };
}

// ─── Seat capacity ───────────────────────────────────────────────────────────

export interface SeatCapacity {
  planCode: string;
  seatLimit: number;
  members: number;
  pendingInvites: number;
  /** Members + pending invitations occupying a seat. */
  used: number;
  remaining: number;
}

/**
 * Seat occupancy for a tenant. Pending invitations hold a seat (they become a
 * member on acceptance), so the invitation path enforces capacity against
 * members + outstanding invites.
 */
export async function seatCapacity(tenantId: string, client: Prisma.TransactionClient = db): Promise<SeatCapacity> {
  const tenant = await client.tenant.findUnique({ where: { id: tenantId } });
  const plan = planDef(tenant?.planCode ?? "STARTER");
  const [members, pendingInvites] = await Promise.all([
    // Pending mailbox proof reserves a seat but grants no access. Disabled
    // memberships release their seat; reactivation must re-check capacity.
    client.member.count({ where: { tenantId, status: { in: ["ACTIVE", "PENDING_VERIFICATION"] } } }),
    client.invitation.count({ where: { tenantId, status: "PENDING", expiresAt: { gt: new Date() } } }),
  ]);
  const used = members + pendingInvites;
  return {
    planCode: plan.code,
    seatLimit: plan.seatLimit,
    members,
    pendingInvites,
    used,
    remaining: Math.max(0, plan.seatLimit - used),
  };
}

/** Entitlement check for issuance and every authenticated integration request. */
export async function apiAccessAllowed(tenantId: string): Promise<boolean> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { status: true, planCode: true } });
  return Boolean(tenant && tenant.status !== "SUSPENDED" && planDef(tenant.planCode).apiAccess);
}
