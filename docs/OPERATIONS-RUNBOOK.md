# Operations Runbook — Docurama

Audience: the on-call operator of a Docurama instance (cloud SaaS at docurama.eu or a self-hosted deployment). Read-only health checks can inspect a deployment. Queue mutation, migration, restore and deployment commands require a reviewed target and change procedure; do not run them as discovery steps. Companion docs: `DEPLOYMENT.md`, `SECURITY.md`, `PAYMENTS.md`, `docs/PRODUCTION-PLAN.md`.

## 1. Health checks

| Check | Where | What good looks like |
|---|---|---|
| Deep health | `curl -fsS https://app.<root>/api/health` | HTTP **200**, `status: "ok"` |
| Public status page | `https://status.<root>` (page `/status`) | All service probes green, no open incidents |
| Database | `/api/health` → `checks.database` | `ok: true`, `latencyMs` in the low double digits |
| Storage | `/api/health` → `checks.storage` | `ok: true`, `backend` is `"local"` or `"s3"` |
| Mail | `/api/health` → `checks.mail` | `mode: "smtp"`, queue depths near zero |
| Webhooks | `/api/health` → `checks.webhooks` | `failing: 0` |
| Rekor | `/api/health` → `checks.rekor` | `enabled: true`, `witnessed: true` |

`/api/health` (src/app/api/health/route.ts) returns **503** when either critical check (database or storage) fails — Docker HEALTHCHECK, Helm liveness/readiness probes and your external monitor all key off that status code. The payload is operational state only (no tenant data). Daily: verify 200 once. Weekly: read the full JSON and confirm `mail.mode` is what you think it is (an unset `SMTP_URL` silently means outbox-only).

## 2. Mail — the MailOutbox ledger

Every system email is a row in `MailOutbox` (QUEUED → SENT/FAILED), journaled with `attempts`, `lastError`, `nextAttemptAt`.

| State | Meaning | Action |
|---|---|---|
| `QUEUED`, `nextAttemptAt` null/past | waiting for the drain | none — worker picks it up within 30 s |
| `QUEUED`, future `nextAttemptAt` | deferred by backoff (30 s, 2 m, 8 m, 30 m) | wait; check `lastError` |
| `SENT` | delivered | none |
| `FAILED` | 5 attempts exhausted (terminal) | resend manually or via console |

Drain/retry commands require an approved target and coordination with the worker. Delivery uses leased claims; a manual retry must preserve message identity and account for prior delivery:

```bash
# Inspect the queue (scratch read-only)
bunx prisma studio          # or: sqlite3 db/custom.db "select status, count(*) from MailOutbox group by 1;"
# Force a drain pass outside the 30 s worker cadence (from the app directory)
bun -e 'const m = await import("./src/lib/mail"); console.log(await m.processOutbox(50));' --experimental  # shape: processOutbox(limit)
```

Retry a terminal FAILED row: reset it in the admin console (Ops Health / outbox feed) or via Prisma (`update MailOutbox set status='QUEUED', attempts=0, nextAttemptAt=null`). In outbox-only mode (no `SMTP_URL`) rows intentionally stay QUEUED — nothing is silently dropped; inspect them in the admin console. The hermetic contract for this engine is `e2e/mail.test.ts` (7 tests: delivery, backoff, deferral, terminal FAILED, parsing).

## 3. Billing operations

Two renewal paths, selected by provider:

- **Manual subscriptions** (`provider` null or `"manual"`) are renewed by `renewDueSubscriptions()` (src/lib/billing.ts) — the background worker calls it every 30 s, or an admin can trigger it; it rolls elapsed terms forward with rollover (unused envelopes carried, capped at one monthly allowance) and is idempotent.
- **Stripe-managed subscriptions** (`provider="stripe"`, `providerRef=sub_…`) renew via the `invoice.paid` webhook → `renewPaidTerm()`. **The worker skips them** (its query filters to manual providers). Never "fix" a stale Stripe renewal by hand-advancing `renewalAt` — replay the webhook in the Stripe dashboard instead.

PAST_DUE handling: `invoice.payment_failed` flips the subscription to PAST_DUE and mails the OWNER/ADMIN. Operator path: Billing section → **retry-payment** op (clears `failedPayment`, sets ACTIVE, audited `billing.payment_retried`) after confirming the invoice actually settled, or point the customer at the Stripe billing portal to update their card.

Manual bank-transfer approvals: Billing section → PENDING Payment (reference `DRM-…`) → **payment.approve**. The bank-reference note is **mandatory** — the API rejects an empty note. Approval runs `activateSubscription()`, the exact same path as a Stripe checkout completion. Full detail: `PAYMENTS.md`.

## 4. Background jobs

One in-process loop (src/instrumentation.ts), first pass ~5 s after boot, then every 30 s:

1. `processOutbox(20)` — drain due SMTP mail.
2. `retryFailedDeliveries(10)` — re-POST failed webhooks whose backoff elapsed (schedule 1 m / 5 m / 15 m / 30 m, byte-identical payload snapshots, HMAC `X-Docurama-Signature`).
3. `renewDueSubscriptions(20)` — manual-provider renewals only (see §3).

Single-instance rule: exactly one replica must run the worker. Multi-replica tiers set `DOCURAMA_WORKER=off` on all but one. Health `checks.webhooks.failing` > 0 for more than an hour means a consumer is down — check the delivery log in Settings → API & Webhooks.

## 5. Backups and restore drills

`scripts/backup.sh` produces, under `BACKUP_DIR` (default `/var/backups/docurama`):

- `db-YYYYmmdd-HHMMSS.sqlite` — consistent snapshot via `sqlite3 .backup` (safe while the server runs)
- `storage-YYYYmmdd-HHMMSS.tar.gz` — the document tree (`STORAGE_DIR`)
- Retention pruning past `KEEP_DAYS` (default 30), optional GPG encryption (`--gpg <recipient>`) and off-site rsync (`--remote backup@host:/path`)

```bash
# Cron (03:15 nightly):  15 3 * * * /opt/docurama/scripts/backup.sh >> /var/log/docurama-backup.log 2>&1
# Recovery example only after an isolated drill, approved recovery point and stopped writers:
systemctl stop docurama
gpg -d db-….sqlite.gpg > /opt/docurama/db/custom.db      # if encrypted
tar xzf storage-….tar.gz -C /opt/docurama/storage
systemctl start docurama && curl -fsS https://app.example.com/api/health
```

Run the drill against a **copy** first. The standard test trick (used by every E2E suite): copy `db/custom.db` to a scratch path and point `DATABASE_URL` at the copy — tests never mutate the committed seed. S3-backed deployments: snapshot the bucket (versioning/lifecycle) in addition to the DB backup; document bytes are not in the SQLite file.

## 6. Incident response

Severity ladder (as used on Incident records and in the compliance library):

| Level | Definition (summary) | First moves |
|---|---|---|
| **SEV1** | Confirmed personal-data breach or total sealing outage | Crisis cell ≤ 30 min; CNIL notification within 72 h (GDPR Art. 33); status page red |
| **SEV2** | Serious degradation, contained (e.g. credential-stuffing wave) | Contain at edge, rotate affected credentials, status page degraded |
| **SEV3** | Minor / cosmetic (e.g. expired dependency CVE) | Ticket, schedule fix, status page note if user-visible |

Where evidence lives: `AuditEvent` (every mutation, severities INFO/WARNING/CRITICAL) and `SecurityEvent` — both browsable in the admin console → Audit Log (chain status + severity filter). Disclosure path for external reporters: `security@docurama.eu` (policy at `https://security.<root>`, machine-readable `/.well-known/security.txt`). Status-page updates go through the incident ledger rendered at `/status` — post early, update often.

## 7. Common procedures

| Procedure | Where | Notes |
|---|---|---|
| Suspend a tenant | Admin → Tenants → suspend | Reason **required**; audited CRITICAL. Restore is the paired op (audited WARNING) |
| Force 2FA for a user | Admin → Users → force-2fa | Sets `totpEnabled`; the user must complete enrolment. Org-wide: Tenant.enforceTwoFactor blocks sign-in without 2FA |
| Cancel subscription at period end | Admin → Billing → cancel-subscription | Reason required; status CANCELED, paid term honored. Stripe-billed customers can self-serve in the Stripe portal (`customer.subscription.deleted` → CANCELED) |
| Void an envelope | Admin → Envelopes → void | Reason required; writes an EnvelopeEvent + audit row |
| Evidence-key regeneration | treat as a **key-rotation event** | The evidence key is TOFU-pinned: the first key an instance registers with the verification portal is the key every later attestation must match. Regenerating breaks portal pins and continuity of public verification until re-attestation — announce, rotate deliberately, keep the old cert for verifying existing evidence packs |

Escalation contacts: support@docurama.eu (product), security@docurama.eu (incidents/disclosure), billing@docurama.eu (payments).
