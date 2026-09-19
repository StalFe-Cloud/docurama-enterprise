---
title: Invoices and Payment History
description: Where to find invoices and payment history, what the Stripe customer portal lets you do, and who to contact about manual payments.
group: Billing
order: 3
tags: [billing, invoices, portal]
---

Everything billing-related lives in one place: **Settings → Billing**. This page walks through what you see there, what the Stripe customer portal adds, and what to do when a payment fails.

## What Settings → Billing shows

- Your current **plan and term**, including any committed-term discount.
- The **renewal date** for the subscription.
- An **allowance usage bar** for envelopes this period, including the "+N carried over from last period" line when rollover applies.
- A **seat usage bar** — members plus pending invitations against your plan's seat count.
- The **payment history** of the subscription.
- The plan and term picker for changes, and the link to the Stripe customer portal.

## The Stripe customer portal

The customer portal is Stripe's self-service area for your subscription, opened from **Settings → Billing**. There you can:

| Task | Where in the portal |
| --- | --- |
| Download invoices | Invoices section — a PDF per charge |
| Add or change payment methods (card, SEPA) | Payment methods |
| Cancel the subscription | Subscription settings |

Auto-renewal charges the default payment method each term, so keeping a current card or SEPA mandate in the portal is what keeps renewals silent. Monthly terms carry no engagement and can be cancelled in the portal at any time; if you are on a committed term, talk to us before cancelling so the remaining term is handled properly.

## Payment history

Every charge on the subscription is recorded in **Settings → Billing** with its date, amount and what it paid for. For finance teams, the history plus the portal invoices give a complete audit trail of what was bought and when. In manual bank-transfer mode there are no Stripe invoices: your bank transfer confirmation, together with the approved payment record in the workspace, serves as the receipt.

## Dunning emails

When an automatic charge fails, the subscription moves to PAST_DUE and a **dunning email is sent to the workspace admins** — the owner and the admins, so whoever handles finance sees it, not just the person who originally paid. The email explains what failed and points to the customer portal to fix the payment method. Once the charge succeeds, the subscription returns to active without further action needed from you. See [Checkout and payments](/docs/billing/checkout-and-payments) for the full failed-charge flow.

## Manual-mode accounting

In manual bank-transfer mode, the reference shown in the pending-payment banner in **Settings → Billing** is the thread that ties your bank transfer to your subscription. Keep it in your payment paperwork. For anything about manual payments — confirming a transfer was received, re-issuing a reference, asking when activation will happen — write to `billing@docurama.eu`.

## Tips for finance teams

- All workspace admins can open **Settings → Billing**, so finance does not need to share one person's login to reach invoices.
- Download invoices from the portal as they arrive rather than at year-end; the portal keeps them, but your accounting system should too.
- Add a second payment method in the portal before the primary card expires — it is the cheapest way to avoid a PAST_DUE round-trip.
