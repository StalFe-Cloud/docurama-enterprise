---
title: Signing assurance and workflow limits
description: What the current email-link flow records and which assurance requirements need separate implementation and qualification.
group: Compliance
order: 1
tags: [signing, assurance, evidence]
---

# Signing assurance and workflow limits

The current workflow uses an individual recipient email link, typed-name
adoption and explicit consent. It records the frozen contract, displayed consent
wording/version and recipient field values. A link is a bearer credential;
possession does not establish independently verified identity.

## What is recorded

- The contract snapshot or original uploaded document checksum.
- The typed name, selected style, signing method and assigned values.
- The exact consent wording, version, digest and application acceptance time.
- Completion evidence, a separate completed-document PDF and signing-record PDF.

The selected handwriting style is recorded. It does not turn a typed name into
a scanned handwritten signature or certify the signer's identity.

## Unsupported assurance

This flow does not perform advanced or qualified signing, embed a PAdES
certificate signature, obtain an independent RFC 3161 timestamp or establish
21 CFR Part 11 compliance. Stored certificate or timestamp preferences do not
add those operations to the signing flow.

Existing advanced, qualified or unknown required policies block signing until
an administrator deliberately reviews and changes the policy. Required signer
reauthentication and stored Part 11 restrictions also block this flow; selecting
email-link typed signing does not silently clear those restrictions.

## Choosing a workflow

Identify the assurance required for your document classes and participants
before using this workflow. Stronger identity, certificate signing, trusted
timestamps or regulated controls require separate implementation and
qualification. This page does not determine legal equivalence, admissibility or
enforceability for your agreement.

[Inspect the recorded evidence](/docs/getting-started/tutorial-verify-a-document)
and validate the selected deployment before relying on it.
