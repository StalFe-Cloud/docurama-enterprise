---
title: Tutorial: send your first envelope
description: A step-by-step walkthrough for sending, signing and sealing your first Docurama envelope in one sitting.
group: Getting started
order: 4
tags: [tutorial, sending, envelopes]
---

This tutorial takes you from an empty workspace to a sealed, publicly
verifiable document in about ten minutes. You will play both roles — sender
and signer — so you understand exactly what your recipients experience.

## What you need

- A Docurama account (the 14-day Starter trial is fine)
- A PDF you are allowed to sign with yourself — any contract, or a blank page
  exported as PDF for the exercise
- Two email addresses you can check (one to send, one to sign)

## Step 1: create the envelope

Sign in and open **Documents → New envelope**.

1. Give the envelope a clear title — your recipient sees this in the signing
   portal and in every notification, so "Service agreement — Acme and Docurama"
   beats "contract_final_v2".
2. Upload your PDF (or pick a template from the library if you would rather
   start from French-law boilerplate).
3. Add yourself as the first recipient (role: **signer**), and your second
   email address as the second recipient in routing order. Routing order is
   enforced: the second signer's link activates only after the first signs.
   Add a CC observer if you want a copy routed without a signature.
4. Write a one-line personal message. It appears on the signing page above
   the document — a short "signing our test agreement, thanks!" sets the tone
   and doubles as an anti-phishing signal.
5. Choose the conformance level for this exercise: **PAdES B-B** (Simple) is
   enough. Advanced levels add timestamp and archive material — the
   [sealing guide](/docs/documents/ingestion-and-storage) explains the
   trade-offs.
6. Click **Send**.

## Step 2: check the mail

Each signer receives a personal link to `/sign/{token}` — one token per
recipient, single-purpose, tied to the routing order. Check the inbox of your
second email address; the invitation comes from `notifications@docurama.eu`
(or your own verified domain once you configure one).

Nothing to send manually: the mail is queued in the deployment's outbox and
delivered over its SMTP transport with retry and backoff. As the sender you
can also open the envelope in Documents and use **Copy link** or the **QR
code** for a specific pending signer — useful for in-person signing.

## Step 3: sign as the first recipient

Open the link from your first email address. The signing page shows:

1. **The document preview**, watermarked for your eyes only, so nobody
   screenshots a clean copy before committing.
2. **The signers rail** with live status — who has signed, who is next.
3. **Signature adoption**: draw your signature, type it in one of three
   handwriting fonts, or upload a stamp. What you adopt here is applied to
   the signature line with a live preview.
4. **The eIDAS consent wording**, stating exactly what kind of signature you
   are applying.

Click **Sign**. The envelope moves to the second recipient, and the event
ledger records the signature with its timestamp.

## Step 4: sign as the second recipient and watch the seal

Open the second email's link (the token is now active because the turn order
released it). Sign the same way. The moment the last signer completes:

- the envelope status becomes **COMPLETED** and the document is **sealed** —
  digest fixed, signer manifest embedded, timestamped by an independent
  RFC 3161 authority;
- the envelope's **public code** (format `DOC-XXXXXXXX`) is issued;
- every recipient and CC observer gets the completion notice.

## Step 5: prove it

Back in your workspace, open the envelope and try the two proof surfaces:

1. **Evidence pack.** Click the export button and download the ZIP. Inside:
   the sealed document (byte-exact), the event ledger CSV, a bilingual
   certificate, a signed manifest — and `verify.html`. Open that file in any
   browser with networking off: it re-verifies the manifest signature and
   every artifact hash locally. A green **VALID, 7/7 artifacts** banner is
   your independent proof.
2. **Public verification.** Go to [docurama.eu/verify](https://docurama.eu/verify),
   paste the envelope's public code. Anyone can do this — no account, no
   fee — and the result states exactly what the evidence shows, including
   the conformance level that was actually applied.

## What you just exercised

The complete core loop: send → personal link → one-page sign → seal →
public proof, every step ledger-recorded. Everything else in Docurama —
templates, reminders, API sending, team groups — is scale on top of this
loop, and it behaves exactly like what you just did.

Ready for the next one? Read [how to verify a signed document](/docs/getting-started/tutorial-verify-a-document)
or set up [your sending domain](/docs/domains/sending-domains) so invitations
leave from your company's address.
