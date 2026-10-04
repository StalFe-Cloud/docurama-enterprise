# Deployment Guide — Docurama

Docurama is a Next.js 16 + Prisma application (Bun toolchain). Build a separate image for each database provider. Deployment examples require a reviewed release, protected runtime configuration and installation-specific acceptance evidence.

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
3. **Database:** external Postgres is strongly recommended for multi-region — `DATABASE_URL=postgresql://user:pass@host:5432/docurama`. (SQLite would land on ephemeral container storage.) Note that the URL alone is not enough: the Prisma provider is fixed when the image is built — see §2.1. A CI job (`postgres`) generates the PostgreSQL client, seeds, boots the app against PostgreSQL 16 and runs the HTTP and browser suites on every push.
4. Custom domains (routing per src/middleware.ts): apex `docurama.eu` (marketing when unauthenticated) with `www` redirected to apex; `app.` (portal — point the project's primary domain here); `docs.`, `verify.`, `status.`, `security.`, `mta-sts.` (whole-host rewrites), plus `sign.`, `mail.`, `api.`, `admin.`. **`/api/*` must stay on the app host** — middleware passes `/api`, `/_next`, static and `.well-known` paths through untouched on every host, so keep DNS for API consumers on `app.` (or `api.`, which rewrites to the API index).
5. Object storage: S3 block (§5) pointing at AWS S3 / R2 / etc. — never the Vercel filesystem.

## 2. Docker single host (private cloud)

```bash
cp .env.example .env            # edit: DATABASE_URL stays file:/app/db/custom.db (absolute, in-volume)
docker compose up -d            # app only, local filesystem storage
docker compose --profile s3 up -d          # + SeaweedFS S3 object storage (bucket auto-creates)
docker compose --profile s3 --profile mail up -d   # + Mailpit SMTP sink (eval only)
```

- Image: non-root (uid 10001), `HEALTHCHECK` on `/api/health`, entrypoint runs reviewed provider-specific `prisma migrate deploy` on boot and refuses to start if it fails.
- Host mounts: `./db` and `./storage` (override with `DB_DIR`/`STORAGE_DIR`); `PORT_BIND` defaults to `0.0.0.0:3002`.
- With the s3 profile: set `S3_ENDPOINT=http://seaweed:8333`, `S3_BUCKET=docurama`, `S3_ACCESS_KEY_ID=docurama`, `S3_SECRET_ACCESS_KEY=…` in the app environment (compose file comments show the block).
- With the mail profile: `SMTP_URL=smtp://mailpit:1025?tls=off`, inbox UI at `http://127.0.0.1:8025`.
- TLS: put Caddy or nginx in front and terminate TLS there (the container speaks plain HTTP on :3000). `ROOT_DOMAIN` must be set for vanity-subdomain routing.
- Worker: single replica runs the in-process worker; do not scale this service beyond one without Postgres + `DOCURAMA_WORKER=off`.

### 2.1 PostgreSQL

Prisma cannot read `datasource.provider` from an environment variable, so the
provider is fixed **at build time**. One image targets one database; pointing a
SQLite-built image at a `postgresql://` URL does not work.

```bash
DB_PROVIDER=postgresql DATABASE_URL=postgresql://docurama:docurama@postgres:5432/docurama   docker compose --profile postgres up -d --build
```

`--build` is required on first use, and again if you switch back to SQLite.
`scripts/schema-for.mjs` emits `prisma/schema.postgresql.prisma` from the single
source schema, changing only the provider line — it fails loudly if anything
else would have to differ, which guards schema portability. The entrypoint applies the reviewed SQL history
under `prisma/postgresql/migrations/`; portability checks do not migrate existing data.

Postgres is **necessary but not sufficient** for multi-replica. The background
worker (mail and webhook retries) runs in-process, so exactly one replica may
have it enabled; set `DOCURAMA_WORKER=off` on all the others. Object storage is
the third requirement — see docs/STORAGE-OPTIONS.md.

**Upgrading to the folded lead-search columns.** `EnterpriseLead` gained
`companyLower`/`contactNameLower` so admin lead search works on PostgreSQL
(PostgreSQL `LIKE` is case-sensitive; SQLite's is not, which hid the bug).
Schema migration defaults do not compute folded values for existing rows, so rehearse and run
once after upgrading, or existing leads stay unsearchable:

```bash
bun scripts/backfill-lead-search.ts
```

### 2.2 Reviewed migrations and existing databases

Generate the selected provider schema before using its reviewed migration history:

```bash
node scripts/schema-for.mjs sqlite
bunx prisma migrate deploy --schema prisma/sqlite/schema.prisma
# PostgreSQL build/tooling instead:
# node scripts/schema-for.mjs postgresql
# bunx prisma migrate deploy --schema prisma/postgresql/schema.prisma
```

These are schema-changing commands for an approved target, never a discovery step.
The histories are `prisma/sqlite/migrations/` and `prisma/postgresql/migrations/`.
Review their SQL and rehearse deployment on an isolated restore before upgrading.
Startup does not run `db push`, reset, accept-data-loss or automatic baselining.
Migration failure stops startup; investigate the failure before another attempt.

For a nonempty database previously created with `db push`, stop the rollout.
The committed `0_release_baseline` SQL and `prisma/baselines/release-20260920.prisma`
are reference artifacts, not proof that an arbitrary existing database matches.
An operator must compare the actual schema, constraints and data with the selected
history in an isolated restored copy, account for already-applied later changes,
review any reconciliation SQL, and record exactly which migrations are satisfied.
Only a deliberate reviewed offline baseline process may mark matching migrations
as applied. No universal `migrate resolve` command is supplied: marking the wrong
history can conceal missing tables or columns. Do not baseline automatically at boot.

Use `DOCURAMA_SKIP_MIGRATIONS=1` only when a separately controlled migration step
has succeeded against the same target and image version. `DOCURAMA_SKIP_DB_PUSH`
is a legacy compatibility alias. Neither bypass proves schema compatibility.

### 2.3 Immutable template terms and historical envelopes

The nullable `Envelope.contractSnapshot` migration stores template terms and
validated signature-location metadata frozen at send time. Review
`20261004_contract_snapshot` in the selected provider history and regenerate the
matching Prisma client before testing this release. Null is intentional for
historical rows; migration must not invent historical terms from today's template.

Legacy active/completed template envelopes, and envelopes without an uploaded
document or valid snapshot, refuse signing/render/export when their snapshot is
missing or invalid. APIs return 409; the signer page shows an unavailable state.
Review retained source/history with the operator before reissuing pending contracts,
and preserve historical records. Do not automatically backfill terms from a mutable
current template. Legacy uploaded-document-only envelopes may use their original
PDF subject to the existing ownership, state and signer-policy checks.

The completed-document renderer now assembles a PDF from frozen terms or the
preserved uploaded original, captured field values and typed-signature adoption,
with completion audit pages and a separate printable completion record. It verifies
the stored evidence digest before output.
This is separate from embedded PAdES signing or a trusted timestamp; those
conformance gates remain blocked until independently implemented and verified.
Rendering supports Western text, standard italic typed signatures, single-line
fields, calendar dates without timezone and unrotated/uncropped positioned fields.
Unsupported glyphs, invalid final geometry or missing required legacy adoption
proof fail closed rather than generating a misleading completed document. Review
all new signature/evidence migration columns in the selected provider history and
regenerate the matching client. Actual recipient sequencing, completion-mail,
final-artifact and independent conformance acceptance remain in the go-live
checklist; source implementation alone does not clear those gates.

Review queued signing notifications created before the outbox correlation migration.
`SIGN_INVITE`, `REMINDER` and `SIGN_COMPLETED` rows without an envelope correlation
are retained as `CANCELLED` with a precise review reason; they are not automatically
sent. The operator must review envelope/recipient state and deliberately reissue
eligible notifications through the supported workflow. Do not infer missing
bindings or bulk requeue historical rows. Unrelated team/test mail keeps its existing
behavior. SMTP acceptance remains separate from confirmed recipient delivery.

## 3. Kubernetes + Helm (enterprise)

Chart: `deploy/helm/docurama` (see `values.yaml`).

```bash
kubectl create secret generic docurama-smtp --from-literal=SMTP_URL='smtp://user:pass@relay:587'
helm install docurama deploy/helm/docurama \
  --set ingress.hosts[0].host=app.example.com \
  --set rootDomain=example.com \
  --set smtp.existingSecret=docurama-smtp
```

Key values: `replicaCount: 1` (**SQLite mode must stay single-replica** — the DB lives on the RWO PVC; the app itself is stateless); `persistence` (20Gi PVC, `dbSubPath: db`, `storageSubPath: storage`); external Postgres via `extraEnv` → `DATABASE_URL` + `persistence.enabled: false` + S3 storage for multi-replica; `s3.*` block (endpoint/bucket/region/`forcePathStyle: true` for SeaweedFS/MinIO/R2, creds via `s3.existingSecret`); ingress className `nginx` with cert-manager annotation; probes hit `/api/health` (liveness 25 s/30 s, readiness 10 s/10 s); resources requests 250 m/512 Mi, memory limit 1 Gi; `skipDbPush: true` is the chart's legacy skip value; use it only after a dedicated reviewed migration Job succeeds. Use the same provider image, database and migration history for Job and app.

## 4. Requirements matrix

| Component | Minimum | Options |
|---|---|---|
| Database | SQLite (default, `file:…` absolute path) | PostgreSQL via `DATABASE_URL` (required multi-replica) |
| Object storage | Local POSIX dir (`STORAGE_DIR`) | Any S3-compatible: SeaweedFS (Apache-2.0), MinIO/Garage (AGPLv3), Ceph RGW, AWS S3, Cloudflare R2, B2 — see docs/STORAGE-OPTIONS.md |
| Mail | None (outbox-only mode) | `SMTP_URL` (smtp:// STARTTLS or smtps:// implicit TLS) |
| TLS | Terminated at proxy/ingress | Caddy, nginx, or ingress + cert-manager |
| Runtime | Bun 1.4.2 (Dockerfile `oven/bun:1.4.2`; CI pin matches the safe runner) | Node 20+ for local tooling; `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1` if next/font TLS fails |

## 5. Environment variable reference

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Prisma datasource. SQLite absolute `file:` path, or `postgresql://…` — **must match the provider the image was built with** (§2.1) |
| `DOCURAMA_DB_PROVIDER` | Set from the `DB_PROVIDER` build arg; the entrypoint migrates with `prisma/$DOCURAMA_DB_PROVIDER/schema.prisma`. Not something to override at runtime |
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

## 8. Backup, recovery and rollback gate

Before schema changes, capture the pinned prior image/revision, provider, migration
status, protected configuration/key inventory, consistent database snapshot and
matching document/blob recovery point. Keep runtime data outside the checkout.
For SQLite use its backup API or stop all writers; copying a live WAL database
file alone is insufficient. `scripts/backup.sh` is SQLite-specific: require a real
`sqlite3` backup path, verify encryption output and archive integrity, and inspect
its exit status. Its document archive is relative to `STORAGE_DIR`; extract into
an empty isolated directory without stripping path components. PostgreSQL needs
its own reviewed database backup/restore procedure; S3 objects need their own
versioned snapshot and consistency checks.

Prove recovery in isolation with the matching application version before promotion.
Record RPO/RTO, document hashes, tenant counts and migration state. An image rollback
does not undo SQL or data changes. Reuse an evolved database with the prior image
only after compatibility has been rehearsed. Otherwise stop writes and execute the
reviewed restore or forward repair, accounting for writes since the recovery point.
Recheck health, authentication, tenant isolation, documents and evidence after recovery.
