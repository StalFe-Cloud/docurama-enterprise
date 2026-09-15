---
title: Document Ingestion & Storage Architecture
description: How PDF documents are validated, streamed to disk, analyzed for form fields, and preserved securely.
group: Documents
order: 1
tags: [storage, ingestion, security]
---

# Document Ingestion & Storage Architecture

Docurama implements a defense-in-depth storage architecture for uploaded documents.

## Strict Validation at Ingestion

Before any file bytes are permanently written to disk, the upload pipeline performs:
1. **Magic Byte Verification:** Inspects the first chunk for `%PDF-` Latin-1 magic header. File extensions or client MIME types are never trusted.
2. **Streamed Size Caps:** Enforces a 50 MB hard limit during streaming, terminating the socket immediately if exceeded.
3. **Idempotent Path Resolution:** Document paths are derived strictly from server-generated IDs (`doc_<32hex>`) and tenant IDs matching regex allowlists to prevent path traversal.

## Retention and Orphan Purges

Working documents uploaded in the builder that are never attached to a sent envelope expire after 24 hours. The automated retention worker regularly scans the storage root and purges orphaned files.
