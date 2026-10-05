---
title: "Tutorial: send your first envelope"
description: Prepare a sample contract, sign in routing order and inspect the completed document and consent record.
group: Getting started
order: 4
tags: [tutorial, sending, envelopes]
---

Use a sample agreement and controlled email addresses to learn the sender and
signer experience. Confirm the installation's configured sender and SMTP
transport before expecting inbox delivery.

## What you need

- A workspace account with permission to send.
- A PDF you are allowed to use for this exercise, or reviewed template text.
- Two email addresses you control for the signer roles.
- An approved email-link signing policy. Stronger assurance or required signer
  reauthentication blocks this flow until explicitly reviewed.

## 1. Prepare the contract

Open **Documents → New envelope**. Set a title, upload the PDF or choose a
supported text template, then add the two signers in order. A CC recipient can
receive a copy without signing. Add a personal message and any required fields.
Review the terms, recipient assignments and field locations before sending.

The supported method is typed-name adoption through a recipient email link.
There is no PAdES level or independent timestamp selection for this flow.

## 2. Check the first invitation

Sending queues the first signer invitation. It uses the configured sender
identity; a custom workspace sender requires a currently verified sending
domain. Relay acceptance does not guarantee inbox delivery, so check the
controlled inbox.

Each recipient link belongs to that recipient and envelope. Keep it private.
A later signer cannot bypass the enforced routing order with their link.

## 3. Review and sign

Open the first signer link and review the contract. Enter the typed signature
name and assigned values. Read the exact consent wording and version shown on
the page, explicitly accept it, then sign. The selected style is recorded; it
does not provide independent identity verification or a certificate signature.

The signing record captures the displayed consent, its version/digest and the
submitted values. Unsupported PDF geometry, characters or values must be
corrected before this flow can complete signing.

## 4. Complete the second signer

After the first signer completes, the next invitation is queued. Review and
sign through the second controlled address. Once all signers complete, the
envelope becomes **COMPLETED**, digest evidence is recorded and completion
notifications are queued for the authorized participants.

Download the completed-document PDF and the separate signing-record PDF.
Inspect the contract, placed values and exact consent. The server's timestamps
are application times, not independent timestamp attestations.

## 5. Inspect the evidence

Export the evidence pack from the workspace. Its signed manifest records the
checksums of the exported artifacts, including the completed PDF and signing
record. The included `verify.html` can check that manifest and the artifact
bytes locally. Read its actual verdict and artifact count; those checks do not
certify signer identity or legal enforceability.

The public verification code retrieves the reported completion record without
exposing the private PDFs. A lookup is distinct from comparing actual artifact
bytes. See [the verification tutorial](/docs/getting-started/tutorial-verify-a-document)
and [the assurance limits](/docs/compliance/eidas).
