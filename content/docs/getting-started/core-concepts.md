---
title: Core Concepts
description: The essential building blocks of Docurama: envelopes, recipients, documents, seals and cryptographic evidence.
group: Getting started
order: 2
tags: [concepts, envelopes, seals]
---

# Core Concepts

Docurama is designed around five foundational concepts that define how signatures are requested, verified and preserved.

## 1. The Envelope

An **Envelope** is the sovereign container for a signing workflow. Unlike basic PDF signers that mutate documents in place, Docurama treats an envelope as an immutable state machine:
- **Title & Purpose:** What is being agreed upon.
- **Document Payload:** The immutable underlying PDF file with its SHA-256 digest.
- **Recipients List:** Ordered list of parties required to sign or review.
- **Event Ledger:** Every action (creation, view, signature, reminder, void) recorded with UTC timestamps and IP hashes.

## 2. The Recipient

A **Recipient** is an individual invited to take action on an envelope.
- **Role:** Either `SIGNER` (must affix signature) or `CC` (receives completed copy).
- **Routing Order:** Signers can be executed in sequence (Signer 1, then Signer 2) or in parallel.
- **Unique Access Token:** Each recipient receives a cryptographically random access token (32 bytes entropy). Signers never share tokens.

## 3. Cryptographic Seal & Verification Code

When the last signer completes their action, Docurama executes the **Sealing Routine**:
1. Computes the final digest of the document and signer signatures.
2. Applies a cryptographic timestamp conforming to RFC 3161.
3. Generates a public code (e.g. `DOC-A1B2C3D4`) published on `verify.docurama.eu`.

## 4. Conformance Levels

Docurama supports EU eIDAS conformance levels:
- **Simple Electronic Signature (SES):** Email verification + audit trail.
- **Advanced Electronic Signature (AES):** OTP SMS two-factor authentication, cryptographic binding, and PAdES-Baseline-T horodatage.
