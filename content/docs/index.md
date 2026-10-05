---
title: Introduction
description: What Docurama is, what it seals, and how the documentation is organised.
group: Getting started
order: 1
tags: [overview, introduction]
---

Docurama provides email-link document signing. An **envelope** holds the
contract, ordered recipients and event ledger. Signers adopt a typed name and
explicitly accept the displayed consent. Completed envelopes provide private
document and signing-record PDFs, plus a public code for inspecting the reported
record. Hosting, storage and integration locations depend on the installation.

This documentation describes what the platform does today. Where a capability
is designed but not yet wired end to end, the page says so in a status note
rather than implying it works. The API reference pages are generated from the
live endpoint catalogue of this deployment, so they cannot drift from the code.

## Where to start

```cards
[
  { "title": "Quickstart", "description": "Create an account, name your organization and get to a first envelope.", "href": "/docs/getting-started/quickstart", "icon": "rocket" },
  { "title": "Core concepts", "description": "Envelope, recipient, template, seal and evidence, defined once.", "href": "/docs/getting-started/core-concepts", "icon": "book" },
  { "title": "Verify a document", "description": "How the public verification portal answers, and what each answer means.", "href": "/docs/verification/verify-portal", "icon": "shield" },
  { "title": "API reference", "description": "Authenticate with an API key and read the live endpoint catalogue.", "href": "/docs/api", "icon": "code" }
]
```

## How the platform is laid out

Docurama runs as a single application served on several host names. The routing
is host-aware, so each surface has a stable address:

| Host | Surface |
| --- | --- |
| `app.docurama.eu` | The workspace portal: documents, templates, settings |
| `docs.docurama.eu` | This documentation |
| `verify.docurama.eu` | The public verification portal, no account needed |
| `api.docurama.eu` | REST API index and the `/api/v1` integration surface |
| `status.docurama.eu` | Platform status |
| `security.docurama.eu` | Security policy and disclosure contact |
| `admin.docurama.eu` | Platform operator console, authentication required |

## What Docurama is not

The current flow does not provide advanced or qualified signing, an embedded
PDF certificate signature or an independent trusted timestamp. Possession of an
email link does not establish independently verified identity. Review
[the signing assurance limits](/docs/compliance/eidas) before selecting this
workflow for your document requirements.

## Reading this documentation as an agent

Every page is available as raw Markdown, and the whole corpus is indexed in
`llms.txt` for AI agents and retrieval pipelines. The same read surface is
exposed over the [Model Context Protocol](/docs/api/mcp-server) so an assistant
can list envelopes, read an audit timeline and verify a document directly.

## Getting help

Write to `support@docurama.eu` for product questions, `security@docurama.eu`
for vulnerability reports, `privacy@docurama.eu` for data protection requests
and `legal@docurama.eu` for contractual matters.
