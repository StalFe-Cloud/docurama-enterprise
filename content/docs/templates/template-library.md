---
title: The French Contract Library
description: The modeles-de-contrats catalogue of French-law contract templates, and how template-sent envelopes render contract text to signers.
group: Templates
order: 2
tags: [templates, contracts, french-law]
---

The contract library provides starting text to review and adapt for your agreement. Sending from a supported text template freezes its terms for signers to review; the library does not determine whether those terms or this signing method suit your transaction.

## What the library is

The library is a public catalogue at **`/modeles-de-contrats`** on the marketing site, also reachable from the workspace template gallery. It includes starter text for agreements such as NDAs and supply contracts. Review and adapt the terms before sending; catalogue inclusion does not certify legal suitability or professional review.

## Using a template from the library

1. Browse the catalogue and open the contract you need.
2. Choose **Use template**. The send dialog opens pre-filled with the contract, its roles and its routing order.
3. Review everything — names, amounts, dates — and adjust as needed.
4. Enter the recipient email addresses and send.

Adjustments you make while sending apply to that envelope only; the library entry stays as published.

## How template-sent envelopes render to signers

When you send an envelope from a template that carries contract text, the signer portal at `/sign/{token}` **renders the contract text to the signer** as a readable document. The signer does not have to download anything to know what they are agreeing to: the contract is the page in front of them.

Around that text sits the standard signer experience:

- the signers rail with live status of every recipient,
- typed-name adoption and assigned recipient values,
- the exact frozen consent wording and version,
- and the option to decline with a reason.

The envelope freezes the template text, version and field locations at send time. Changing or deleting the source template does not change those captured terms.

## Templates and legal advice

Templates are starting points to review with the appropriate advisers for your agreement. The current email-link flow records typed adoption, consent and digest evidence; it does not provide advanced or qualified signing, embedded PAdES signatures or independent timestamps. See [the signing assurance limits](/docs/compliance/eidas).

## The library and your workspace

Library templates and your own templates live side by side: the library is the curated public catalogue, your workspace template library is where your house contracts accumulate. How to build your own — and the per-plan limits on stored templates — is covered in [Creating templates](/docs/templates/creating-templates).
