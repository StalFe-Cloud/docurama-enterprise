---
title: "Docurama is live: sign documents, prove everything"
description: "After two years of building evidence-grade eSignatures in Paris, Docurama is publicly available — four plans from €12/mo, a public verification portal, and a self-host option for enterprises."
date: 2026-09-19
author: "Docurama Team"
tags: [product, announcement]
draft: false
---

Today we're opening Docurama to everyone. If you have ever signed a contract electronically and wondered — *what exactly did I sign, and can anyone prove it later?* — Docurama was built for you.

## What we built

Docurama is an EU-built eSignature platform with one non-negotiable idea: **every signature must produce evidence**. That shows up everywhere in the product:

- **Cryptographic sealing.** Completed envelopes are sealed with PAdES conformance levels from B-B to B-LTA, anchored to RFC 3161 timestamps from independent authorities.
- **A public verification portal.** Every completed document carries a public code. Anyone — your counterparty, your auditor, a court — can verify the seal and the event ledger at [docurama.eu/verify](https://docurama.eu/verify) without an account.
- **Evidence packs.** One click exports a ZIP with the sealed document, the full event ledger, a bilingual certificate and a signed manifest you can verify offline, in a browser, with zero network access.
- **An append-only transparency log.** Seals are hashed into a CT-style public registry with inclusion proofs, and the portal key is witnessed in Sigstore Rekor.

## Plans from €12 a month

We spent a long time on pricing, because eSignature pricing in Europe is either opaque or punitive. Ours is neither:

| Plan | Price | Seats | Envelopes / month |
|---|---|---|---|
| Solo | €12 | 1 | 30 |
| Starter | €29 | 3 | 100 |
| Business | €79 | 10 | 250 |
| Enterprise | Custom | Custom | Custom |

Solo and Starter include exactly the same allowance and features — the only difference is seats. Every plan rolls unused envelopes into the next period (capped at one monthly allowance), and committing to 3, 6 or 12 months takes 5, 10 or 15 percent off. We explain the philosophy in a [separate post](/blog/pricing-philosophy).

## Built in the EU, for the EU

Docurama SAS is registered in Paris. Customer documents are processed and stored in the European Union, with no transatlantic transfers. The workflows are eIDAS-aligned and honestly labelled — when a document is signed with a Simple or Advanced electronic signature, the evidence record says exactly that, in the words a court will understand. Regulated teams can enable 21 CFR Part 11 mode for signature manifestation and consent versioning.

## For teams that need it on their own metal

Enterprise and self-hosting customers can run Docurama inside their own infrastructure — Docker Compose for a single host, Helm for Kubernetes — with S3-compatible storage (SeaweedFS, MinIO, Ceph), their own SMTP relay, OIDC/SAML single sign-on, and their own signing certificates. Self-hosted instances can even push signed attestations to a verification portal so counterparties still get independent proof. Our [self-hosting guide](/blog/self-hosting-docurama) walks through the whole stack.

## Start here

- Send your first envelope in under five minutes with the [quickstart](/docs/getting-started/quickstart).
- Watch a complete signing journey — open, sign, seal, verify — on the [live examples](/#examples).
- Questions about compliance? The [eIDAS in five minutes](/blog/eidas-in-five-minutes) post answers the ones we hear most.

We're live, we're staying honest, and we'd love to sign something with you.
