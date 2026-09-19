---
title: "How envelope seals work: digests, timestamps, transparency proofs and offline verification"
description: "A technical deep dive into Docurama's evidence chain — document digests, PAdES sealing, RFC 3161 timestamps, the append-only transparency log, and evidence packs you can verify with zero network access."
date: 2026-09-17
author: "Docurama Engineering"
tags: [security, engineering, evidence]
draft: false
---

Most eSignature products show you a green checkmark. This post explains what is actually behind Docurama's — the full chain from *click* to *court-proof evidence*, and how anyone can verify it without trusting us.

## 1. The digest: what exactly was signed

When an envelope is created, Docurama computes a SHA-256 digest over the document bytes when a real file is attached — or, for template-sent envelopes, a canonical digest over the code, title, page count, creation time, recipients (order, email, status, signature timestamps) and the full event ledger. Any mutation anywhere in that set changes the digest. This is the object-level anchor everything else builds on.

## 2. The seal: PAdES with honest conformance levels

When the last signer completes, the envelope is sealed:

- Document integrity is fixed against the digest.
- Signer identities, consent wording and timestamps are embedded in the signature manifest.
- Sealing runs at the PAdES conformance level your workspace selected — B-B, B-T, B-LT or B-LTA — and the level is *recorded as data*, not implied. A B-B envelope never gets described as B-LTA in any evidence output.

The signing certificate is a per-workspace RSA-2048 key with a self-signed X.509 certificate; workspaces that DNS-verify their sending domain get it embedded as a `subjectAltName`, closing the loop between domain verification and cryptographic identity.

## 3. The timestamp: an independent witness

Every seal is anchored to an RFC 3161 timestamp from a Timestamp Authority you choose (DigiCert, Sectigo, GlobalSign, or your own TSA — HTTPS only). The TSA countersigns the digest, meaning the *existence of the signed document at that moment* is attested by a third party, not by us. This is what makes "signed before the deadline" a provable claim.

## 4. The transparency log: publicly auditable seals

Completed seals are hashed into an append-only, CT-style transparency registry. Each entry gets an inclusion proof — a Merkle path from your seal to a published checkpoint. Two properties follow:

- **Anyone can audit the registry** and detect a rewritten history.
- **Your counterparty can prove your seal existed** without asking us.

The portal key that signs checkpoints is itself witnessed in Sigstore Rekor, so even the registry's integrity has an external anchor.

## 5. The evidence pack: verification with zero trust and zero network

One click on a completed envelope exports a ZIP containing:

- the sealed document, byte-exact;
- the event ledger as CSV;
- a machine-readable envelope record;
- a bilingual print-ready certificate;
- a signed manifest (RSA-SHA-256 over canonical JSON);
- and an `verify.html` file.

Open `verify.html` in any browser — on a plane, in a SCIF, in 2041. It re-verifies the manifest signature with WebCrypto and every artifact's SHA-256 *locally*. If the banner says VALID and 7/7 artifacts OK, you have proof that the pack is authentic and complete, without a single request to Docurama. Our test suite proves this in a real Chromium on every release.

## 6. Self-hosted instances get the same proof

A self-hosted Docurama can push a signed, GDPR-minimal attestation (code, digest, dates, conformance level, signer count — zero personal data) to a public verification portal at seal time. The portal stores it with TOFU key pinning, and verifiers see a `VERIFIED_ATTESTED` result with the instance's registry facts. On-prem does not mean unverifiable.

## Try it

Open the [live examples](/#examples), complete a signing flow, and export the evidence pack yourself. Then check the same document on the [verification portal](https://docurama.eu/verify). Everything in this post is one click away — that is rather the point.
