---
title: Email Delivery and the Outbox
description: How invitations are delivered over SMTP with retries and backoff, how the outbox ledger works, and what to do about bounces.
group: Notifications
order: 2
tags: [email, smtp, delivery, outbox]
---

Every envelope lives or dies by its invitation email. Docurama treats outbound mail as a first-class, inspectable subsystem rather than fire-and-forget: each message is a ledger row, each attempt is recorded, and nothing disappears silently.

## How invitations are delivered

Each recipient of an envelope gets their **own email** containing a **personal link** of the form `/sign/{token}`. One recipient, one message, one link — links are never shared between recipients, which is what makes the per-recipient watermark and audit trail meaningful.

A delivery engine sends each queued message over SMTP and records the outcome in the **mail outbox**, the platform's ledger of every message.

## Outbox statuses

| Status | Meaning |
| --- | --- |
| QUEUED | Waiting to be sent |
| SENT | Accepted by the SMTP server |
| FAILED | All attempts exhausted; the last error is recorded |

Each row carries the number of attempts, the last error and the next attempt time. Because the ledger lives in the database, **delivery survives restarts**: a message queued before a restart is still sent after it, and a message mid-retry resumes its schedule.

## Retries

Transient SMTP problems — greylisting, a briefly busy relay — are retried automatically with exponential backoff: the first retry after roughly 30 seconds, then growing delays capped at 30 minutes, up to five attempts before the message is marked FAILED with the server's error text.

## SMTP override per organization

By default, mail goes out through the platform's SMTP configuration. An organization can **override it with its own SMTP server**, configured per organization in **Settings → Notifications**. Routing through your own server — ideally the one aligned with your verified sending domain — puts deliverability under your control.

> [!NOTE]
> On self-hosted deployments with no `SMTP_URL` configured, messages stay QUEUED in the outbox instead of being silently dropped. That is honest outbox-only mode, not a malfunction — see [Self-hosting operations](/docs/self-hosting/operations).

## Inspecting delivery

The outbox is inspectable end to end: platform operators can open any message and see its status, attempts, errors and content. As a workspace sender you see each recipient's progress on the envelope — sent, viewed, signed — in the envelope details, and you can always **copy a pending signer's link or show its QR code** from the envelope details when email itself is the problem.

## Troubleshooting a bounce

Work through this list in order:

1. **Check the address.** A typo'd domain fails permanently; correct it and resend.
2. **Check the spam folder.** Ask the signer to look, and to allow-list your sending domain.
3. **Check your domain posture.** The SPF, DMARC and DKIM chips in **Settings → Account** tell you if your DNS is aligned — see [Sending domains](/docs/domains/sending-domains).
4. **Bypass email.** Copy the signer's link or its QR code from the envelope details and hand it over by phone or in person.
5. **Read the error.** A persistent failure is visible in the outbox with the exact SMTP error — that text is what your platform operator or IT team needs.
