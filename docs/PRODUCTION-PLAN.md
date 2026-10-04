# Docurama Portal — Production Plan

**Target:** `https://app.docurama.eu` (workspace) · `https://admin.docurama.eu` (platform console) · `https://verify.docurama.eu` (public verification)
**Entity/configuration:** Names, addresses, domains and infrastructure examples below are operator-supplied historical context; verify them for the installation before release.
**Delivery line:** `quality` branch on `github.com/StalFe-Cloud/docurama` (source of truth)
**Release record:** Pin the reviewed commit and image digest at promotion. Historical baseline references are not evidence for the current candidate.

---

## 1. Architecture

| Layer | Component | Notes |
|---|---|---|
| Edge | DNS (docurama.eu zone, see `download/docurama.eu.zone`) | 11 sub-domains, MX/SPF/DKIM/DMARC/MTA-STS/CAA records. `ROOT_DOMAIN` env makes the routing portable to other zones |
| TLS / proxy | Caddy (automatic ACME Let's Encrypt) or nginx | Terminates TLS, proxies to the Next.js standalone server |
| App | Next.js 16 (App Router) standalone build, port 3000 | Single Node/Bun process, server components + API routes |
| Data | SQLite via Prisma (`db/custom.db`) | Operator-selected hosting; verify actual residency. Consistent database backups. Postgres portability gated in CI (schema applies cleanly to PostgreSQL on every push) |
| Files | `public/` static + per-tenant document artifacts | Bundled in image; move to object storage at scale (§9) |
| Mail | SMTP relay (`notifications@docurama.eu`) | Sender identity fixed to the verified sending domain. Delivery engine: `SMTP_URL` env (unset = outbox-only mode), retries with backoff, 5 attempts |
| Webhooks | HMAC-signed event deliveries (`X-Docurama-Signature`) | Managed in Settings → API; retried with backoff by the background worker |
| Health | `GET /api/health` | DB + storage + mail + webhook + Rekor posture; 503 when critical checks fail. Docker HEALTHCHECK and Helm probes target it |
| Time-stamping | RFC 3161 TSA (DigiCert / Sectigo / FreeTSA presets) | Configured per workspace in Settings → eSign |
| Ops | `download/DOCURAMA-DNS-EMAIL-PROVISIONING.md` + this plan | Restore, backup, update, rollback runbooks. K8s: `deploy/helm/docurama`; containers: hardened `Dockerfile` + `docker-compose.yml`; backups: `scripts/backup.sh` |

Minimum server: 2 vCPU / 4 GB RAM / 40 GB SSD, Debian 12 or Ubuntu 24.04, EU region (Paris). One box carries app + DB; the design stays single-node until the Postgres/object-storage migration.

---

## 2. Restore-from-repo runbook (cold start)

The repository is the single source of truth. A host rebuild also requires protected configuration, keys, database and document recovery. Rehearse and measure recovery before scheduling a cutover:

```bash
# 1. Fetch the release
git clone -b quality https://github.com/StalFe-Cloud/docurama.git /opt/docurama
cd /opt/docurama

# 2. Configure environment
cp .env.example .env            # then edit: DATABASE_URL (absolute path)
# Prisma needs an absolute SQLite path in production, e.g.
#   DATABASE_URL=file:/opt/docurama/db/custom.db

# 3. Install dependencies and generate the Prisma client
bun install                     # or: npm ci
node scripts/schema-for.mjs sqlite
bunx prisma generate --schema prisma/sqlite/schema.prisma

# 4. Apply reviewed history to an empty target or approved restored/baselined target
bunx prisma migrate deploy --schema prisma/sqlite/schema.prisma

# 5. (First boot only) seed demo/QA data — SKIP on production restores
#    bunx prisma db seed        # only for QA environments

# 6. Build the standalone production bundle
bun run build                   # next build + standalone assembly

# 7. Boot behind Caddy
bun run start                   # NODE_ENV=production, port 3000
```

Caddy (TLS termination, `:443 → :3000`):

```
app.docurama.eu, admin.docurama.eu, verify.docurama.eu, docurama.eu {
    encode gzip zstd
    reverse_proxy 127.0.0.1:3000
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        X-Frame-Options SAMEORIGIN
    }
}
```

Systemd unit (`/etc/systemd/system/docurama.service`):

```ini
[Unit]
Description=Docurama portal
After=network.target

[Service]
WorkingDirectory=/opt/docurama
ExecStart=/usr/bin/bun /opt/docurama/.next/standalone/server.js
Environment=NODE_ENV=production
Environment=DATABASE_URL=file:/opt/docurama/db/custom.db
Restart=always
RestartSec=5
User=docurama

[Install]
WantedBy=multi-user.target
```

---

## 3. Incremental updates (the delivery workflow)

Every change lands on `quality` and is pulled incrementally — never rebuild from scratch:

```bash
cd /opt/docurama
sudo systemctl stop docurama
git checkout --detach <reviewed-release>
bun install --frozen-lockfile
node scripts/schema-for.mjs sqlite
bunx prisma generate --schema prisma/sqlite/schema.prisma
bunx prisma migrate deploy --schema prisma/sqlite/schema.prisma
bun run build
sudo systemctl start docurama
curl -fsS https://app.docurama.eu/api/health | head -c 200
```

Rollback is migration-aware: a prior image/revision does not reverse schema or data changes. Reuse the upgraded database only after prior-version compatibility was rehearsed. Otherwise stop writes and restore the proven matching database, document/blob snapshot and keys/configuration, or apply a reviewed forward repair. Account for post-backup writes and verify health, login, tenant boundaries and document/evidence integrity. See `DEPLOYMENT.md` §2.2 and §8 for existing-database baseline and recovery gates.

---

## 4. Configuration inventory

| Setting | Where | Production value |
|---|---|---|
| `DATABASE_URL` | `.env` | `file:/opt/docurama/db/custom.db` |
| Session cookie | code (CHIPS-aware) | `SameSite=None; Secure; Partitioned` over HTTPS |
| SMTP (platform) | Admin → Platform Settings | `Docurama Sign <notifications@docurama.eu>` |
| SMTP (per-org override) | Settings → Notifications | optional per workspace |
| Sending domain | Settings → Account → Domain verification | TXT `docurama-verify=<token>` on `_docurama.<domain>` |
| TSA | Settings → eSign | DigiCert / Sectigo / FreeTSA + custom |
| Signing certs | Settings → eSign | X.509 / PKCS#12, RSA-2048, SHA-256, one-click provisioning |
| SMS gateway | Settings → SMS | Twilio / Vonage / WhatsApp Cloud API / 12+ providers |
| API keys | Settings → API | `X-API-Key` on `/api/v1/*`, scoped |
| MCP server | Settings → MCP | `/api/mcp`, JSON-RPC 2.0, key-authenticated |
| DNS zone | `download/docurama.eu.zone` | full BIND export, 11 records + sub-domains |

Secrets policy: credentials (SMTP passwords, SMS secrets, TOTP secrets, PKCS#12 blobs) live only in the database file and are never echoed back in full by any API — masked previews only. The database file is chmod 600 and included in encrypted backups.

---

## 5. Security baseline

1. **Sessions** — server-side session table (device, IP, timestamps); individual revocation and "sign out everywhere"; 7-day expiry; cookie or bearer token both resolve to a revocable session.
2. **Two-factor (TOTP)** — RFC 6238, ±1 step window, 10 one-time recovery codes stored as SHA-256 hashes; org-level enforcement flag (Settings → Users).
3. **Password change** — requires current password, revokes all other sessions.
4. **Audit trail** — every settings mutation writes an `AuditEvent` (actor, role, severity, detail) surfaced in Admin → Audit Log; the chain is periodically sealed (block height).
5. **API keys** — shown once at creation, stored as a digest with a display prefix, per-scope enforcement (`READONLY`, `ENVELOPES`, `TEMPLATES`, `FULL`).
6. **Headers** — HSTS, nosniff, referrer policy, frame options at the edge (Caddy snippet above).
7. **Rate limits** — login throttling via security events; MCP per-key per-minute limit (default 60).

## 6. Compliance-related features and acceptance limits

**Blocked acceptance:** the reviewed signing path authenticates evidence and digests;
it does not establish embedded PDF signing or a valid TSA token. Historical B-T
labels are metadata, not timestamp proof. PAdES, RFC 3161 and Part 11 claims remain
blocked until implementation and independent artifact/deployment validation.

| Framework | Where it shows up |
|---|---|
| **eIDAS (AdES/QES)** | Signature-level settings are not proof of qualified signatures or embedded PAdES conformance. Validate completed PDFs, identity assurance and certificate/trust-service integration independently |
| **21 CFR Part 11** | Manifestation, consent, reauthentication and audit features require deployment-specific validation and procedural controls; no compliance certification is claimed |
| **GDPR** | DSR/retention tooling supports operator processes. Verify actual hosting, subprocessors, transfers and legal documentation; the edition alone does not establish EU residency or compliance |
| **RFC 3161** | TSA configuration does not prove a valid timestamp is embedded in each output. Validate actual TSA responses and completed artifacts |
| **SOC 2** | Controls/access-review/incident/drill records support evidence collection; no independent audit or certification is asserted |

The evidence chain and metadata verifier do not establish PDF signature conformance.
Follow `SECURITY.md` §5 and `GO-LIVE-CHECKLIST.md`: retain independent PDF,
timestamp and certificate-chain validation plus installation-specific acceptance.

## 7. Backup & restore

- **Nightly:** `scripts/backup.sh` (sqlite3 `.backup` snapshot + storage tarball, 30-day retention, optional `--gpg` encryption and `--remote` off-site rsync). Cron: `15 3 * * * /opt/docurama/scripts/backup.sh >> /var/log/docurama-backup.log 2>&1`.
- **Documents:** artifacts live in the tenant storage tree — included in the nightly tarball.
- **Restore drill:** restore consistent DB and matching documents/blob versions plus keys/configuration into an isolated target; use the matching pinned provider image and migration state, verify health, login, tenant counts and document/evidence hashes, and record measured RPO/RTO. Do not restore over a running deployment. Repeat quarterly and before migration promotion.

## 8. Monitoring & go-live checklist

Monitor: `/api/health` (uptime probe), SQLite file size, disk usage, SMTP test (Settings → Notifications → Test), TSA reachability (Settings → eSign → Test TSA), SMS gateway test, nightly backup freshness.

Go-live:
- [ ] DNS zone published (A/AAAA records for app/admin/verify, MX, SPF, DKIM, DMARC, MTA-STS, TLS-RPT, CAA)
- [ ] TLS certificates issued (Caddy ACME) and HSTS header verified
- [ ] `notifications@docurama.eu` SMTP relay authenticated; SPF/DKIM/DMARC alignment verified (mail-tester.com ≥ 10/10)
- [ ] Platform admin bootstrap: strong password + TOTP enrolled; demo accounts removed or rotated
- [ ] Workspace sending domain verified for the production tenant
- [ ] Signing certificate issued + activated (Settings → eSign); TSA test green
- [ ] Backups scheduled and first restore drill completed
- [ ] `admin@docurama.eu` postmaster/abuse/DMARC mailboxes reachable (per provisioning doc)
- [ ] Caddy/systemd units enabled; restart-on-boot verified
- [ ] `git rev-parse HEAD` recorded in the change log (Admin → Audit Log shows deploy event)

## 9. Scale-out path (when single-node SQLite is no longer enough)

1. **Database** - rebuild with `DB_PROVIDER=postgresql`; the generated client is fixed at build time. Apply the reviewed PostgreSQL history and rehearse a deliberate transfer of existing data with tenant counts, ownership, document/evidence integrity and rollback checks. Changing `DATABASE_URL` alone does not convert an image or transfer data. CI runtime/schema checks are acceptance inputs, not a production migration receipt.
2. **Documents** — move artifacts to S3-compatible EU object storage (Scaleway Paris / OVH Gravelines).
3. **Jobs** — the background worker (src/instrumentation.ts: mail + webhook retry passes) is single-instance by design. On a multi-replica tier set `DOCURAMA_WORKER=off` on all but one replica, or lift both passes into an external cron/queue worker — they are self-contained functions over the database.
4. **App** — stateless app tier behind a load balancer; sessions already live in the database.

## 10. Container & Kubernetes deployments

- **Docker (hardened):** non-root uid 10001, `HEALTHCHECK` on `/api/health`, boot-time reviewed provider-specific `migrate deploy` with fail-closed startup (`DOCURAMA_SKIP_MIGRATIONS=1` only after a successful controlled migration step; legacy `DOCURAMA_SKIP_DB_PUSH` alias), demo mode off by default. `docker-compose.yml` ships named volumes for `/app/db` + `/app/storage`.
- **Kubernetes (private cloud):** `helm install docurama deploy/helm/docurama`. Probes on `/api/health`, one RWO PVC (SQLite + documents), `Recreate` strategy, SMTP via existing Secret, `ROOT_DOMAIN` derived from the ingress host. Exactly one replica until the Postgres + object-storage migration; then `DOCURAMA_WORKER=off` on all but one.
- **Self-hosted without K8s:** the §2 runbook remains the primary path; `docker compose up -d` is the one-command alternative behind your own TLS proxy.
