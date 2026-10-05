---
title: "Docurama: sign documents and inspect recorded evidence"
description: "Docurama provides email-link signing, recorded consent and digest evidence, with verification and self-hosting options."
date: 2026-09-19
author: "Docurama Team"
tags: [product, announcement]
draft: false
---

Docurama records email-link document signing and provides artifacts you can inspect later. This post describes the current workflow and its limits.

## What we built

Docurama records **the contract, recipient adoption and explicit consent**. The current flow produces these records and artifacts:

- **Recorded signing evidence.** The email-link flow records typed signature adoption, explicit consent and recipient field values against the contract snapshot, with digest evidence and separate completed-document and signing-record PDFs.
- **A public verification portal.** Every completed document carries a public code. Anyone — your counterparty, your auditor, a court — can inspect the reported digest evidence and event ledger at [docurama.eu/verify](https://docurama.eu/verify) without an account.
- **Evidence packs.** One click exports a ZIP with generated document artifacts, the event ledger, a bilingual certificate and a signed manifest you can verify offline, in a browser, with zero network access.
- **Transparency evidence.** Where the deployment produces a transparency entry, its inclusion proof can be inspected alongside the envelope record; external witnessing depends on the configured integration.

## Plans from €12 a month

We spent a long time on pricing, because eSignature pricing in Europe is either opaque or punitive. Ours is neither:

| Plan | Price | Seats | Envelopes / month |
|---|---|---|---|
| Solo | €12 | 1 | 30 |
| Starter | €29 | 3 | 100 |
| Business | €79 | 10 | 250 |
| Enterprise | Custom | Custom | Custom |

Solo provides one seat and 30 monthly envelopes; Starter provides three seats and 100. Unused envelopes roll into the next period, capped at one monthly allowance. Committing to 3, 6 or 12 months takes 5, 10 or 20 percent off. We explain the philosophy in a [separate post](/blog/pricing-philosophy).

## Match the deployment and assurance to your requirements

Storage location, mail delivery and external integrations depend on the deployment. The current signing flow uses recipient email links, typed adoption and explicit consent. It does not provide advanced or qualified signing, independent timestamping or certification of regulatory compliance. Review the actual deployment and transaction requirements before relying on it.

## For teams that need it on their own metal

Enterprise and self-hosting customers can run Docurama inside their own infrastructure — Docker Compose for a single host, Helm for Kubernetes — with S3-compatible storage, their own SMTP relay and configurable single sign-on. Certificate settings do not enable certificate signing in the current email-link flow. Self-hosted instances can even push signed attestations to a verification portal so counterparties can inspect the instance-reported record. Our [self-hosting guide](/blog/self-hosting-docurama) walks through the whole stack.

## Start here

- Send your first envelope in under five minutes with the [quickstart](/docs/getting-started/quickstart).
- Watch a complete signing journey — review, sign, complete, verify — on the [live examples](/#examples).
- Review [the signing assurance limits](/blog/eidas-in-five-minutes) before choosing this workflow for your transaction.

Review the workflow, its generated artifacts and the deployment before using it for your agreements.
