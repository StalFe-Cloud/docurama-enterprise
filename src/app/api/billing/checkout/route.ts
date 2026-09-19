import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { PLAN_ORDER, SELF_SERVE_PLANS } from "@/lib/plans";
import { createCheckout, termCents, paymentMode } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/checkout — start a plan purchase/upgrade.
 *
 * Body: { planCode: string, termMonths: 1 | 3 | 6 | 12 }
 * Stripe mode → { url } to redirect to. Manual mode → { reference,
 * instructions } for a bank transfer; a platform admin approves it in the
 * admin console (Billing section) which activates the same way.
 */
export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!me.tenantId) {
      return NextResponse.json({ error: "No workspace on this account" }, { status: 400 });
    }
    if (!["OWNER", "ADMIN"].includes(me.workspaceRole ?? "") && me.role !== "PLATFORM_ADMIN") {
      return NextResponse.json({ error: "Only workspace admins can manage the plan" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { planCode?: string; termMonths?: number };
    const planCode = String(body.planCode ?? "").trim().toUpperCase();
    const termMonths = [1, 3, 6, 12].includes(Number(body.termMonths)) ? Number(body.termMonths) : 1;

    if (!PLAN_ORDER.includes(planCode as never)) {
      return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
    }
    if (planCode === "ENTERPRISE") {
      return NextResponse.json({ error: "Enterprise plans are provisioned by sales — talk to us at sales@docurama.eu" }, { status: 400 });
    }
    if (!SELF_SERVE_PLANS.includes(planCode as never) && planCode !== "SMART" && planCode !== "BUSINESS") {
      return NextResponse.json({ error: "This plan is not self-serve" }, { status: 400 });
    }

    const origin = new URL(req.url).origin;
    const result = await createCheckout({
      tenantId: me.tenantId,
      tenantName: me.tenantName ?? me.email,
      userEmail: me.email,
      userName: `${me.firstName} ${me.lastName}`.trim(),
      planCode,
      termMonths,
      origin,
    });

    return NextResponse.json({
      mode: result.mode,
      url: result.url,
      reference: result.reference,
      instructions: result.instructions,
      amountCents: result.amountCents,
      amountEur: (result.amountCents / 100).toFixed(2),
      termMonths,
      planCode,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("billing/checkout", err);
    return NextResponse.json({ error: "Checkout could not be started" }, { status: 500 });
  }
}

/** GET /api/billing/checkout — price preview without starting anything. */
export async function GET() {
  const preview = PLAN_ORDER.filter((c) => c !== "ENTERPRISE").map((code) => ({
    planCode: code,
    terms: [1, 3, 6, 12].map((m) => ({ termMonths: m, amountCents: termCents(code, m) })),
  }));
  return NextResponse.json({ mode: paymentMode(), preview });
}
