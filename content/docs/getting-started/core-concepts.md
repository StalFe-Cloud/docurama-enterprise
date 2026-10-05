---
title: Core Concepts
description: Envelopes, recipients, immutable contracts, consent and completion evidence in the email-link signing flow.
group: Getting started
order: 2
tags: [concepts, envelopes, evidence]
---

# Core Concepts

## The envelope and contract

An envelope holds the contract, recipients, field locations and event ledger.
Sending an uploaded document retains its original checksum. Sending a text
template freezes the authoritative text, template version and locations. Later
template edits do not replace the contract being signed.

## Recipients and routing

A `SIGNER` enters a typed name and assigned values. A `CC` receives a copy and
cannot sign. Signers act in sequence: the next invitation is queued after the
preceding signer completes. Each recipient has an individual bearer link;
sharing it transfers access, so keep it private. An email link does not establish
independently verified identity.

## Consent and adoption

New envelopes freeze the workspace's exact consent wording and version. The
signer must explicitly accept those displayed terms. The durable adoption
records that wording, version, digest, application time and submitted values.
Changing workspace preferences does not change an existing envelope's terms.

## Completion artifacts and digests

After all required signers complete, authorized participants can obtain a
completed-document PDF and a separate signing-record PDF. The original-upload
checksum remains distinct from the completed PDF's checksum. Contract/adoption
evidence has a separate digest; evidence-pack manifests bind exported artifact
bytes with their individual checksums.

A public code exposes the installation's reported completion record. A
successful code lookup is not independent verification of the signer or every
recorded event.

## Supported assurance

This flow provides email-link typed signing. It does not perform advanced or
qualified signing, embed PAdES certificate signatures or obtain trusted
timestamps. Existing stronger policies and unsupported reauthentication
requirements fail closed. Read [the assurance limits](/docs/compliance/eidas).
