# Payments & Billing — Operator + Integration Guide

Everything billed flows through `src/lib/payments.ts`. Two modes, selected by environment:

| Mode | Enabled by | Checkout | Renewal driver |
|---|---|---|---|
| **stripe** | `PAYMENT_PROVIDER=stripe` **and** `STRIPE_SECRET_KEY` set | Stripe Checkout (subscription mode) | `invoice.paid` webhook → `renewPaidTerm()` |
| **manual** (default) | anything else | PENDING Payment + bank reference | background worker → `renewDueSubscriptions()` |

Both modes converge on `activateSubscription()` / `renewPaidTerm()` so the `Payment` ledger, audit trail and receipt mail are identical regardless of provider.

## 1. Stripe setup, step by step

1. **No product/price creation needed.** Checkout sessions are created with inline `price_data` (currency EUR, `unit_amount` = computed term cents, `recurring: { interval: "month", interval_count: termMonths }`) — nothing to pre-register in the Stripe catalog.
2. Set env vars: `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY=sk_live_…`, and (after step 3) `STRIPE_WEBHOOK_SECRET=whsec_…`.
3. Register the webhook endpoint in the Stripe dashboard: `https://app.<root>/api/billing/webhook`, events **`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`**. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Test with test cards (`4242 4242 4242 4242`) in test mode before flipping live keys.

The route verifies every event's signature (`constructEventAsync` over the raw body) before acting; a bad signature is 400 + an audited `billing.webhook_rejected`, a handler error is 500 so **Stripe retries** (safe — activation is idempotent per payment row).

## 2. Money math

`termCents = monthlyEur × (100 − discountPct) × months` (already euro-cents):

| Plan | Monthly | 3 mo (−5%) | 6 mo (−10%) | 12 mo (−20%) |
|---|---|---|---|---|
| Solo | €12 | €34.20 | €64.80 | €115.20 |
| Starter | €29 | €82.65 | €156.60 | 29×80×12 = **27840 c = €278.40** |
| Business | €79 | €225.15 | €426.60 | €758.40 |

Enterprise is sales-led (custom contracts; catalog anchor €349). Billing terms: monthly (no engagement) / 3 mo −5% / 6 mo −10% / 12 mo −20%, discounts applied to the whole term. The approved catalogue remains in src/lib/plans.ts; existing customer subscriptions are not silently repriced by this integration.

## 3. Renewal model

- **Stripe activation** requires a paid `checkout.session.completed` or `checkout.session.async_payment_succeeded` event and a matching local PENDING checkout payment. The subscription is retrieved from Stripe and its recurring item's service-period end becomes the local paid-through date; legacy subscription-level dates are also supported. Checkout creation supports one recurring plan item. Payment state, subscription, tenant plan, audit and receipt are committed in one transaction.
- **Stripe renewals** charge automatically every `termMonths` (`interval_count`). Only `invoice.paid` with `billing_reason=subscription_cycle` renews service. `renewPaidTerm()` uses the invoice's recurring line service-period end and actual paid amount, computes rollover for the closed period, and records the invoice reference once. Current nested and legacy subscription references are accepted; customer association alone never grants a term.
- **Event ordering and retries:** initial `subscription_create` invoices are ignored because paid checkout activation owns the first term. A renewal arriving before activation returns 500 for Stripe to retry. Replayed checkouts/invoices cannot shift dates or duplicate receipts; older paid invoices cannot rewind a newer paid period, delayed failures cannot revoke an already paid period, and late paid invoices cannot reactivate canceled subscriptions.
- **Manual subscriptions** are renewed by the worker pass (`renewDueSubscriptions`, src/lib/billing.ts), which explicitly **skips Stripe-managed rows** (`provider="stripe"` / `providerRef=sub_…`) — never double-advance those by hand.

## 4. Manual mode operations

1. Tenant picks a plan/term in Settings → Billing → checkout records a **PENDING Payment** with a quotable reference (`DRM-…`) plus SEPA instructions (billing@docurama.eu contact).
2. Tenant transfers the term total, quoting the reference.
3. Admin console → Billing section → find the PENDING payment → **payment.approve**. The bank-reference note is **mandatory** (API rejects empty notes) — it lands on the payment row and in the audit detail.
4. Approval runs `activateSubscription()` — the exact same path as a Stripe checkout completion (plan set on tenant, subscription upserted ACTIVE, receipt mail queued, `subscription.activated` audited). Idempotent: replayed webhooks or double-clicked approvals are no-ops.

Other admin ops: `payment.cancel` (PENDING only), `cancel-subscription` (reason required, cancels at period end).

## 5. Dunning & cancellation

| Stripe event | Effect |
|---|---|
| `invoice.payment_failed` | `markPastDue()` → subscription **PAST_DUE** + `failedPayment=true`, CRITICAL audit `subscription.payment_failed`, mail to the tenant's OWNER/ADMIN with update-payment instructions |
| — | Recovery: customer updates card in the Stripe billing portal (Settings → Billing → Manage payment method) and Stripe retries, or admin op **retry-payment** clears the flag and sets ACTIVE after confirming settlement |
| `customer.subscription.deleted` | `markCanceled()` → **CANCELED**; workspace data kept, plan stays active until the paid term ends |

Watch the PAST_DUE queue daily post-launch (admin Billing section); sending pauses for past-due workspaces after a grace period.

## 6. Testing

`e2e/billing.test.ts` is fully hermetic — it creates a fresh temporary SQLite schema, stubs the Stripe API with an in-process server pointed at by **`STRIPE_API_BASE`**, and signs webhook payloads with `stripe.webhooks.generateTestHeaderStringAsync()`. Covered: the money-math ladder (Solo €12 … Business €79), the full manual path (checkout → PENDING → approval/activation → PAID, audit, receipt mail), Stripe checkout/customer/portal, signature rejection, paid and asynchronous activation, provider service-period dates, renewal, PAST_DUE + dunning mail, and cancellation. Regression cases exercise concurrent/replayed approvals, duplicate and out-of-order invoices, unpaid checkout, initial-invoice double credit, unrelated customer invoices, and canceled-subscription replay.

```bash
bun test e2e/billing.test.ts     # via e2e/run.sh (wired with scratch DATABASE_URL)
E2E_SKIP_BILLING=1 bash e2e/run.sh   # skip the billing suite (e.g. no network on CI box)
```

The suite owns its `PAYMENT_PROVIDER`/`STRIPE_*` env, so it never touches a live Stripe account.
