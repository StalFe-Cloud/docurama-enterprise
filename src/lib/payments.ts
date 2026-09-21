import Stripe from "stripe";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { planDef, termFor } from "@/lib/plans";
import { monthlyWindow, shiftUtcMonth, usageAnchor } from "@/lib/monthly-period";
import { serializableTransaction } from "@/lib/transaction";

/**
 * Payment provider rails (go-live cycle).
 *
 * Two modes, selected by environment:
 *
 *   stripe  — PAYMENT_PROVIDER=stripe + STRIPE_SECRET_KEY. Self-serve
 *             checkout over Stripe Checkout (subscription mode: the chosen
 *             term is charged every termMonths automatically). Renewals are
 *             webhook-driven (invoice.paid advances the term in-app,
 *             invoice.payment_failed flips the subscription to PAST_DUE) —
 *             the platform's own renewal worker never touches Stripe-managed
 *             subscriptions.
 *
 *   manual  — default, and the self-host / out-of-band mode. Checkout
 *             records a PENDING Payment with a bank reference; the customer
 *             pays by transfer/SEPA; a platform admin approves it in the
 *             admin console (Billing section), which runs the exact same
 *             activation path as a Stripe checkout.session.completed event.
 *             The platform's renewal worker renews manual subscriptions when
 *             the term elapses (pre-existing behaviour, unchanged).
 *
 * Both modes converge on activateSubscription() / renewPaidTerm() so the
 * ledger (Payment rows), audit trail and mail receipts are identical.
 */

export type PaymentMode = "stripe" | "manual";

export function paymentMode(): PaymentMode {
  return process.env.PAYMENT_PROVIDER === "stripe" && process.env.STRIPE_SECRET_KEY ? "stripe" : "manual";
}

/** Test seam: point the Stripe SDK at a local stub server (STRIPE_API_BASE). */
function stripeHostConfig(): Pick<Stripe.StripeConfig, "host" | "port" | "protocol"> | undefined {
  const base = process.env.STRIPE_API_BASE;
  if (!base || !/^https?:\/\//.test(base)) return undefined;
  try {
    const u = new URL(base);
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80,
      protocol: u.protocol.replace(":", "") as "http" | "https",
    };
  } catch {
    return undefined;
  }
}

let stripeSingleton: Stripe | null = null;

export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY ?? "sk_test_disabled";
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key, {
      apiVersion: "2026-08-26.dahlia" as Stripe.LatestApiVersion,
      maxNetworkRetries: 2,
      ...stripeHostConfig(),
    });
  }
  return stripeSingleton;
}

/** Test seam: reset the singleton when the api base changes. */
export function resetStripeClient(): void {
  stripeSingleton = null;
}

// ─── Money math ───────────────────────────────────────────────────────────────

/** Total cents charged for a plan under a committed term (discount applied). */
export function termCents(planCode: string, termMonths: number): number {
  const plan = planDef(planCode);
  const term = termFor(termMonths);
  // monthlyEur × (100 − discountPct) × months is already euro-cents:
  // Starter 12mo → 29 × 80 × 12 = 27840 cents = €278.40.
  return Math.round(plan.monthlyEur * (100 - term.discountPct) * term.months);
}

export function centsToEur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

// ─── Checkout ────────────────────────────────────────────────────────────────

const MANUAL_INSTRUCTIONS = `Transfer the term total to Docurama SAS (SEPA / bank transfer) with the payment reference shown below as the communication. Your plan activates as soon as our billing team confirms the transfer (usually one business day). Questions: billing@docurama.eu.`;

export interface CheckoutResult {
  mode: PaymentMode;
  /** Stripe Checkout URL (stripe mode) — redirect the customer here. */
  url?: string;
  /** Manual payment reference to quote on the bank transfer. */
  reference: string;
  amountCents: number;
  instructions?: string;
}

export async function createCheckout(input: {
  tenantId: string;
  tenantName: string;
  userEmail: string;
  userName: string;
  planCode: string;
  termMonths: number;
  origin: string;
}): Promise<CheckoutResult> {
  const plan = planDef(input.planCode);
  const term = termFor(input.termMonths);
  const amountCents = termCents(input.planCode, input.termMonths);
  const description = `${plan.name} plan — ${term.months}-month term${term.discountPct ? ` (−${term.discountPct}%)` : ""}`;

  if (paymentMode() === "stripe") {
    const stripe = stripeClient();
    const customer = await getOrCreateStripeCustomer(input.tenantId, input.userEmail, `${input.userName} · ${input.tenantName}`);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.externalId,
      client_reference_id: input.tenantId,
      metadata: { tenantId: input.tenantId, planCode: input.planCode, termMonths: String(input.termMonths) },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: amountCents,
            recurring: { interval: "month", interval_count: term.months },
            product_data: { name: `Docurama ${plan.name}`, description },
          },
        },
      ],
      success_url: `${input.origin}/settings/billing?checkout=success`,
      cancel_url: `${input.origin}/settings/billing?checkout=canceled`,
    });

    await db.payment.create({
      data: {
        tenantId: input.tenantId,
        provider: "stripe",
        kind: "checkout",
        planCode: input.planCode,
        termMonths: input.termMonths,
        amountCents,
        status: "PENDING",
        reference: session.id,
        checkoutUrl: session.url ?? undefined,
        description,
      },
    });
    return { mode: "stripe", url: session.url ?? undefined, reference: session.id, amountCents };
  }

  // Manual mode: bank transfer with a quoteable reference.
  const reference = `DRM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  await db.payment.create({
    data: {
      tenantId: input.tenantId,
      provider: "manual",
      kind: "checkout",
      planCode: input.planCode,
      termMonths: input.termMonths,
      amountCents,
      status: "PENDING",
      reference,
      description,
    },
  });
  return { mode: "manual", reference, amountCents, instructions: MANUAL_INSTRUCTIONS };
}

async function getOrCreateStripeCustomer(tenantId: string, email: string, name: string) {
  const existing = await db.paymentCustomer.findUnique({ where: { tenantId_provider: { tenantId, provider: "stripe" } } });
  if (existing) return existing;
  const stripe = stripeClient();
  const customer = await stripe.customers.create({ email, name, metadata: { tenantId } });
  return db.paymentCustomer.create({
    data: { tenantId, provider: "stripe", externalId: customer.id },
  });
}

// ─── Activation (shared by Stripe webhook and manual admin approval) ─────────

export interface ActivateResult {
  subscriptionId: string;
  renewalAt: Date;
  planCode: string;
  termMonths: number;
}

/**
 * Activate (or change) a tenant's plan for a paid term. Idempotent per
 * payment row: a replayed webhook or a double-clicked approval is a no-op.
 */
export async function activateSubscription(input: {
  tenantId: string;
  planCode: string;
  termMonths: number;
  provider: "stripe" | "manual";
  providerRef?: string | null;
  paymentId?: string | null;
  paymentReference?: string | null;
  /** Authoritative paid service-period end from Stripe; manual terms use now. */
  providerPeriodEnd?: Date;
  actor: string;
  actorRole: string;
  note?: string;
}): Promise<ActivateResult> {
  const plan = planDef(input.planCode);
  const term = termFor(input.termMonths);
  const now = new Date();
  const renewalAt = shiftUtcMonth(now, term.months);
  const amountCents = termCents(input.planCode, input.termMonths);
  const paidUntil = input.provider === "stripe" ? input.providerPeriodEnd : renewalAt;
  if (!paidUntil || !Number.isFinite(paidUntil.getTime())) throw new Error("A valid provider service-period end is required");

  return serializableTransaction(async (tx) => {
    const payment = input.paymentId
      ? await tx.payment.findUnique({ where: { id: input.paymentId } })
      : input.paymentReference ? await tx.payment.findFirst({ where: { provider: input.provider, reference: input.paymentReference } }) : null;
    if (!payment || payment.tenantId !== input.tenantId || payment.provider !== input.provider ||
        payment.kind !== "checkout" || payment.planCode !== input.planCode || payment.termMonths !== term.months) {
      throw new Error("Activation must match a recorded checkout payment");
    }
    const existing = await tx.subscription.findFirst({ where: { tenantId: input.tenantId }, orderBy: { renewalAt: "desc" } });
    if (payment.status === "PAID") {
      if (!existing) throw new Error("Paid checkout has no subscription");
      return { subscriptionId: existing.id, renewalAt: existing.renewalAt, planCode: existing.planCode, termMonths: existing.termMonths };
    }
    if (payment.status !== "PENDING") throw new Error("Only pending checkout payments can activate subscriptions");
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "PAID", paidAt: new Date(), approverNote: input.note },
    });
    if (claimed.count !== 1) throw new Error("Checkout payment changed during activation");
    const tenant = await tx.tenant.update({ where: { id: input.tenantId }, data: { planCode: input.planCode } });

    const usage = monthlyWindow(existing ? { ...existing, usageAnchorAt: usageAnchor(existing, now) } : { renewalAt: paidUntil, termMonths: term.months, usageAnchorAt: now }, now);
    const metering = existing
      ? { usageAnchorAt: existing.usageAnchorAt ?? usage.anchor }
      : { usageAnchorAt: usage.anchor, usagePeriodStart: usage.start, usagePeriodEnd: usage.end };
    const sub = await tx.subscription.upsert({
      where: { id: existing?.id ?? "" },
      update: {
        ...metering, paymentAnchorAt: now,
        planCode: input.planCode,
        status: "ACTIVE",
        mrrEur: plan.monthlyEur,
        renewalAt: paidUntil,
        termMonths: term.months,
        discountPct: term.discountPct,
        failedPayment: false,
        lastInvoiceAt: new Date(),
        provider: input.provider,
        ...(input.providerRef !== undefined ? { providerRef: input.providerRef } : {}),
      },
      create: {
        ...metering, paymentAnchorAt: now,
        tenantId: input.tenantId,
        planCode: input.planCode,
        status: "ACTIVE",
        mrrEur: plan.monthlyEur,
        seats: Math.min(plan.seatLimit, 10),
        renewalAt: paidUntil,
        termMonths: term.months,
        discountPct: term.discountPct,
        paymentMethod: input.provider === "stripe" ? "Stripe" : "Bank transfer",
        provider: input.provider,
        providerRef: input.providerRef ?? null,
        lastInvoiceAt: new Date(),
      },
    });

    await tx.auditEvent.create({
      data: {
        actor: input.actor,
        actorRole: input.actorRole,
        action: "subscription.activated",
        resource: `tenant:${tenant.slug}`,
        tenantId: tenant.id, tenantName: tenant.name,
        ip: "system",
        severity: "WARNING",
        detail:
          `${plan.name} activated for ${term.months} month(s) via ${input.provider}` +
          `${term.discountPct ? ` (term −${term.discountPct}%)` : ""} — ${centsToEur(amountCents)}.` +
          (input.note ? ` Note: ${input.note}` : ""),
      },
    });

    await queueReceiptMail(input.tenantId, plan.name, term.months, amountCents, paidUntil, tx);

    return { subscriptionId: sub.id, renewalAt: paidUntil, planCode: input.planCode, termMonths: term.months };
  });
}

/** Renewal of a Stripe-managed subscription: one term paid, rollover computed. */
export async function renewPaidTerm(subscriptionId: string, invoiceRef: string, paidPeriodEnd: Date, amountPaidCents: number, actor = "Docurama Billing"): Promise<void> {
  if (!Number.isFinite(paidPeriodEnd.getTime()) || !Number.isSafeInteger(amountPaidCents) || amountPaidCents < 0) throw new Error("Invalid paid invoice period or amount");
  await serializableTransaction(async (tx) => {
    const sub = await tx.subscription.findUnique({ where: { id: subscriptionId }, include: { tenant: true } });
    if (!sub || sub.provider !== "stripe") throw new Error("Stripe subscription is not activated yet");
    if (await tx.payment.findFirst({ where: { provider: "stripe", reference: invoiceRef, status: "PAID" } })) return;

    // A delayed invoice must neither rewind the paid-through date nor reactivate
    // a canceled subscription. Keep its receipt in the ledger exactly once.
    const advances = paidPeriodEnd > sub.renewalAt && sub.status !== "CANCELED";

    // Payment receipts never award monthly rollover; the usage engine does it once.
    const plan = planDef(sub.planCode);
    const anchor = usageAnchor(sub);

    const renewalAt = advances ? paidPeriodEnd : sub.renewalAt;

    if (advances) await tx.subscription.update({
      where: { id: sub.id },
      data: { renewalAt, usageAnchorAt: sub.usageAnchorAt ?? anchor, status: "ACTIVE", failedPayment: false, lastInvoiceAt: new Date() },
    });
    await tx.payment.create({
      data: {
        tenantId: sub.tenantId,
        provider: sub.provider ?? "manual",
        kind: "renewal",
        planCode: sub.planCode,
        termMonths: sub.termMonths,
        amountCents: amountPaidCents,
        status: "PAID",
        reference: invoiceRef,
        description: `${plan.name} renewal — ${sub.termMonths} month(s)`,
        paidAt: new Date(),
      },
    });
    await tx.auditEvent.create({
      data: {
        actor,
        actorRole: "SYSTEM",
        action: advances ? "subscription.renewed" : "billing.invoice_recorded",
        resource: `subscription:${sub.id}`,
        tenantId: sub.tenantId, tenantName: sub.tenant.name,
        ip: "system",
        detail:
          `Stripe invoice ${invoiceRef} recorded. Paid-through ${renewalAt.toISOString()}; monthly rollover remains independent.`,
      },
    });
  });
}

/** A Stripe charge failed: flip to PAST_DUE and tell the billing contact. */
export async function markPastDue(providerSubscriptionRef: string, invoiceRef: string, failedPeriodEnd?: Date): Promise<void> {
  await serializableTransaction(async (tx) => {
    const sub = await tx.subscription.findFirst({ where: { provider: "stripe", providerRef: providerSubscriptionRef }, include: { tenant: true } });
    if (!sub || sub.status === "PAST_DUE" || sub.status === "CANCELED") return;
    if (await tx.payment.findFirst({ where: { provider: "stripe", reference: invoiceRef, status: "PAID" } })) return;
    if (failedPeriodEnd && failedPeriodEnd <= sub.renewalAt) return;
    await tx.subscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE", failedPayment: true } });
    await tx.auditEvent.create({
      data: {
        actor: "Docurama Billing",
        actorRole: "SYSTEM",
        action: "subscription.payment_failed",
        resource: `subscription:${sub.id}`,
        tenantId: sub.tenantId, tenantName: sub.tenant.name,
        ip: "system",
        severity: "CRITICAL",
        detail: `Stripe charge failed (${invoiceRef}). Subscription marked PAST_DUE — retry or update the payment method via the billing portal.`,
      },
    });
    const owner = await tx.member.findFirst({
      where: { tenantId: sub.tenantId, role: { in: ["OWNER", "ADMIN"] } },
      include: { user: true },
    });
    if (owner) {
      await tx.mailOutbox.create({
        data: {
          toEmail: owner.user.email,
          subject: `Action needed: payment failed for ${sub.tenant.name}`,
          template: "BILLING",
          bodyText:
            `Our attempt to charge your ${planDef(sub.planCode).name} subscription failed (invoice ${invoiceRef}).\n\n` +
            `Your workspace is now marked past due. Update your payment method from Settings → Billing → Manage payment method, ` +
            `or reply to this email if you believe this is an error. Envelope sending is paused for past-due workspaces after a grace period.`,
        },
      });
    }
  });
}

/** The customer canceled in the Stripe portal: mark CANCELED, keep the data. */
export async function markCanceled(providerSubscriptionRef: string): Promise<void> {
  const sub = await db.subscription.findFirst({ where: { providerRef: providerSubscriptionRef }, include: { tenant: true } });
  if (!sub || sub.status === "CANCELED") return;
  await db.subscription.update({ where: { id: sub.id }, data: { status: "CANCELED" } });
  await db.auditEvent.create({
    data: {
      actor: "Docurama Billing",
      actorRole: "SYSTEM",
      action: "subscription.canceled",
      resource: `tenant:${sub.tenant.slug}`,
      tenantId: sub.tenantId, tenantName: sub.tenant.name,
      ip: "system",
      severity: "WARNING",
      detail: "Subscription canceled from the Stripe customer portal. The workspace keeps its data; the plan stays active until the paid term ends.",
    },
  });
}

// ─── Receipts ────────────────────────────────────────────────────────────────

async function queueReceiptMail(tenantId: string, planName: string, months: number, amountCents: number, renewalAt: Date, client: Prisma.TransactionClient = db) {
  const owner = await client.member.findFirst({ where: { tenantId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } }, include: { user: true } });
  if (!owner) return;
  await client.mailOutbox.create({
    data: {
      toEmail: owner.user.email,
      subject: `Receipt: ${planName} activated — ${centsToEur(amountCents)}`,
      template: "BILLING",
      bodyText:
        `Your ${planName} plan is active for ${months} month(s). Amount charged: ${centsToEur(amountCents)}.\n\n` +
        `Next renewal: ${renewalAt.toISOString().slice(0, 10)}. Unused envelopes roll over on renewal (up to one monthly allowance).\n` +
        `Manage payment methods and invoices any time from Settings → Billing.`,
    },
  });
}

// ─── Portal ──────────────────────────────────────────────────────────────────

export async function createPortalSession(tenantId: string, origin: string): Promise<{ url: string } | { error: string }> {
  const customer = await db.paymentCustomer.findUnique({ where: { tenantId_provider: { tenantId, provider: "stripe" } } });
  if (!customer) return { error: "No Stripe customer on file yet — start a checkout first." };
  const stripe = stripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.externalId,
    return_url: `${origin}/settings/billing`,
  });
  return { url: session.url };
}
