---
title: "Self-hosting Docurama: Docker, Kubernetes and everything an enterprise needs"
description: "A practical tour of running Docurama on your own infrastructure — single-host Docker Compose with SeaweedFS, Kubernetes with Helm, SMTP relay, SSO and attested verification for on-prem instances."
date: 2026-09-16
author: "Docurama Engineering"
tags: [self-hosting, deployment, enterprise]
draft: false
---

Some contracts will never be allowed to leave your infrastructure — defense, healthcare, banking, or simply a security policy written in blood. Docurama was designed from day one to run entirely on your metal, with the same evidence guarantees as the cloud SaaS at [docurama.eu](https://docurama.eu).

## What a self-hosted stack looks like

The complete stack is one Next.js application plus three pluggable services:

| Concern | Cloud SaaS | Self-hosted |
|---|---|---|
| Application | docurama.eu | Your container / Helm release |
| Database | Managed | SQLite (default) or PostgreSQL |
| Object storage | EU S3 | Local POSIX, or any S3-compatible backend (SeaweedFS, MinIO, Ceph, AWS S3) |
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
- **Your own certificates.** Per-workspace RSA-2048 signing certificates, or bring your own keys for sealing.
- **Payments out-of-band.** The billing engine runs in manual mode: workspaces request activation, transfers are approved in the admin console, and the full ledger is audited. No Stripe dependency.
- **Attested verification.** Set `EVIDENCE_PORTAL_URL` and your instance pushes GDPR-minimal, signed attestations at seal time — counterparties and auditors can verify your on-prem documents on the public portal without touching your network.
- **Backups.** `scripts/backup.sh` produces a consistent SQLite + object-storage snapshot with retention rotation; wire it to cron or your GitOps pipeline.

## Operational honesty

Our [operations runbook](/docs/self-hosting/operations) documents the boring-but-critical parts: health checks, mail outbox inspection, renewal-worker cadence, upgrade procedure and rollback. The same document our own operators use runs your instance — self-hosting should never mean second-class documentation.

If any of this sounds like it needs a conversation — volume pricing, custom SLAs, QSCD integration — the [enterprise page](/enterprise) reaches a human, not a funnel.
