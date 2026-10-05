---
title: "Self-hosting Docurama: deployment options and acceptance checks"
description: "A practical tour of running Docurama on your own infrastructure — single-host Docker Compose with SeaweedFS, Kubernetes with Helm, SMTP relay, SSO and attested verification for on-prem instances."
date: 2026-09-16
author: "Docurama Engineering"
tags: [self-hosting, deployment, enterprise]
draft: false
---

Docurama can run in infrastructure you control. Validate storage, mail, networking, backup and external integrations for that installation before using it with customer contracts.

## What a self-hosted stack looks like

The complete stack is one Next.js application plus three pluggable services:

| Concern | Cloud SaaS | Self-hosted |
|---|---|---|
| Application | docurama.eu | Your container / Helm release |
| Database | Managed | SQLite (default) or PostgreSQL |
| Object storage | Configured backend | Local POSIX, or any S3-compatible backend (SeaweedFS, MinIO, Ceph, AWS S3) |
| Mail delivery | Managed relay | Your SMTP relay (`SMTP_URL`) or the always-inspectable outbox |

Everything is configured through environment variables — the full reference lives in `.env.example` and in the [deployment documentation](/docs/self-hosting/deployment).

## Option A: single host with Docker Compose

`docker-compose.yml` boots the application, an optional SeaweedFS profile for S3 storage, and Caddy for automatic TLS:

```bash
git clone https://github.com/StalFe-Cloud/docurama
cd docurama
cp .env.example .env          # set DATABASE_URL, APP_URL, SMTP_URL…
docker compose up -d --build
# with S3 storage:
docker compose --profile s3 up -d --build
```

The first boot runs migrations automatically, and `/api/health` reports readiness — database, storage and mail transport — for your uptime monitor.

## Option B: Kubernetes with Helm

The Helm chart in `deploy/helm/docurama` covers what enterprises actually ask for:

- `deployment.yaml` with health/readiness probes wired to `/api/health`;
- a `PersistentVolumeClaim` for SQLite mode, or point `DATABASE_URL` at your Postgres;
- `ingress.yaml` for your ingress controller and TLS;
- `values.yaml` exposing every environment variable, resource limit and replica setting.

```bash
helm install docurama deploy/helm/docurama \
  --set env.DATABASE_URL="postgresql://…" \
  --set env.SMTP_URL="smtp://relay.internal:25" \
  --set ingress.hosts[0].host="sign.corporate.example"
```

## The enterprise features that matter on-prem

- **Single sign-on.** OIDC (Entra ID, Google Workspace, Okta, Keycloak) and SAML 2.0, configured per email domain in Settings → SSO. IdP-verified users are JIT-provisioned into the right workspace.
- **Evidence keys and certificate settings.** Validate their purpose in your deployment. These settings do not make the current email-link flow perform PAdES, advanced or qualified certificate signing.
- **Payments out-of-band.** The billing engine runs in manual mode: workspaces request activation, transfers are approved in the admin console, and the full ledger is audited. No Stripe dependency.
- **Attestation integration.** A configured evidence portal can receive signed instance attestations. Check the actual integration result for each envelope; this is not independent identity verification or trusted timestamping.
- **Backups.** Run the database and object-storage backup procedure for the configured backend. Verify a restore into a separate recovery destination and monitor the scheduled job before relying on it.

## Operational honesty

Our [operations runbook](/docs/self-hosting/operations) documents the boring-but-critical parts: health checks, mail outbox inspection, renewal-worker cadence, upgrade procedure and rollback. The same document our own operators use runs your instance — self-hosting should never mean second-class documentation.

Use the [enterprise page](/enterprise) to discuss deployment requirements. Stronger signing assurance requires separate implementation and qualification; no qualified-signing integration is promised.
