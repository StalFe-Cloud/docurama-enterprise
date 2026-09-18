# Docurama Helm Chart

Deploys the Docurama e-signature platform on Kubernetes with the deployment-
readiness defaults baked in: non-root hardened pod, `/api/health` liveness +
readiness probes, boot-time additive schema migration (`prisma db push`, the
entrypoint), and one PVC for SQLite + documents.

## Quick start (SQLite single-node — default)

```bash
# 1. Mail delivery (optional; without it the outbox keeps mail inspectable)
kubectl create secret generic docurama-smtp \
  --from-literal=SMTP_URL='smtp://user:pass@relay.example.com:587'

# 2. Install
helm install docurama deploy/helm/docurama \
  --set ingress.hosts[0].host=sign.example.com \
  --set smtp.existingSecret=docurama-smtp
```

The chart derives `ROOT_DOMAIN` from the ingress host (`sign.example.com` →
`example.com`) for the vanity sub-domain routing; set `rootDomain` explicitly
to override. Point DNS, let cert-manager issue TLS (annotate the ingress),
and check `curl https://sign.example.com/api/health`.

## Topology rules

| Concern | Rule |
|---|---|
| Replicas | **Exactly 1.** SQLite on a RWO PVC + in-process worker (mail/webhook retries). The Deployment uses `Recreate` so two pods never share the volume. |
| Scale-out | Postgres + S3 first (PRODUCTION-PLAN §9), then `replicaCount>1` with `DOCURAMA_WORKER=off` on all but one replica (or an external cron calling the worker passes). |
| Migrations | The container entrypoint runs `prisma db push` (idempotent, additive-only). Set `skipDbPush: true` to run migrations from a dedicated Job instead. |
| Storage | One PVC, two subPath mounts: `/app/db` (SQLite) and `/app/storage` (documents). With `s3.enabled: true` document bytes move to object storage and the PVC carries only the database. |

## Values of note

| Key | Purpose |
|---|---|
| `persistence.*` | PVC class/size and subPaths |
| `smtp.existingSecret` | Secret holding `SMTP_URL` |
| `s3.*` | S3 backend: `endpoint`, `bucket`, `region`, `autoCreateBucket`, credentials via `s3.existingSecret` (Secret with `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`). See `docs/STORAGE-OPTIONS.md`. |
| `rootDomain` | Vanity sub-domain base (default derived from ingress host) |
| `extraEnv` | e.g. external Postgres `DATABASE_URL`, `DOCURAMA_WORKER=off` |
| `skipDbPush` | disable entrypoint migration (external Job handles it) |
| `resources` | defaults 250m/512Mi requests — tune per traffic |

## Backup

Schedule `scripts/backup.sh` against the PVC (K8s CronJob running the backup
script with the PVC mounted, or Velero volume snapshots). Restore drill is
documented in PRODUCTION-PLAN §7.
