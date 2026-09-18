# Docurama Portal — Production Plan

**Target:** `https://app.docurama.eu` (workspace) · `https://admin.docurama.eu` (platform console) · `https://verify.docurama.eu` (public verification)
**Entity:** Docurama SAS — 1 Rue Marguerin, 75014 Paris, France
**Delivery line:** `quality` branch on `github.com/StalFe-Cloud/docurama` (source of truth)
**Baseline:** commit `6905ec0` + the production-settings increment delivered in this release

---

## 1. Architecture

| Layer | Component | Notes |
|---|---|---|
| Edge | DNS (docurama.eu zone, see `download/docurama.eu.zone`) | 11 sub-domains, MX/SPF/DKIM/DMARC/MTA-STS/CAA records |
| TLS / proxy | Caddy (automatic ACME Let's Encrypt) or nginx | Terminates TLS, proxies to the Next.js standalone server |
| App | Next.js 16 (App Router) standalone build, port 3000 | Single Node/Bun process, server components + API routes |
| Data | SQLite via Prisma (`db/custom.db`) | EU residency (Paris). File-level backups. Postgres path documented in §9 |
| Files | `public/` static + per-tenant document artifacts | Bundled in image; move to object storage at scale (§9) |
| Mail | SMTP relay (`notifications@docurama.eu`) | Sender identity fixed to the verified sending domain |
| Time-stamping | RFC 3161 TSA (DigiCert / Sectigo / FreeTSA presets) | Configured per workspace in Settings → eSign |
| Ops | `download/DOCURAMA-DNS-EMAIL-PROVISIONING.md` + this plan | Restore, backup, update, rollback runbooks |

Minimum server: 2 vCPU / 4 GB RAM / 40 GB SSD, Debian 12 or Ubuntu 24.04, EU region (Paris). One box carries app + DB; the design stays single-node until the Postgres/object-storage migration.

---

## 2. Restore-from-repo runbook (cold start)

The repository is the single source of truth. A production host can be rebuilt from scratch in ~10 minutes:

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
bunx prisma generate

# 4. Create/upgrade the schema (additive; never drops data on this codebase)
bunx prisma db push

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
git fetch origin && git checkout quality && git reset --hard origin/quality
bun install --frozen-lockfile
bunx prisma generate
bunx prisma db push            # additive migrations only on this line
bun run build
sudo systemctl start docurama
curl -fsS https://app.docurama.eu/api/health | head -c 200
```

Rollback: `git reset --hard <previous-tag>` then repeat build + start. SQLite schema changes are additive (new tables / nullable columns), so a rollback to the previous build never breaks on the evolved database file.

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
5. **API keys** — shown once at creation, stored as prefix only, per-scope enforcement (`READONLY`, `ENVELOPES`, `TEMPLATES`, `FULL`).
6. **Headers** — HSTS, nosniff, referrer policy, frame options at the edge (Caddy snippet above).
7. **Rate limits** — login throttling via security events; MCP per-key per-minute limit (default 60).

## 6. Compliance posture (product features, not paperwork)

| Framework | Where it shows up |
|---|---|
| **eIDAS (AdES/QES)** | Settings → eSign: signature level per workspace; PAdES conformance on every sealed document |
| **21 CFR Part 11** | Settings → Account: Part 11 mode — signature manifestation (printed name, UTC timestamp, meaning), consent agreement capture, re-authentication before signing, computer-generated audit trail, record retention |
| **GDPR** | DSR/DSAR console (Admin → Legal), retention policies, EU data residency, consent registry, subprocessor register |
| **RFC 3161** | Trusted timestamps from configured TSA bound into the sealing pipeline |
| **SOC 2** | Controls, access reviews, incidents, vendors, restore drills (Admin → Compliance) |

## 7. Backup & restore

- **Nightly:** `sqlite3 db/custom.db ".backup '/var/backups/docurama/db-$(date +%F).sqlite'"` + copy `.next/standalone` build and `public/` artifacts; keep 30 days, encrypt at rest (age/gpg), off-site copy (rsync to a second EU host).
- **Documents:** artifacts live in the tenant storage tree — included in the nightly copy.
- **Restore drill:** restore DB file → `bun run start` → verify `/api/health` + one sealed document via `verify.docurama.eu`; quarterly drill logged in Admin → Compliance → Drills.

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

1. **Database** — `DATABASE_URL` to Postgres (Prisma supports the switch; schema is portable).
2. **Documents** — S3-compatible object storage is built in (set the `S3_*` env — see `docs/STORAGE-OPTIONS.md`); EU choices: self-hosted SeaweedFS, Scaleway Paris / OVH Gravelines, or Cloudflare R2 (free tier, zero egress).
3. **Jobs** — reminder platform job and webhook dispatcher move to a queue worker (the reminder policy model already separates manual / per-envelope / platform-scheduled runs).
4. **App** — stateless app tier behind a load balancer; sessions already live in the database.
