---
title: "The Docurama roadmap: what shipped, what ships next"
description: "The current signer flow, deployment options and planned work, with assurance limits stated explicitly."
date: 2026-09-14
author: "Docurama Team"
tags: [product, roadmap]
draft: false
---

We keep a public improvement log and a transparency log for the platform itself — fitting, for a company whose product is proof. This post is the readable version: what shipped recently, and what is next.

## Recently shipped

**The signer journey.** A public signing portal at `/sign/{token}` offers contract review, typed signature adoption, explicit consent, recipient fields, routing order and decline with a reason. Completed envelopes provide separate document and signing-record PDFs.

**Evidence packs and offline verification.** Every completed envelope exports a ZIP — generated document artifacts, ledger CSV, bilingual certificate, signed manifest — with a browser-only verifier that needs zero network access. Proven in real Chromium by our test suite.

**Transparency records.** Inclusion proofs can accompany recorded envelope digests where the configured registry produces them. External witnessing must be checked for each deployment.

**S3-compatible storage.** A dual-engine document store: local POSIX by default, or any S3-compatible backend — verified against a real SeaweedFS in CI, with a compose profile to match.

**Deployment readiness.** Health endpoint with dependency checks, SMTP transport with retry/backoff, HMAC-signed webhooks, hardened Docker packaging, Helm chart, backup script.

**Payments and SSO (the go-live cycle).** Stripe Checkout with webhook-driven renewals and a manual bank-transfer mode for self-hosters; OIDC and SAML single sign-on with domain-bound JIT provisioning; bot protection on every public form.

**Guided onboarding for every persona.** A GitBook-style wizard for new users (account → email → organization → signature → invites → 2FA), per-plan first-step guides on the home screen, an admin operations checklist, and a sales-assisted enterprise pipeline.

## What ships next

In rough priority order:

1. **Assess stronger identity and certificate signing requirements** — research only; no qualified-signing integration or partner is currently promised.
2. **Bulk send and merge fields** — CSV-driven mass sending with per-recipient field substitution, for HR and procurement.
3. **Mobile app** — sign and verify on iOS/Android with the same recorded evidence.
4. **Template analytics** — time-to-sign, decline reasons and bottleneck analysis per template.
5. **Webhook catalog expansion** — more events, replay from the admin console, endpoint health history.
6. **Additional interface and message languages** — expand the languages supported by each part of the workflow.

## How to influence it

The fastest paths: the *Feedback* link inside the app (it creates a tracked ticket, not a black hole), or the [enterprise pipeline](/enterprise) for anything volume- or compliance-shaped. Roadmap items that came from customer conversations ship first more often than you would think.

Ship early, prove everything, write it down — that is the loop. Watch the [blog](/blog) and the [transparency log](/security) for what lands.
