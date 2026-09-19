import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createPortalSession, paymentMode } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/portal — open the Stripe customer portal (update card,
 * download invoices, cancel). Manual mode answers with the billing contact
 * instead — no portal exists out-of-band.
 */
export async function POST(req: NextRequest) {
  try {
    const me = await requireUser();
    if (!me.tenantId) {
      return NextResponse.json({ error: "No workspace on this account" }, { status: 400 });
    }
    if (!["OWNER", "ADMIN"].includes(me.workspaceRole ?? "") && me.role !== "PLATFORM_ADMIN") {
      return NextResponse.json({ error: "Only workspace admins can manage payment methods" }, { status: 403 });
    }
    if (paymentMode() !== "stripe") {
      return NextResponse.json(
        { error: "Payment methods are managed out-of-band on this instance. Contact billing@docurama.eu for invoices, SEPA mandates and cancellations." },
        { status: 400 },
      );
    }
    const origin = new URL(req.url).origin;
    const result = await createPortalSession(me.tenantId, origin);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ url: result.url });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("billing/portal", err);
    return NextResponse.json({ error: "Portal session could not be created" }, { status: 500 });
  }
}
