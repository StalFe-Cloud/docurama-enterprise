---
title: Checkout and Payment Methods
description: How paying for Docurama works, covering Stripe Checkout with card or SEPA, the manual bank-transfer mode, and failed-charge behavior.
group: Billing
order: 2
tags: [billing, payments, stripe]
---

Docurama has two payment modes: **Stripe Checkout**, the default on the cloud service, and **manual bank transfer**, used by self-hosted deployments and organizations that pay out of band — public bodies and companies with wire-only procurement, for example. Both modes end in exactly the same activation; only the way the money moves differs.

## Choosing a plan and term

All purchases start in **Settings → Billing**. The plan and term picker shows the four plans with their seat and envelope allowances, plus the committed-term discounts (3 months −5%, 6 months −10%, 12 months −20%; monthly is the default with no engagement). Pick a plan and a term, then continue to payment.

## Stripe Checkout

### What the customer sees

1. In **Settings → Billing**, you choose the plan and the term. The picker shows the discounted price for committed terms before you commit to anything.
2. You are handed to the **Stripe-hosted checkout page** to pay by **card or SEPA debit**. Card details are entered on Stripe's infrastructure — Docurama never sees them.
3. After paying you return to Docurama and the subscription is active immediately: plan, seats and allowance are unlocked on the spot.

### Auto-renewal

The subscription renews automatically at the end of each term and the payment method on file is charged for the next term, with the same committed discount. With SEPA, debit instructions take a few days to clear — make sure funds are available before the renewal date.

### After checkout

Everything you need later — invoices, payment methods, cancellation — lives in the Stripe customer portal, reachable from **Settings → Billing**. See [Invoices and payment history](/docs/billing/invoices-and-portal).

## Manual bank-transfer mode

When card payment is not an option, activation works the same way with a bank transfer:

1. **Request activation** of your chosen plan and term from **Settings → Billing**.
2. Docurama issues a **payment reference** for your quote.
3. **Wire the amount**, quoting the reference exactly as shown — the reference is how your transfer is matched to your workspace.
4. Once the transfer has landed, a platform admin approves it, and your subscription activates with the same plan, term, seats and allowance as if you had paid by card.

While a manual payment is pending, **Settings → Billing** shows a banner with the reference, so you always have it at hand for your bank transfer paperwork.

For anything concerning manual payments — references, transfer confirmations, activation timing — write to `billing@docurama.eu`.

## Failed charges and PAST_DUE

If an automatic renewal charge fails — an expired card, insufficient funds, a bank refusal — the subscription moves to the **PAST_DUE** state and **workspace admins receive a dunning email** explaining the failure and what to do about it.

Recovering is a two-step fix:

1. Open the Stripe customer portal from **Settings → Billing**.
2. Update or replace the payment method (a new card, for example).

Once a charge succeeds, the subscription returns to its normal active state and renewals continue on schedule. Until then, the renewal has not completed — resolve it promptly to keep sending.

## Enterprise

The Enterprise plan is not self-serve in either payment mode. Use the lead form on the [enterprise page](/enterprise); our sales team handles pricing, contracting and invoicing with you directly.
