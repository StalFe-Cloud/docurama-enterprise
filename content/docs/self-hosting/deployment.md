---
title: Deploying Docurama
description: Run Docurama yourself with Docker Compose on a single host or the Helm chart on Kubernetes, with SQLite or PostgreSQL and optional S3 storage.
group: Self-hosting
order: 1
tags: [self-hosting, docker, kubernetes, helm]
---

Docurama is a single Next.js application with a database, a storage root or bucket, an SMTP relay and a background worker. That makes for a small operational surface: one container image covers every deployment shape, from a pilot on one host to a chart-managed replica set.

## Deployment shapes

| Shape | How | Good for |
| --- | --- | --- |
| Single host | Docker Compose | Pilots, small companies, air-gapped setups |
| Kubernetes | Helm chart `deploy/helm/docurama` | Existing clusters, scaled app tiers |

## Docker Compose on a single host

```bash
git clone <your-repo-url> docurama && cd docurama
cp .env.example .env    # edit at least SMTP_URL and ROOT_DOMAIN
docker compose up -d
```

What you get out of the box:

- **SQLite is the default database** — zero configuration, one file to back up. PostgreSQL is fully supported if you prefer it; point `DATABASE_URL` at it.
- **Local filesystem storage is the default** under `STORAGE_DIR`.
- The container runs as a **non-root user** and ships a **HEALTHCHECK** against `/api/health`.
- The container entrypoint applies database schema changes on boot.

### Optional profiles

```bash
docker compose --profile s3 --profile mail up -d
```

- `--profile s3` adds a pinned **SeaweedFS** instance — S3-compatible object storage with a healthcheck and a named volume, no external account needed.
- `--profile mail` adds **Mailpit**, an SMTP sink with a web inbox on port 8025 — the fastest way to watch mail flow during an evaluation.

## Environment essentials

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite (default) or PostgreSQL connection |
| `SMTP_URL` | Real mail delivery; unset means messages stay QUEUED in the outbox |
| `ROOT_DOMAIN` | Base domain for host-aware routing (app, docs, verify, …) |
| `STORAGE_DIR` | Local storage root (default backend) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Switch storage to S3-compatible: SeaweedFS, MinIO, Ceph RGW, AWS S3 |
| `EVIDENCE_PORTAL_URL` | Push signed attestations to your evidence portal |
| `DOCURAMA_WORKER` | `off` disables the background worker |

## Kubernetes with the Helm chart

The chart in `deploy/helm/docurama` includes:

- **liveness and readiness probes** wired to `/api/health`,
- a **persistent volume claim** for storage (RWO, with a Recreate strategy),
- an **Ingress** and `ROOT_DOMAIN` derived from the ingress host,
- an **SMTP secret** and optional S3 values (`s3.endpoint`, `s3.bucket`, credentials via an existing secret).

Validate with `helm lint` and `helm template` before applying, and check that the PVC's storage class matches what your cluster can bind.

## Health checks

`GET /api/health` reports the database, storage writability (including which backend is active), and the mail mode with queue depth; it returns **503 on critical failure**. Docker's HEALTHCHECK and the Helm probes both point here, so orchestrators react to real failures, not just process liveness.

## One worker, many app instances

The background worker — mail delivery, webhook retries, subscription renewals — must run as **exactly one instance**. You can scale the app tier horizontally behind your ingress; set `DOCURAMA_WORKER=off` on every deployment but one.

## Choosing a storage backend

Local filesystem for simplicity, S3-compatible for scale-out. Both backends enforce identical upload policies (magic-byte checks, size caps, server-minted keys), and relative storage keys are identical on both — so moving between them is a data copy, not a schema change.
