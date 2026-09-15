---
title: API Reference & Integration
description: REST API v1 endpoints and Model Context Protocol (MCP) server for programmatic signature workflows.
group: API & Integration
order: 1
tags: [api, rest, mcp]
---

# API Reference

The Docurama REST API enables automated creation of envelopes, recipient management, status webhooks and verification lookups.

## Base URL & Authentication

All API endpoints are served from:
`https://api.docurama.eu/v1`

Pass your API key in the `Authorization` header:
```http
Authorization: Bearer doc_sk_live_...
```

## Key Endpoints

### List Envelopes
`GET /api/v1/envelopes`
Query parameters: `page`, `perPage`, `status`.

### Envelope Detail
`GET /api/v1/envelopes/{idOrPublicCode}`
Returns envelope metadata, signers, and audit timeline without leaking signing access tokens.

### Public Verification
`GET /api/v1/verify/{publicCode}`
Unauthenticated verification endpoint returning cryptographic evidence and signer status.

## Model Context Protocol (MCP)

Docurama implements a native MCP server for AI coding assistants and agent workflows:
- `envelope_list`: List active envelopes in current workspace.
- `envelope_detail`: Inspect recipients and audit timeline.
- `document_verify`: Verify cryptographic validity of sealed documents.
