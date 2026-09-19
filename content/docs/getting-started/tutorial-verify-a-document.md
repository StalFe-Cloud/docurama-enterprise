---
title: Tutorial: verify a signed document
description: How a third party — counterparty, auditor or court — verifies a Docurama document using the public code, the sealed file, or an offline evidence pack.
group: Getting started
order: 5
tags: [tutorial, verification, evidence]
---

Verification is the half of eSignature nobody demos and everybody needs. This
tutorial walks through the three verification paths, from a ten-second check
to a zero-network audit. You never need an account for any of them.

## The three ways to verify

| You have | Path | Takes |
|---|---|---|
| The public code (`DOC-XXXXXXXX`) | Public verification portal | 10 seconds |
| The sealed document + code | Portal digest check | 1 minute |
| The evidence pack (ZIP) | Offline `verify.html` | 2 minutes, no network |

## Path 1: the public code

Every completed envelope carries a public code, eight characters after
`DOC-`. Open [docurama.eu/verify](https://docurama.eu/verify), paste the
code, and the portal answers with exactly what the evidence shows — never
more:

- **VERIFIED** — the seal is intact, the digest matches, the envelope is
  completed. The result also states the conformance level that was actually
  applied (PAdES B-B, B-T, B-LT or B-LTA) and, when the sender's domain was
  DNS-verified, the verified sending domain.
- **NOT_SEALED** — the envelope exists but is not completed (a signer is
  still pending, or it was sent as a draft). This is not an error; it is the
  honest answer.
- **VOIDED** — the sender voided the envelope after sending.
- **NOT_FOUND** — no such code (typo, or the envelope predates the registry).

The verifier never needs to trust the sender's screenshot: the result comes
from the sealed ledger, and seals are hashed into an append-only transparency
log with Merkle inclusion proofs — a rewritten history is detectable.

## Path 2: the sealed document itself

If you were sent the sealed PDF and want to prove it is *the* signed version
(not a print-before-signing draft), run the same code lookup and compare the
**document digest** the portal reports with the file you hold. Docurama
computes the SHA-256 at seal time; matching digests mean byte-identical
documents. This closes the "which version did I actually sign?" dispute in
one comparison.

## Path 3: the offline evidence pack

For audits, litigation files or air-gapped environments, ask the sender for
the **evidence pack** — a ZIP they export from the envelope in one click.
Unzip it and open `verify.html` in any modern browser with your network
disconnected. The page:

1. Re-verifies the **signed manifest** (RSA-SHA-256 over canonical JSON)
   using WebCrypto, entirely locally;
2. Re-hashes every artifact — sealed document, ledger CSV, envelope record,
   certificate — and checks all seven against the manifest;
3. Shows a single verdict banner: **VALID** with the artifact count, or the
   specific mismatch.

No Docurama server is contacted, so the pack is self-proving: it works in
2041 even if the platform is gone. This is deliberate — evidence that
depends on the vendor staying online is not evidence.

## Verifying documents from self-hosted instances

Documents signed on a self-hosted Docurama can push a signed, GDPR-minimal
**attestation** (code, digest, dates, conformance level, signer count — no
personal data) to a public verification portal at seal time. Those documents
verify as **VERIFIED_ATTESTED** with the instance's registry facts, so
on-prem deployments get the same independent check without exposing their
network. The result is visually distinct from cloud-sealed documents, and
honest about which instance produced it.

## What verification is *not*

The portal does not certify that the person who signed read the document, or
that the contract is fair — it proves what happened cryptographically: which
envelope, which digest, which signers, which timestamps, which seal level,
and that none of it was altered afterward. Courts and auditors weigh that
evidence; Docurama's job is to make it unambiguous.

## Try it now

The [live examples](/#examples) page runs a complete signing journey with
sample data — open it, copy the resulting code, and verify it yourself on
the [portal](https://docurama.eu/verify).
