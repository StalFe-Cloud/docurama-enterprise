import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripeClient } from "@/lib/payments";
import { activateSubscription, renewPaidTerm, markPastDue, markCanceled } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/webhook — Stripe events, signature-verified.
 *
 * Handled events:
 *   checkout.session.completed        → activate only once payment is paid
 *   checkout.session.async_payment_succeeded → activate a delayed paid checkout
 *   invoice.paid                      → apply the paid recurring service period
 *   invoice.payment_failed            → PAST_DUE + mail to the billing contact
 *   customer.subscription.deleted     → CANCELED (data kept, term honored)
 *
 * Initial invoices are owned by checkout activation. Other invoice types and
 * unrelated events are acknowledged 200. Payment claims, entitlements, audit
 * and receipt records commit together so retries cannot grant duplicate terms.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhooks not configured on this instance" }, { status: 400 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  // Raw body is required for signature verification — read before any JSON parse.
  const raw = await req.text();
  const stripe = stripeClient();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, secret);
  } catch (err) {
    await db.auditEvent.create({
      data: {
        actor: "Stripe",
        actorRole: "SYSTEM",
        action: "billing.webhook_rejected",
        resource: "billing",
        ip: "system",
        severity: "WARNING",
        detail: `Signature verification failed: ${err instanceof Error ? err.message : "unknown error"}`,
      },
    }).catch(() => undefined);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        // A completed checkout can still be awaiting an asynchronous payment.
        if (session.payment_status !== "paid") break;
        const tenantId = session.client_reference_id ?? session.metadata?.tenantId ?? null;
        const planCode = session.metadata?.planCode ?? null;
        const termMonths = Number(session.metadata?.termMonths ?? 1);
        if (!tenantId || !planCode) throw new Error("Checkout identity metadata is missing");
        const recorded = await db.payment.findFirst({ where: { provider: "stripe", reference: session.id } });
        if (!recorded) throw new Error("Checkout payment has not been recorded yet");
        if (recorded.status === "PAID") break;
        const subscriptionRef = objectId(session.subscription);
        if (!subscriptionRef) throw new Error("Paid checkout has no subscription");
        const providerSubscription = await stripe.subscriptions.retrieve(subscriptionRef);
        if (providerSubscription.status === "canceled") break;
        const providerPeriodEnd = subscriptionPeriodEnd(providerSubscription);

        await activateSubscription({
          tenantId,
          planCode,
          termMonths: [1, 3, 6, 12].includes(termMonths) ? termMonths : 1,
          provider: "stripe",
          providerRef: subscriptionRef,
          providerPeriodEnd,
          paymentReference: session.id,
          actor: "Stripe",
          actorRole: "SYSTEM",
          note: `checkout ${session.id}`,
        });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        // Checkout owns the initial paid term. One-off invoices, prorations and
        // subscription creation must not add another whole term.
        if (invoice.billing_reason !== "subscription_cycle") break;
        const subRef = invoiceSubscriptionRef(invoice);
        if (!subRef) break;
        const sub = await db.subscription.findFirst({ where: { provider: "stripe", providerRef: subRef } });
        if (!sub) throw new Error("Renewal arrived before its subscription activation");
        await renewPaidTerm(sub.id, invoice.id, invoicePeriodEnd(invoice), invoice.amount_paid);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = invoiceSubscriptionRef(invoice);
        if (subRef) await markPastDue(subRef, invoice.id, invoicePeriodEnd(invoice));
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await markCanceled(subscription.id);
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true, type: event.type });
  } catch (err) {
    console.error("billing/webhook", event.type, err);
    // 500 makes Stripe retry — the right answer for transient DB failures.
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

function objectId(value: string | { id: string } | null | undefined): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

function invoiceSubscriptionRef(invoice: Stripe.Invoice): string | null {
  // Current Stripe API nests the subscription under parent; older webhook
  // endpoints can still deliver the former top-level property.
  return objectId(invoice.parent?.subscription_details?.subscription) ??
    objectId((invoice as Stripe.Invoice & { subscription?: string | { id: string } }).subscription);
}

function validPeriodEnd(seconds: number | undefined): Date {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) throw new Error("Stripe service period is missing");
  return new Date(seconds * 1000);
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date {
  // Docurama checkout creates exactly one recurring plan item. Use Stripe's
  // dates so retries or late events cannot shift the purchased service term.
  const items = subscription.items?.data ?? [];
  if (items.length > 1) throw new Error("Subscription must contain one recurring plan item");
  return validPeriodEnd(items[0]?.current_period_end ??
    (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end);
}

function invoicePeriodEnd(invoice: Stripe.Invoice): Date {
  const subscriptionLines = (invoice.lines?.data ?? []).filter((line) =>
    line.parent?.type === "subscription_item_details" ||
    (line as typeof line & { type?: string }).type === "subscription",
  );
  if (subscriptionLines.length !== 1) throw new Error("Invoice must identify one recurring plan service period");
  return validPeriodEnd(subscriptionLines[0].period?.end);
}
