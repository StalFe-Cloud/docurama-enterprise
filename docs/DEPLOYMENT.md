# Deployment Guide — Docurama

Docurama is a Next.js 16 + Prisma application (Bun toolchain). One image, one chart, one compose file cover every supported shape.

| Platform | Target | Section |
|---|---|---|
| Vercel | Public cloud SaaS (docurama.eu) | §1 |
| Docker + docker-compose | Single host, private cloud | §2 |
| Kubernetes + Helm | Enterprise self-host | §3 |
| Any (reference) | Requirements matrix / env vars | §4–§5 |

## 1. Vercel (public cloud SaaS)

Standard Next.js deployment. **Build caveat:** the repo's `bun run build` script additionally copies static assets into `.next/standalone` for Docker — on Vercel, use the default `next build` (override the build command) and run `prisma generate` via a build hook or a `postinstall` script.

1. Import the repo; framework preset Next.js; Node 20+ runtime.
2. Set env vars (§5): at minimum `DATABASE_URL`, `SMTP_URL`, `ROOT_DOMAIN=docurama.eu`, the `S3_*` block, `PAYMENT_PROVIDER=stripe` + `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, `SSO_TXN_SECRET`, and Turnstile keys if used.
3. **Database:** external Postgres is strongly recommended for multi-region — `DATABASE_URL=postgresql://user:pass@host:5432/docurama`. (SQLite would land on ephemeral container storage.) A CI job (`postgres-portability`) proves the schema applies cleanly to PostgreSQL 16 on every push.
4. Custom domains (routing per src/middleware.ts): apex `docurama.eu` (marketing when unauthenticated) with `www` redirected to apex; `app.` (portal — point the project's primary domain here); `docs.`, `verify.`, `status.`, `security.`, `mta-sts.` (whole-host rewrites), plus `sign.`, `mail.`, `api.`, `admin.`. **`/api/*` must stay on the app host** — middleware passes `/api`, `/_next`, static and `.well-known` paths through untouched on every host, so keep DNS for API consumers on `app.` (or `api.`, which rewrites to the API index).
5. Object storage: S3 block (§5) pointing at AWS S3 / R2 / etc. — never the Vercel filesystem.

## 2. Docker single host (private cloud)

```bash
cp .env.example .env            # edit: DATABASE_URL stays file:/app/db/custom.db (absolute, in-volume)
docker compose up -d            # app only, local filesystem storage
docker compose --profile s3 up -d          # + SeaweedFS S3 object storage (bucket auto-creates)
docker compose --profile s3 --profile mail up -d   # + Mailpit SMTP sink (eval only)
```

- Image: non-root (uid 10001), `HEALTHCHECK` on `/api/health`, entrypoint runs an idempotent `prisma db push` on boot.
- Host mounts: `./db` and `./storage` (override with `DB_DIR`/`STORAGE_DIR`); `PORT_BIND` defaults to `0.0.0.0:3002`.
- With the s3 profile: set `S3_ENDPOINT=http://seaweed:8333`, `S3_BUCKET=docurama`, `S3_ACCESS_KEY_ID=docurama`, `S3_SECRET_ACCESS_KEY=…` in the app environment (compose file comments show the block).
- With the mail profile: `SMTP_URL=smtp://mailpit:1025?tls=off`, inbox UI at `http://127.0.0.1:8025`.
- TLS: put Caddy or nginx in front and terminate TLS there (the container speaks plain HTTP on :3000). `ROOT_DOMAIN` must be set for vanity-subdomain routing.
- Worker: single replica runs the in-process worker; do not scale this service beyond one without Postgres + `DOCURAMA_WORKER=off`.

## 3. Kubernetes + Helm (enterprise)

Chart: `deploy/helm/docurama` (see `values.yaml`).

```bash
kubectl create secret generic docurama-smtp --from-literal=SMTP_URL='smtp://user:pass@relay:587'
helm install docurama deploy/helm/docurama \
  --set ingress.hosts[0].host=app.example.com \
  --set rootDomain=example.com \
  --set smtp.existingSecret=docurama-smtp
```

Key values: `replicaCount: 1` (**SQLite mode must stay single-replica** — the DB lives on the RWO PVC; the app itself is stateless); `persistence` (20Gi PVC, `dbSubPath: db`, `storageSubPath: storage`); external Postgres via `extraEnv` → `DATABASE_URL` + `persistence.enabled: false` + S3 storage for multi-replica; `s3.*` block (endpoint/bucket/region/`forcePathStyle: true` for SeaweedFS/MinIO/R2, creds via `s3.existingSecret`); ingress className `nginx` with cert-manager annotation; probes hit `/api/health` (liveness 25 s/30 s, readiness 10 s/10 s); resources requests 250 m/512 Mi, memory limit 1 Gi; `skipDbPush: true` when you run migrations as a dedicated Job.

## 4. Requirements matrix

| Component | Minimum | Options |
|---|---|---|
| Database | SQLite (default, `file:…` absolute path) | PostgreSQL via `DATABASE_URL` (required multi-replica) |
| Object storage | Local POSIX dir (`STORAGE_DIR`) | Any S3-compatible: SeaweedFS (Apache-2.0), MinIO/Garage (AGPLv3), Ceph RGW, AWS S3, Cloudflare R2, B2 — see docs/STORAGE-OPTIONS.md |
| Mail | None (outbox-only mode) | `SMTP_URL` (smtp:// STARTTLS or smtps:// implicit TLS) |
| TLS | Terminated at proxy/ingress | Caddy, nginx, or ingress + cert-manager |
| Runtime | Bun 1.2 (Dockerfile `oven/bun:1.2`) | Node 20+ for local tooling; `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1` if next/font TLS fails |

## 5. Environment variable reference

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Prisma datasource. SQLite absolute `file:` path, or `postgresql://…` |
| `STORAGE_DIR` | Local document tree (ignored once S3 is fully configured) |
| `S3_ENDPOINT` | S3-compatible endpoint (unset = AWS default). All four core vars must be set together |
| `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Bucket + credentials (partial config stays on local storage, loudly warned) |
| `S3_REGION` | Region label (default `us-east-1`) |
| `S3_AUTO_CREATE_BUCKET` | Create bucket on first use (default `1`) |
| `SMTP_URL` | `smtp://user:pass@host:587` / `smtps://…:465` / append `?tls=off` for test relays. Unset = outbox-only |
| `DOCURAMA_WORKER` | `off` disables the in-process worker (all-but-one replica, external crons) |
| `NEXT_PUBLIC_DEMO_MODE` | Demo credential buttons on sign-in. **Must be unset/false in production** |
| `ROOT_DOMAIN` | Base domain for vanity subdomain routing (default `docurama.eu`) |
| `REKOR_API_URL` | Rekor log for transparency witnessing (default public instance; point at a private Rekor if needed) |
| `REKOR_WITNESS` | `off` disables witnessing entirely (air-gapped) |
| `PAYMENT_PROVIDER` | `stripe` (with `STRIPE_SECRET_KEY`) enables Stripe; anything else = manual bank-transfer mode |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Verifies `/api/billing/webhook` signatures (`whsec_…`) |
| `STRIPE_API_BASE` | Test seam: point the Stripe SDK at a stub server |
| `TURNSTILE_SECRET_KEY` (+ `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) | Optional Cloudflare Turnstile on public forms; unset = layer skipped |
| `SSO_TXN_SECRET` | HMAC key for SSO transaction cookies — **set in production** |
| `EVIDENCE_PORTAL_URL` | Push sealed-envelope attestations to a central verification portal |
| `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS` | Use OS cert store for next/font fetches |

## 6. Secrets handling

- Never commit `.env` (it is gitignored; `.env.example` is the template).
- Rotate `STRIPE_WEBHOOK_SECRET`: create a second webhook endpoint in the Stripe dashboard (new secret) → update env → verify a test event → delete the old endpoint.
- Rotate `SSO_TXN_SECRET`: in-flight SSO transactions (10-min cookie) are invalidated — rotate in a maintenance window; sessions themselves are unaffected.

## 7. Post-deploy verification checklist

1. `curl -fsS https://app.<root>/api/health` → **200**, `status: "ok"`, storage backend as intended, `mail.mode: "smtp"`.
2. Signup smoke test: create an account at `/welcome`, confirm the verification mail lands (outbox drains).
3. Send and sign a test envelope end-to-end (send → sign link → seal).
4. Verify the sealed envelope on the public portal (`https://verify.<root>`, envelope code).
5. Stripe mode: webhook endpoint `https://app.<root>/api/billing/webhook` registered in the Stripe dashboard for `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`; `STRIPE_WEBHOOK_SECRET` set; one test card payment completes.
6. `/status` renders and reports green.
