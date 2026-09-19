# Go-Live Checklist — Docurama (all platforms)

Master gate. Every box ticks before launch day; sign-off per section. Companion runbooks: `DEPLOYMENT.md`, `OPERATIONS-RUNBOOK.md`, `PAYMENTS.md`, `SSO.md`, `SECURITY.md`.

## 1. Product & content

- [ ] Pricing ladder verified end-to-end: **Solo €12 / Starter €29 / Business €79 / Enterprise sales-led** (€349 catalogue anchor); term switch −5/−10/−20% math correct (e.g. Starter 12 mo = €278.40); no "most popular" badges. Negotiated Enterprise overrides remain a separate delivery gate; see `PRICING-BRANCH-RECONCILIATION.md`.
- [ ] Legal pages reviewed by counsel: `/privacy` (processing mapped to the real data model), `/terms` (billing terms incl. 35-day months + rollover cap), DPA route to legal@.
- [ ] Cookie notice present (informational, no tracking).
- [ ] Organization JSON-LD valid (rich-results test), canonical + OG metadata on all public pages.
- [ ] `sitemap.xml` and `robots.txt` correct (portal surfaces, `/sign`, `/reset-password`, `/api/sign`, `/api/enterprise-lead` disallowed).
- [ ] Blog live and reachable; knowledge base complete (all 11 guide sections at `docs.<root>`); tutorials/demos pass on desktop + mobile.

## 2. Engineering gates

- [ ] `bunx tsc --noEmit` clean (0 errors — the build enforces types; gate also runs in CI, `.github/workflows/e2e.yml`).
- [ ] `eslint` clean.
- [ ] Production build green (`bun run build`; standalone boot verified).
- [ ] Full E2E battery green via `bash e2e/run.sh`: all Maestro flows + `api`, `evidence`, `transparency`, `rekor`, `mcp`, `plans`, `webhooks`, `visual` (0.00% diffs), `mail`, `billing`, `sso`, `bot-guard` suites (S3/SeaweedFS suite runs in CI or where a `weed` binary exists).

## 3. Cloud SaaS (docurama.eu)

- [ ] DNS: apex, `www` → apex redirect, `app.`, `docs.`, `verify.`, `status.`, `security.`, `mta-sts.` (+ `sign.`, `mail.`, `api.`, `admin.`), all resolving; MX/SPF/DKIM/DMARC/MTA-STS/TLS-RPT/CAA published.
- [ ] TLS certs valid on every host (auto-renew on).
- [ ] Database deployment selected and restore-tested. The supplied application image uses SQLite and requires one replica. PostgreSQL needs a provider-specific generated Prisma client plus full runtime integration evidence; the schema portability check alone does not establish that support.
- [ ] **S3** storage block set + bucket lifecycle policy; `/api/health` reports `storage.backend: "s3"`.
- [ ] `SMTP_URL` real credentials; **SPF/DKIM/DMARC verified on every sending domain**; test mail lands in Gmail/Outlook inboxes (not spam).
- [ ] Stripe **live** keys + `STRIPE_WEBHOOK_SECRET`; webhook endpoint registered for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`; one live test purchase and refund, plus signed test events for duplicate delivery and asynchronous settlement.
- [ ] Turnstile keys set (`TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY`).
- [ ] `SSO_TXN_SECRET` set (strong random).
- [ ] `ROOT_DOMAIN=docurama.eu`; `EVIDENCE_PORTAL_URL` set if federating attestations.
- [ ] Backups scheduled (DB + object storage snapshots + retention); restore drill done once pre-launch.
- [ ] Monitoring on `/api/health` (200/503 alerting) and `/status`; `DOCURAMA_WORKER` on exactly one instance if scaled out.

## 4. Private cloud (compose / single host)

- [ ] Deployed per `DEPLOYMENT.md` §2 (compose, storage profile chosen, Caddy/nginx TLS in front).
- [ ] Mail relay configured and tested (`SMTP_URL`) — or outbox-only mode consciously chosen.
- [ ] Manual billing mode active (default); billing inbox (billing@) staffed for bank-transfer approvals.
- [ ] Admin accounts created (no shared logins), 2FA enforced on all of them; admin surface network-restricted.
- [ ] Backup cron + off-site target verified.

## 5. Enterprise self-host (Helm)

- [ ] `deploy/helm/docurama` values reviewed: database matching the generated client, own **S3** (creds via `s3.existingSecret`), own **SMTP**, ingress + TLS, `rootDomain` set.
- [ ] Replica policy: single replica for the supplied SQLite image. Multi-replica deployment requires a separately validated PostgreSQL build and worker coordination.
- [ ] Initial administrator provisioned offline per `INSTALLATION-BOOTSTRAP.md`; first tenant created and company domain verified. Configure **tenant-owned SSO** per `SSO.md`, then complete a real IdP login/replay/2FA acceptance test. Platform-wide SSO connections are rejected.
- [ ] `EVIDENCE_PORTAL_URL` set if pushing attestations to the central verification portal (or run the portal locally).
- [ ] **Backup + restore drill completed on the cluster** (PVC snapshots or `scripts/backup.sh` in a CronJob); RPO/RTO documented.
- [ ] Network segmentation: admin/portal ingress rules, egress allow-list for TSA + IdP + SMTP + S3.

## 6. Launch day

Smoke test, in order, on production:

1. Signup → verification email received → onboarding completes.
2. First envelope: upload/send → signer link opens (public signer portal) → sign → **seal**.
3. Verify: public portal (`verify.<root>`) shows **VERIFIED** + SHA-256 digest + signers.
4. Evidence pack export opens offline and validates.
5. `/status` green; `/api/health` 200.

Support inboxes staffed: **support@, sales@, billing@, privacy@, security@, abuse@, postmaster@** (plus notifications@ sender monitored for bounces).

## 7. Post-launch (first two weeks)

- [ ] Watch the **PAST_DUE queue** daily (admin Billing) — dunning mails flowing, retry-payment only after settled invoices.
- [ ] Watch outbox **FAILED** rows (terminal after 5 attempts) and mail latency.
- [ ] Watch **webhook delivery failures** (`checks.webhooks.failing`, delivery log; 1 m/5 m/15 m/30 m retry schedule).
- [ ] Confirm **transparency checkpoints** and Rekor witnessing stay current (`checks.rekor.witnessed: true`).
- [ ] Error-rate review: server logs for 5xx, admin Ops Health trends, security-event feed for anomalies.
- [ ] Retro at day 14: pricing funnel, incident count, checklist corrections folded back into this document.
