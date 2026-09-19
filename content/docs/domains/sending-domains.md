---
title: Sending Domains
description: Verify your company domain with a DNS TXT record so invitations come from your own domain, with SPF, DMARC and DKIM posture checks.
group: Domains
order: 1
tags: [domains, dns, email, deliverability]
---

By default, signing invitations are sent from a platform address. Verifying your own sending domain makes them come from your company instead — `contracts@yourcompany.com` rather than a third-party name your signers have never heard of. Verification happens in the Domains area of **Settings → Account**.

## Why invitations from your domain matter

- **Deliverability.** Mail aligned with a domain you control — correct SPF and DMARC — is far less likely to land in spam. See [Email delivery](/docs/notifications/email-delivery).
- **Recognition.** Signers see your company name and domain in the invitation, which is what gets envelopes opened.
- **Anti-phishing.** On the signer portal, a verified sender domain shows a **verified-sender badge**. Your signers can confirm the invitation genuinely came from you, which is a meaningful defense against look-alike domains impersonating your brand.
- **Evidence.** The verified domain is recorded at seal time and embedded as a **subjectAltName DNS entry in the workspace evidence-key certificate**. The domain you sent from becomes part of the cryptographic evidence of the sealed envelope — not just a claim on the email envelope.

## Adding and verifying a domain

1. Open **Settings → Account** and add the domain your company sends from.
2. Docurama shows you a **TXT record** — a host name and a value — to publish in your DNS.
3. Publish the record with your DNS provider.
4. Docurama checks for the record over **DNS-over-HTTPS** and verifies the domain as soon as it is visible.

Two things worth knowing: **no mail is ever sent from the domain until verification succeeds**, so there is no window where your domain is used unverified; and DNS propagation usually takes minutes but can take longer depending on your provider — re-check the Domains area after publishing.

## Posture chips: SPF, DMARC and DKIM

Alongside the domain, the Domains area shows posture chips for your email configuration:

| Chip | What it checks |
| --- | --- |
| SPF | A Sender Policy Framework record exists and is sane |
| DMARC | A DMARC policy is published for the domain |
| DKIM | A best-effort probe for a DKIM public key |

The **DKIM probe is best-effort**: DKIM selectors are not always enumerable from the outside, so the chip may read unknown even when your mail server signs correctly. The SPF and DMARC checks are direct.

If a chip is not green, fix it in your DNS: publish an SPF record listing your mail senders, and a DMARC policy telling receivers what to do with unaligned mail. This improves your Docurama deliveries and your ordinary company mail at the same time.

## Keeping it healthy

Re-check the chips in **Settings → Account** after any DNS change at your company — a migration or a new marketing tool that edits SPF can silently break alignment. The domain stays verified via its TXT record; the posture chips are your early warning for deliverability drift.
