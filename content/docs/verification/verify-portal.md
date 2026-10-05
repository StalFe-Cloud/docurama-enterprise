---
title: Document Verification Portal
description: Inspect the reported envelope or self-hosted attestation record using its public code.
group: Verification
order: 1
tags: [verification, public, evidence]
---

# Document Verification Portal

The public code retrieves the installation's reported envelope record without
requiring an account. Private completed-document and signing-record PDFs remain
available only through authorized participant or workspace access.

## Verification states

| Status | What the installation reports |
| --- | --- |
| `VERIFIED` | Local envelope completed with a recorded sealing time and digest. |
| `NOT_SEALED` | Local envelope lacks the required completion/seal record. |
| `VOIDED` | Envelope was voided by the issuer. |
| `NOT_FOUND` | No matching local record or received attestation exists. |
| `VERIFIED_ATTESTED` | Signed fingerprint submitted by a registered self-hosted instance. |

These states report stored facts. A lookup does not recompute the completed PDF,
verify official signer identity or validate a regulated signature level.

## Checksum scope

For uploads, the envelope checksum remains the original file's checksum. The
completed PDF and separate signing-record PDF each have their own checksum in
the evidence pack. For text templates, the envelope digest binds recorded terms
and adoption, rather than the completed PDF's bytes.

Compare each file against its own manifest entry. For example,
`sha256sum document/completed.pdf` must be compared with the entry for that
artifact, not the original upload's digest. The included offline verifier can
check the signed manifest and individual artifacts; inspect its actual verdict
and the key used.

The current flow does not create PAdES certificate signatures or independent
trusted timestamps. Read [the assurance limits](/docs/compliance/eidas) and
[the verification tutorial](/docs/getting-started/tutorial-verify-a-document).
