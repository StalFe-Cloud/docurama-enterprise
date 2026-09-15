---
title: Document Verification Portal
description: How public verification works on verify.docurama.eu without requiring an account.
group: Verification
order: 1
tags: [verification, public, pades]
---

# Document Verification Portal

The verification portal at `verify.docurama.eu` allows any recipient, counterparty or auditor to verify the authenticity of a sealed document using its public code.

## Verification States

When a code is queried, the engine returns one of four definitive states:

| Status | Meaning |
| --- | --- |
| `VERIFIED` | Document is sealed with a valid cryptographic digest, timestamp and listed signers. |
| `NOT_SEALED` | Document exists but is currently pending signatures or in draft. |
| `VOIDED` | Document was revoked or canceled before completion by the issuer. |
| `NOT_FOUND` | No document matches this code in the ledger. |

## SHA-256 Digest Verification

Every completed envelope displays its SHA-256 digest on the verification page. Anyone holding the downloaded PDF can verify its integrity locally:

```bash
sha256sum signed-contract.pdf
```

The resulting hexadecimal output must match the SHA-256 digest recorded in the verification portal.
