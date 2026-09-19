---
title: FAQ and Troubleshooting
description: Straight answers to the most common support questions about sending, verification, mail, accounts, seats and the API.
group: Troubleshooting
order: 1
tags: [troubleshooting, faq, support]
---

The questions below account for most of the support traffic Docurama sees. Each answer is written to be acted on immediately; where a deeper page exists, it is linked.

## Sending and signing

### My signer never received the email — is the envelope lost?

No. The envelope and its personal signing link exist regardless of mail. Work the checklist: confirm the recipient address has no typo; ask the signer to check their spam folder; check your sending-domain posture chips in **Settings → Account** (see [Sending domains](/docs/domains/sending-domains)). If mail is the problem, bypass it — open the envelope's details and use **copy link** or the **QR code** for the pending signer. Delivery itself is never a black box: every message is an outbox ledger row with a status and an error trail ([Email delivery](/docs/notifications/email-delivery)).

### What is the difference between voiding and declining?

**Voiding** is done by the *sender*, before the envelope completes: the envelope is cancelled, its signing links stop working, and public verification reports `VOIDED`. **Declining** is done by a *signer*, with a reason: the envelope ends as `DECLINED` with the reason recorded in the ledger. Both are terminal, both are permanent parts of the audit trail, and neither deletes anything.

### My send failed with a 402 envelope quota error

Your envelope allowance for the period — including any rollover — is spent. Your options: wait for renewal (unused envelopes roll over, capped at one monthly allowance), change the plan in **Settings → Billing**, or reclaim space by checking whether a bulk sender on the team is dispatching envelopes that a template would consolidate. Recipients never cost allowance; only sending envelopes does. See [Plans and allowances](/docs/billing/plans-and-allowances).

### How does rollover math work, again?

Unused envelopes carry forward at renewal, **capped at one monthly allowance**. On Solo (50/month): use 20, and 30 carry into a next-period allowance of 80. Use none, and the cap holds the carry at 50 — a next-period allowance of 100, not 150. The allowance bar in **Settings → Billing** shows the carried amount.

## Verification

### The verification portal says NOT_SEALED — is something wrong?

No — `NOT_SEALED` means the envelope exists but has not completed: it is still a draft or waiting for signatures. Check the envelope's recipients and status in the workspace; once the last signer signs, the envelope seals and the same public code returns `VERIFIED`. See the [verification portal](/docs/verification/verify-portal).

### The evidence pack's verify.html says verification failed

Three usual causes, in order of likelihood: **the PDF was modified after download** — the pack seals a byte-exact document, so even re-saving it in a PDF editor breaks the digest; **files from different packs** — the manifest and `verify.html` must come from the same ZIP as the document; or **an outdated browser** — `verify.html` uses the browser's WebCrypto API, so use a current one. Re-download the pack and verify the untouched file.

## Mail and domains

### Invitations from our own domain land in spam

Check the posture chips in **Settings → Account → Domains**: SPF and DMARC must be green — if they are not, publish the records. The DKIM chip is a best-effort probe and may read unknown even when DKIM is configured, so treat it as informational. Also confirm the envelope was actually sent from the verified domain. Full guidance: [Sending domains](/docs/domains/sending-domains).

## Accounts and access

### I am locked out of my two-factor authentication

Use one of the ten recovery codes issued at enrolment — each works once, in place of a TOTP code. Then re-enrol from **Settings → Profile** with your new device, which issues a fresh set. No codes left? Contact `support@docurama.eu` from your account email. Details: [Two-factor authentication](/docs/account/two-factor-authentication).

### The "Continue with …" SSO button does not appear

The button only appears when the typed email's domain matches an **active** SSO connection. In **Settings → SSO**, check that the connection is active and that its domain matches the email domain exactly — `fr.yourcompany.com` and `yourcompany.com` are different domains. See [Single sign-on](/docs/account/single-sign-on).

### An invitation failed with "all seats are used"

Pending invitations hold seats: members plus pending invites must not exceed the plan's seat count. Revoke a stale invite to free its seat, or change the plan in **Settings → Billing**. See [Roles, invites and seats](/docs/teams/roles-and-invites).

## API and integrations

### The API returns 403 on an endpoint that works with another key

That is a **scope** error, not an authentication error: API keys carry scopes (ENVELOPES, TEMPLATES, and so on), and a key without the required scope gets 403 even though it authenticated fine. Create a key with the needed scopes in **Settings → API** — keys are shown once, so if you are unsure what an old key can do, revoke and re-create it.

### A 429 response — what did we do wrong?

You hit a **per-key rate limit**. It is not a security flag; it just means the integration should slow down or rely on [webhooks](/docs/webhooks) instead of tight polling loops. Each key has its own limit, so a chatty integration does not throttle the rest of the workspace.

### Where do I find a pending signer's link without waiting for email?

Open the envelope's details: each pending signer has a **copy-link** button and a **QR code**. The link is personal to that recipient — hand it only to them, never into a group chat.
