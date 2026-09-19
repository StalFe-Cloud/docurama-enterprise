---
title: "eIDAS in five minutes: the three signature levels and what they mean for your contracts"
description: "Simple, Advanced, Qualified — the EU regulation's three electronic signature levels, when each is legally sufficient, and how Docurama labels them honestly in every evidence record."
date: 2026-09-18
author: "Docurama Team"
tags: [compliance, eidas, legal]
draft: false
---

If you sign contracts in Europe, eIDAS (Regulation EU 910/2014) is the rulebook. It is shorter and more practical than its reputation suggests — here is the working summary our customers actually need.

## The three levels

**Simple Electronic Signature (SES).** Any data in electronic form attached to a document — typing your name, clicking "I agree". For the vast majority of B2B contracts between companies, SES is valid and enforceable. Article 25 of the regulation is explicit: a signature cannot be denied legal effect just because it is electronic.

**Advanced Electronic Signature (AdES).** Adds four requirements: the signature is uniquely linked to the signer, the signer retains control of the signing data, any later change to the document is detectable, and the identity attribution stands on its own. Practically: cryptographic sealing, integrity digests, and an audit trail that ties the click to an identified person.

**Qualified Electronic Signature (QES).** An AdES created with a Qualified Certificate on a QSCD (typically a smart card or qualified remote signing service). QES carries the *equivalent legal effect of a handwritten signature* across the entire EU. It is mandatory for a short list of documents in some member states — certain real estate transactions, consumer credit, employment terminations in specific jurisdictions.

## Which one do you need?

For most commercial agreements — NDAs, quotations, supply contracts, service agreements, order confirmations — Simple or Advanced is sufficient. The honest risk isn't signature validity; it's *proving what happened* if someone disputes it later. That is exactly what an evidence trail is for.

When QES is legally required, Docurama is upfront: today we ship Simple and Advanced workflows with cryptographic sealing and RFC 3161 timestamps, and we partner for qualified signatures where a transaction demands one. We do not label a standard flow "qualified" — and every evidence record states the exact level applied to that document.

## What the evidence record says

Every Docurama envelope carries a complete ledger: who sent it, who opened it, who signed, when, with which consent wording, and what the document's cryptographic digest was at each step. At completion the envelope is sealed (PAdES B-B through B-LTA depending on your settings) and timestamped by an independent authority. The [public verification portal](https://docurama.eu/verify) lets anyone check the seal and the ledger from the document's public code — no account, no fee, no trust in us required.

## Common questions

**"Isn't Qualified always safer?"** It is stronger *identity assurance*, not stronger contract law. A QES on a contract that never needed one adds friction without adding enforceability. Start from the document type and the applicable national law, not from the marketing.

**"Are click-to-sign signatures valid in court?"** Yes — thousands of EU commercial relationships run on them. What wins disputes is the evidence: immutable audit trail, tamper-evident sealing, independent timestamps. That bundle, not the signature level alone, is what a judge weighs.

**"What about 21 CFR Part 11?"** Different regime — US FDA regulated environments. Docurama ships a Part 11 mode with signature manifestation (§11.50), versioned consent records (§11.100), and audit events on every mutation. Many regulated teams run both eIDAS-aligned workflows and Part 11 mode side by side.

The five minutes are up. For the deep dive — including how seals are constructed and how offline verification works — read [how envelope seals work](/blog/how-envelope-seals-work), or start with the [compliance documentation](/docs/compliance/eidas).
