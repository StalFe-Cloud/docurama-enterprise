---
title: "Tutorial: inspect a signed document's evidence"
description: Distinguish public recorded facts, original-document checksums and checks on exported completion artifacts.
group: Getting started
order: 5
tags: [tutorial, verification, evidence]
---

Verification has several purposes. Retrieving a reported record, comparing file
bytes and verifying an exported manifest answer different questions.

## 1. Read the public record

Open the verification portal and enter the public code. The current API returns:

| Status | What the installation reports |
| --- | --- |
| `VERIFIED` | A local envelope is completed and has recorded sealing time/digest. |
| `NOT_SEALED` | A local envelope exists but lacks the required completion/seal record. |
| `VOIDED` | The issuer voided the envelope. |
| `NOT_FOUND` | No matching local envelope or received attestation exists. |
| `VERIFIED_ATTESTED` | The portal has a signed fingerprint submitted by a self-hosted instance. |

A `VERIFIED` lookup does not recompute the completed PDF or independently verify
the signer. The current email-link flow does not apply a PAdES conformance level
or independent trusted timestamp. A historical or instance-supplied label is a
reported value, not independently validated assurance.

## 2. Compare the correct file digest

For an uploaded contract, the envelope checksum refers to the **original upload**.
The completed PDF includes placed values and has its own checksum. For a text
template, the envelope digest binds recorded contract/adoption evidence; it is
not the completed PDF's file checksum.

Use the evidence pack's manifest and envelope record to identify the checksum
for the specific artifact you are checking. Do not compare the completed PDF
against the original-upload checksum and expect equality.

## 3. Check the exported evidence pack

Ask an authorized workspace user for the evidence pack. Open its `verify.html`
with the exported files available. The verifier checks the signed manifest and
individual artifact checksums locally. Inspect the actual verdict, artifact
count, key and any included transparency proof.

A successful check means the supplied bytes and signatures passed those checks
under the supplied key. It does not establish the truth of every event, an
independently verified identity or the agreement's legal enforceability. Retain
the pack and the appropriate trusted-key reference for your verification process.

## 4. Understand self-hosted records

A configured self-hosted instance can submit a signed fingerprint to a portal.
`VERIFIED_ATTESTED` distinguishes that submitted record from a locally held
envelope. Check the registered instance key and actual integration result; a
signed submission is not independent identity verification or trusted timestamping.

The marketing examples are illustrative synthetic data. Their displayed codes
and badges are not records of real signing transactions. See
[the assurance limits](/docs/compliance/eidas) before relying on the workflow.
