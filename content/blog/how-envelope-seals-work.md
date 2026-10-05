---
title: "How envelope evidence works: contract snapshots, typed adoption and digests"
description: "What Docurama records and exports: contract snapshots, consent, completed PDFs and checksum evidence."
date: 2026-09-17
author: "Docurama Engineering"
tags: [security, engineering, evidence]
draft: false
---

Docurama's current signing flow records an email-link signature. This post describes the artifacts it produces and the limits of those artifacts.

## 1. Contract and adoption

An envelope sent from a template uses a server-generated snapshot of the contract terms. An uploaded document retains its file checksum. Recipient adoption records include a typed signature name, explicit consent and the submitted field values. These records connect the signing action to the contract being reviewed.

## 2. Completion artifacts

After the required signers complete, Docurama provides a completed document PDF and a separate signing record PDF. The signing record reports the recorded recipients, actions, consent and digest evidence. A typed signature representation is not a scanned handwritten signature, and a selected style does not guarantee handwriting-font rendering in every PDF viewer.

These PDFs are generated artifacts. The current email-link flow does not embed a PAdES certificate signature or call an independent RFC 3161 timestamp authority. It does not perform advanced or qualified signing. Application timestamps reflect the server's clock.

## 3. Digests and evidence exports

SHA-256 digests allow the recorded artifacts to be compared with their expected bytes. Evidence packs include an envelope record, event ledger, generated artifacts and a signed manifest. The manifest authenticates the exported record with the instance's key; it does not establish the recipient's independently verified identity.

The pack's offline verifier checks the manifest signature and artifact checksums locally. A successful verification means those checks passed for the supplied pack and key. It does not certify a regulated signature level, the truth of every event, or legal enforceability.

## 4. Transparency and deployment

Where a transparency entry or self-hosted attestation is available, its proof can be inspected alongside the envelope record. Availability depends on the deployment and configured integration. The existence of a setting does not mean an external witness or timestamp was obtained for a particular envelope.

Use the [verification portal](/verify) to inspect the facts reported for your document, and export the evidence pack to retain a copy. Check the actual artifacts and integration results rather than assuming a guarantee from a label.
