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

## Pluggable Backend: Local Filesystem or S3-Compatible Storage

The same policy module writes to one of two backends, selected purely by
environment:

- **Local filesystem** (default): documents under `STORAGE_DIR`
  (`documents/{tenantId}/{docId}.pdf`). Zero-config, ideal for single-node.
- **S3-compatible object storage**: set `S3_ENDPOINT`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (optionally `S3_REGION`,
  `S3_AUTO_CREATE_BUCKET`). Works with SeaweedFS, MinIO, Garage, Ceph RGW,
  AWS S3, Cloudflare R2 and anything speaking the S3 API.

Everything above (magic-byte checks, size caps, server-minted keys, tenant
prefixing) applies identically to both backends: an upload is validated
in memory and only a complete, verified PDF ever reaches the bucket, and a
rejected upload leaves no object behind. The relative `storageKey` stored on
each Document row is identical on both backends, so switching or migrating is
a data copy, not a schema change. `/api/health` reports the active backend
(`checks.storage.backend`) and probes the write path on every call.

See `docs/STORAGE-OPTIONS.md` in the repository for the full engine
comparison (licences included) and deployment recipes per topology.
