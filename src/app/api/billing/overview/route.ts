import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentAllowance, seatCapacity } from "@/lib/billing";
import { planDef } from "@/lib/plans";
import { paymentMode } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * GET /api/billing/overview — everything Settings → Billing renders:
 * current plan, allowance, seats, term, renewal date, payment history and
 * the instance's payment mode (stripe checkout vs manual/out-of-band).
 */
export async function GET() {
  try {
    const me = await requireUser();
    if (!me.tenantId) {
      return NextResponse.json({ error: "No workspace on this account" }, { status: 400 });
    }

    const [tenant, allowance, seats, payments] = await Promise.all([
      db.tenant.findUnique({ where: { id: me.tenantId } }),
      currentAllowance(me.tenantId),
      seatCapacity(me.tenantId),
      db.payment.findMany({
        where: { tenantId: me.tenantId },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true, provider: true, kind: true, planCode: true, termMonths: true,
          amountCents: true, currency: true, status: true, reference: true,
          description: true, checkoutUrl: true, createdAt: true, paidAt: true,
        },
      }),
    ]);
    if (!tenant) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

    const subscription = await db.subscription.findFirst({
      where: { tenantId: me.tenantId },
      orderBy: { renewalAt: "desc" },
    });
    const plan = planDef(tenant.planCode);

    return NextResponse.json({
      mode: paymentMode(),
      plan: {
        code: plan.code,
        name: plan.name,
        monthlyEur: plan.monthlyEur,
        seatLimit: plan.seatLimit,
        envelopeLimit: plan.envelopeLimit,
        bestFor: plan.bestFor,
        features: plan.features,
        outcomes: plan.outcomes,
      },
      trial: tenant.status === "TRIAL" ? { endsAt: tenant.trialEndsAt } : null,
      subscription: subscription
        ? {
            status: subscription.status,
            termMonths: subscription.termMonths,
            discountPct: subscription.discountPct,
            renewalAt: subscription.renewalAt,
            paymentMethod: subscription.paymentMethod,
            provider: subscription.provider,
            failedPayment: subscription.failedPayment,
            carriedForwardEnvelopes: subscription.carriedForwardEnvelopes,
          }
        : null,
      allowance,
      seats,
      payments,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("billing/overview", err);
    return NextResponse.json({ error: "Billing overview unavailable" }, { status: 500 });
  }
}
