import { db } from "@/lib/db";
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
 * There is no payment provider wired (billing rails are a revenue-triggered
 * rung in IMPROVEMENT-PLAN §7): renewal therefore re-activates the existing
 * payment method the way a charged card would, and the event is audited so
 * the ledger says exactly what happened.
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
export async function renewDueSubscriptions(limit = 50): Promise<RenewalOutcome[]> {
  const due = await db.subscription.findMany({
    where: { status: "ACTIVE", renewalAt: { lte: new Date() } },
    include: { tenant: { select: { id: true, slug: true, planCode: true, name: true } } },
    take: limit,
  });

  const results: RenewalOutcome[] = [];
  for (const sub of due) {
    // Loop while still elapsed (a worker outage can skip several terms).
    let renewalAt = sub.renewalAt;
    const now = new Date();
    while (renewalAt <= now) {
      const next = new Date(renewalAt);
      next.setMonth(next.getMonth() + Math.max(1, sub.termMonths));
      renewalAt = next;
    }

    // Unused = allowance − usage over the period that just closed.
    const periodFrom = periodStart(sub);
    const usedInPeriod = await db.envelope.count({
      where: { tenantId: sub.tenantId, createdAt: { gte: periodFrom, lt: sub.renewalAt } },
    });
    const plan = planDef(sub.planCode);
    const allowance = (ENVELOPE_LIMITS[sub.planCode] ?? plan.envelopeLimit) + sub.carriedForwardEnvelopes;
    const unused = Math.max(0, allowance - usedInPeriod);
    const carriedForward = Math.min(unused, rolloverCap(plan));

    await db.subscription.update({
      where: { id: sub.id },
      data: { renewalAt, carriedForwardEnvelopes: carriedForward, lastInvoiceAt: new Date() },
    });
    await db.auditEvent.create({
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
    results.push({
      subscriptionId: sub.id,
      tenantSlug: sub.tenant.slug,
      planCode: sub.planCode,
      carriedForward,
      usedInPeriod,
      renewedUntil: renewalAt,
    });
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
export async function seatCapacity(tenantId: string): Promise<SeatCapacity> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  const plan = planDef(tenant?.planCode ?? "STARTER");
  const [members, pendingInvites] = await Promise.all([
    db.member.count({ where: { tenantId } }),
    db.invitation.count({ where: { tenantId, status: "PENDING" } }),
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
