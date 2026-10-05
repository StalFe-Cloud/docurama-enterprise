---
title: "Electronic signing assurance: what the email-link flow records"
description: "Typed adoption, explicit consent and digest evidence in Docurama, with the limits of the current email-link workflow."
date: 2026-09-18
author: "Docurama Team"
tags: [compliance, eidas, legal]
draft: false
---

Electronic signing requirements depend on the agreement, the participants and the applicable rules. Start by identifying the assurance your transaction requires, then assess the implementation and the evidence it produces.

## What the current Docurama flow does

The recipient opens an individual email link, reviews the contract, enters a typed signature name and field values, and explicitly accepts the displayed consent. Routing order controls when each signer can act. The record associates the recipient's adoption and consent with the contract snapshot and submitted values.

The completed document PDF and signing record PDF are separate downloads. The signing record reports the recorded actions and digest evidence. A typed name and a document digest do not by themselves establish independently verified identity or a regulated signature level.

## Match the assurance to the transaction

This email-link flow does not perform advanced or qualified certificate signing, embed a PAdES signature, or obtain an RFC 3161 timestamp from an independent authority. A certificate, signature level or timestamp setting does not add these operations to this flow.

If your transaction requires independently verified identity, qualified signing, trusted timestamps or regulated controls, arrange and validate those requirements before using this workflow. Docurama does not represent this flow as meeting them, and no qualified-signing partner is promised here.

## Read the evidence for what it proves

Review the captured contract, recipient actions, explicit consent and field values. Digests help detect changes to the recorded artifacts. Application timestamps record the server's time; they are not independent timestamp attestations. A signed evidence manifest supports checks on the exported pack, not a certification of the signer's legal identity.

The [verification portal](/verify) and exported evidence are tools for inspecting recorded facts. They do not determine the legal enforceability of an agreement or certify compliance with 21 CFR Part 11.

Read [how envelope evidence works](/blog/how-envelope-seals-work) for the implementation details, and assess your specific agreement and required controls with appropriate advisers.
