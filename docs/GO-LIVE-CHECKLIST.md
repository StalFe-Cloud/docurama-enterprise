# Go-Live Checklist — Docurama (all platforms)

**Engineering checkpoint (2026-10-04 UTC):** reviewed source `25ae19c50e26a423e9d2386e3c76ecaf713c71f3` passed all seven CI checks. [Exact-head runtime evidence](https://github.com/StalFe-Cloud/docurama-enterprise/actions/runs/37244852380) records API 89/89, MCP 15/15 and browser 31/31 on SQLite and PostgreSQL; the SQLite suite also passed visual 7/7 and required real SeaweedFS 7/7. Native backup/restore and schema-drift checks passed for both providers. The browser suite includes desktop/mobile two-signer completion and actual completed-PDF and completion-record-PDF downloads with hash and PDF checks. This is a prior-source checkpoint: subsequent source changes require fresh CI, and qualification of the approved image digest and customer installation remains pending. Do not mark production or stronger signature-assurance acceptance complete from this checkpoint.

Master gate. Every box ticks before launch day; sign-off per section. Companion runbooks: `DEPLOYMENT.md`, `OPERATIONS-RUNBOOK.md`, `PAYMENTS.md`, `SSO.md`, `SECURITY.md`.

## 1. Product & content

- [ ] Functional signing journey using synthetic data: authoritative document/template snapshot -> sender confirmation -> correct SIGNER/CC invitations -> earlier/later-recipient waiting behavior -> partial/all-signers completion -> completed-copy notification -> final document and separately authenticated completion/evidence record. Verify the final document visibly contains the intended adopted signer marks and locked terms; a status change, snapshot artifact or original-PDF download alone is insufficient. Historical template envelopes without a valid snapshot require reviewed reissue and must not be silently reconstructed.
- [ ] Recipient/email semantics and sequence: send only the eligible first signer plus CC notice; remind eligible pending signer only; first-sign waiting receipt and next invitation once; final notices for signers/CC/sender; repeat/early attempts leave no duplicate effects. `Recipient.DELIVERED` is link-opened and `MailOutbox.SENT` is SMTP acknowledgment, neither proves inbox delivery. Verify multipart HTML/plain messaging, escaping, mailbox-bound access and trace associations with synthetic addresses.

- [ ] Signing acceptance for the selected launch scope: email-link access, typed-name adoption, exact displayed consent/version, frozen terms, recipient-bound field values, completed-PDF and completion-record downloads and evidence integrity. Advanced/Qualified signing, PAdES, trusted RFC 3161 timestamps and Part 11 enforcement remain unavailable; advertising or enabling them requires separate implementation and applicable independent qualification.

- [ ] Pricing ladder verified end-to-end: **Solo €12 / Starter €29 / Business €79 / Enterprise sales-led** (€349 catalogue anchor); term switch −5/−10/−20% math correct (e.g. Starter 12 mo = €278.40); no "most popular" badges. Negotiated Enterprise overrides are delivered: a WON lead converts to a tenant whose subscription carries `seatLimitOverride` / `envelopeLimitOverride` / `monthlyEurOverride`, and `src/lib/billing.ts` enforces those over the catalogue (admin op `lead.convert`; `e2e/lead-conversion.test.ts`). The pricing ladder itself still needs end-to-end verification.
- [ ] Legal pages reviewed by counsel: `/privacy` (processing mapped to the real data model), `/terms` (billing terms incl. 35-day months + rollover cap), DPA route to legal@.
- [ ] Cookie notice present (informational, no tracking).
- [ ] Organization JSON-LD valid (rich-results test), canonical + OG metadata on all public pages.
- [ ] `sitemap.xml` and `robots.txt` correct (portal surfaces, `/sign`, `/reset-password`, `/api/sign`, `/api/enterprise-lead` disallowed).
- [ ] Blog live and reachable; knowledge base complete (all 11 guide sections at `docs.<root>`); tutorials/demos pass on desktop + mobile.

## 2. Engineering gates

- [ ] Session MFA acceptance: test enrolled users, enforced organizations, revocation and policy changes. SSO sessions currently carry no supported local MFA proof and cannot satisfy enforced MFA policy; validate the supported password-plus-local-factor path and keep enforced-policy SSO blocked until an explicit trusted proof flow is implemented. An IdP login alone does not establish this proof.

Historical verification receipts remain in `QUALITY-VERIFICATION-20260920.md`,
`IMPROVEMENT-PLAN.md` and `worklog.md`. Re-run these gates for the pinned candidate
and record revision, command, provider, outcome and skips. A described CI job is
not evidence that it executed successfully on this revision.

- [ ] `bunx tsc --noEmit` clean (0 errors — the build enforces types; gate also runs in CI, `.github/workflows/e2e.yml`).
- [ ] `eslint` clean.
- [ ] Production build green — CI `production-image` builds the image and boots it against an empty scratch database, asserting `/api/health` and a rendered `/blog`. (A local `bun run build` needs network for `next/font/google`; the containerised build is the authoritative gate.)
- [ ] Full E2E battery green for the new candidate: API, evidence, transparency, Rekor, MCP, plans, webhooks, visual, mail, billing, SSO, bot-guard, lead-conversion, required SeaweedFS and 31 browser tests. The prior checkpoint above passed; optional storage/browser skips do not satisfy these gates. Fresh CI and exact-image qualification remain pending for subsequent source changes.
- [ ] PostgreSQL runtime gate green — CI `postgres` generates the PostgreSQL client, seeds, boots the app against PostgreSQL 16 and runs the HTTP + browser suites against it.

> Section 2 is the only section engineering can sign off alone. Sections 3–7
> need credentials, DNS, counsel review and staffed inboxes.

## 3. Cloud SaaS (docurama.eu)

- [ ] DNS: apex, `www` → apex redirect, `app.`, `docs.`, `verify.`, `status.`, `security.`, `mta-sts.` (+ `sign.`, `mail.`, `api.`, `admin.`), all resolving; MX/SPF/DKIM/DMARC/MTA-STS/TLS-RPT/CAA published.
- [ ] TLS certs valid on every host (auto-renew on).
- [ ] Database deployment selected and restore-tested. SQLite is the single-node default. **PostgreSQL is now supported**: build with `DB_PROVIDER=postgresql`, which generates the provider-specific Prisma client (`scripts/schema-for.mjs`); CI's `postgres` job boots the app against PostgreSQL 16 and runs the HTTP and browser suites, so runtime evidence exists beyond the schema check. See `DEPLOYMENT.md` §2.1. Restore-testing is still outstanding, and PostgreSQL alone does not permit multi-replica — see the worker note in §3 below.
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
- [ ] Replica policy: single replica for the SQLite image. A PostgreSQL build (`DB_PROVIDER=postgresql`) is validated at runtime in CI, but multi-replica **still requires worker coordination** — mail and webhook retries run in-process, so exactly one replica may have `DOCURAMA_WORKER` enabled. Externalising or leader-electing that worker is the remaining blocker to horizontal scale.
- [ ] Initial administrator provisioned offline per `INSTALLATION-BOOTSTRAP.md`; first tenant created and company domain verified. Configure **tenant-owned SSO** per `SSO.md`, then complete a real IdP login/replay/2FA acceptance test. Platform-wide SSO connections are rejected.
- [ ] `EVIDENCE_PORTAL_URL` set if pushing attestations to the central verification portal (or run the portal locally).
- [ ] **Backup + restore drill completed on the cluster** (PVC snapshots or `scripts/backup.sh` in a CronJob); RPO/RTO documented.
- [ ] Network segmentation: admin/portal ingress rules, egress allow-list for TSA + IdP + SMTP + S3.

## 6. Launch day

Smoke test, in order, on production:

1. SaaS with public registration enabled: signup, verification mail received, onboarding complete. Dedicated selfhost/private_cloud: initialize the schema, provision the administrator offline per `INSTALLATION-BOOTSTRAP.md`, authenticate, create the first organization, then accept a mailbox-bound invitation. Uninvited signup must remain denied; never seed demo accounts.
2. First envelope: upload/send → signer link opens (public signer portal) → sign → **seal**.
3. Verify: public portal (`verify.<root>`) shows **VERIFIED** + SHA-256 digest + signers.
4. Evidence pack export opens offline and validates its digest/attestation chain. Independently validate the completed PDF, TSA response and certificate chain before any PAdES/RFC 3161 assertion; metadata labels alone are insufficient.
5. `/status` green; `/api/health` 200.

Support inboxes staffed: **support@, sales@, billing@, privacy@, security@, abuse@, postmaster@** (plus notifications@ sender monitored for bounces).

## 7. Post-launch (first two weeks)

- [ ] Watch the **PAST_DUE queue** daily (admin Billing) — dunning mails flowing, retry-payment only after settled invoices.
- [ ] Watch outbox **FAILED** rows (terminal after 5 attempts in this edition) and mail latency. `SENT` records SMTP acceptance, not recipient inbox delivery.
- [ ] Watch **webhook delivery failures** (`checks.webhooks.failing`, delivery log; 1 m/5 m/15 m/30 m retry schedule).
- [ ] Confirm pinned transparency checkpoint identity and historical consistency. For SaaS with approved Rekor witnessing enabled, verify witnessing stays current. The AWS Private Cloud blueprint requires `REKOR_WITNESS=off`; do not enable public witnessing merely to make a health check green.
- [ ] Error-rate review: server logs for 5xx, admin Ops Health trends, security-event feed for anomalies.
- [ ] Retro at day 14: pricing funnel, incident count, checklist corrections folded back into this document.

Operator acceptance for this candidate remains pending: explicit consent and current session/MFA policy, mailbox-bound recipient access, historical snapshot review/reissue, and independently verified completed document/evidence downloads. Stronger authentication or signature policies must fail closed when unsupported. PAdES, RFC 3161/TSA and Part 11 claims require their own applicable implementation and validation evidence.
