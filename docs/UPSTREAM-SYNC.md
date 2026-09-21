# Enterprise application synchronization provenance

Prepared 2026-09-19 for the reviewed application port. PR #1 merged into Enterprise `quality`, then `main` was fast-forwarded to the same result at the user's instruction. Only `main` and `quality` are retained as branches. The reviewed source is preserved at tag `archive/2026-09-19/reconcile-release-hardening`. No installation was deployed.

## Source and destination

| Reference | Commit |
|---|---|
| Enterprise starting `origin/main` | `393dbbd93abc7f21bc028e8f866f01f6114d7728` |
| Enterprise existing `origin/quality` | `242724e` (seven commits behind that main) |
| Docurama comparison base `origin/main` | `d1912f9c48e54738f98c39f3ff62de4168249cde` |
| Initial integrated application snapshot | `a7f88c4322ea478e6571938f7569121e8e742800` |
| Hardened Docurama application snapshot | `d023128d4da899b59a5e95d2ddb433845a6e6e2b` |
| Final Docurama source, including Markdown/browser follow-up | `4303be8f79be79e0461ed5a0be2389487c3ef316` |

The repositories have unrelated Git histories. Enterprise's `upstream` remote points to the local Docurama checkout; the source objects and immutable commit were verified. This was an explicit source port, without an unrelated-history merge. Starting at Enterprise main retains its seven main-only fixes when reviewed against quality.

Only shared paths changed between the Docurama comparison base and integrated source were ported: `src`, `prisma`, `e2e`, `content`, `messages`, shared `docs`, `scripts`, `.github`, `package.json`, `bun.lock`, `Dockerfile`, `docker-entrypoint.sh`, `.dockerignore`, `.env.example`, `.gitattributes`, and `next.config.ts`. Existing shared source matched the comparison base apart from file modes/line endings; Docker comment/blank-line differences were reviewed.

Enterprise `docker-compose.yml`, deployment directories/configuration and `db/custom.db` were retained. The edition-specific `README.md` and `ENTERPRISE-SELFHOST.md` were updated in place: corrected registration/domain claims, removed fixture-password deployment guidance, and explained administrator bootstrap, runtime storage, schema updates, provider/air-gap limits and rollback. The retained database SHA-256 is:

```text
1651189053fae5316b7e5199952034e5c35a9c83ab442cdf75fcc0b1d80c2a96
```

## Application behavior

- Real, expiring/revocable sessions replace raw-user-ID authentication. New password records use versioned, salted scrypt; legacy SHA-256 records migrate on a successful complete password login without resetting sessions or password age. Corporate membership waits for mailbox proof; disabled memberships cannot be reactivated by verification/invitation flows.
- Dedicated modes reject public registration and additional tenant creation. An offline command provisions the first administrator only on an empty installation. Valid invitations remain available.
- SSO requires verified tenant domain ownership, restricts privileged/foreign account linking, enforces strict verified-email claims and seat capacity, and consumes one-time state. SAML correlates signed assertions with the original request and supports the cross-site POST cookie.
- Signup and enterprise-lead forms produce Turnstile tokens and use the correct verification contract. External integrations remain opt-in.
- Pricing follows main: Solo €12/30 envelopes, Starter €29/100, Business €79/250, Enterprise €349/5000, with 20% annual discount. Quota, reserved-seat, API entitlement and renewal guards are included; the old Smart proposal is not adopted.
- Images carry content/bootstrap assets and fail closed on startup schema errors. The team seed and blog/pricing regression flows are synchronized. Payment activation and renewal use transactional replay guards, paid-event gating and actual service periods.

## Follow-up fixes and test isolation

The final source includes the 27-file follow-up from the initial snapshot: strict OIDC verification, JIT capacity, password storage/migration, payment replay/order handling, Windows CRLF blog frontmatter parsing, production image/bootstrap checks and corrected rollout documentation. `e2e/billing.test.ts` creates a fresh temporary schema and explicit owner/tenant fixtures instead of copying Enterprise's committed database. Payment environment state is cleared before using its local Stripe stub. This test-isolation adjustment was contributed back to Docurama and is included in the final source commit above.

The final five-file follow-up enables GFM in the shared Markdown renderer so blog/documentation tables produce semantic table headers and cells, adds a rendering regression, and corrects the blog browser flow's full article heading and return-link scrolling. Its source commit is `4303be8`. The corrected blog flow passed a native Maestro 2.10.0 run against the base application's scratch database, including the Business table row and navigation back to the index.

## Validation

Dependencies were installed with the frozen lockfile. Prisma client generation, full TypeScript and ESLint checks passed. Generation does not update the retained database. Security/provider suites run as separate processes with their own scratch schemas:

Local isolated validation: **89 tests passed, 461 assertions, zero failures**, covering authentication (11), passwords (9), quota (6), SSO (23), bot protection (10), payment events (23), blog (4) and storage configuration (3). The blog tests were rerun after the GFM follow-up; the unchanged security suites retain their earlier results. `scripts/test-entrypoint.sh` also passed its schema-failure, success and explicit-skip cases. Shared source, schema, tests, content, scripts and configuration were compared against `4303be8` with no content differences after normalizing line endings. The retained database hash remained unchanged.

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
bun --no-env-file test e2e/auth-security.test.ts
bun --no-env-file test e2e/password-security.test.ts
bun --no-env-file test e2e/quota-security.test.ts
bun --no-env-file test e2e/sso.test.ts
bun --no-env-file test e2e/bot-guard.test.ts
bun --no-env-file test e2e/billing.test.ts
bun --no-env-file test e2e/blog.test.ts e2e/storage-config.test.ts
```

Enterprise [CI run 35450255485](https://github.com/StalFe-Cloud/docurama-enterprise/actions/runs/35450255485) passed at final application source `e870d7d6d46fc3ef57ab9a94bdff73a9b7a767fb`: 214 automated tests with 1063 assertions, all 29 Maestro browser flows, production-image build and fresh-container health/blog/bootstrap checks, and PostgreSQL schema portability. The merge tree was verified identical to this tested source; subsequent provenance corrections change documentation only. Real external IdP/Cloudflare browser validation, SMTP/payment activation, customer installation, independent PDF validation and restore drill remain gates until separately recorded. No live deployment or data migration is part of this port.

---

# Upstream quality-hardening port — 2026-09-21

Prepared 2026-09-21. Synchronizes Enterprise `main` with Docurama `quality` at `34086af`, the release line validated end-to-end locally on Windows (SQLite e2e including browser and SeaweedFS suites, PostgreSQL tier via Docker, production image build/boot/bootstrap) after upstream CI became unavailable (GitHub Actions billing block — no step ever ran on upstream runs after 2026-09-20 18:16 UTC).

## Source and method

| Reference | Commit |
|---|---|
| Comparison base (2026-09-19 port source) | `4303be8` |
| Upstream source (Docurama `quality`) | `34086af` |
| Enterprise starting `main` | `dd141e8` |

The repositories still have unrelated Git histories, so the port is a three-way file merge (base `4303be8`, ours = Enterprise, theirs = `34086af`) over the shared paths, with line endings normalized (Enterprise working trees are CRLF; upstream blobs are LF — unnormalized merges conflict on every line). 75 shared-path files changed only upstream and were taken verbatim; 15 files modified on both sides merged cleanly (`package.json` resolved identical to upstream — the Enterprise delta was line endings only); Enterprise-retained paths were not touched: `docker-compose.yml`, `db/custom.db` (SHA-256 unchanged: `1651189053fae5316b7e5199952034e5c35a9c83ab442cdf75fcc0b1d80c2a96`), `README.md`, `ENTERPRISE-SELFHOST.md`, `deploy/`, `Caddyfile`, `tessdata/`, `upload/`, `download/`, `skills/`, `worklog.md`. Upstream's Maestro→Playwright migration deleted `e2e/flows/*.yaml`; Enterprise retains the Maestro flows and its flows-based CI, so those deletions were not ported.

## What the port brings

- Versioned Prisma migrations (`0_release_baseline` + `20260920_quality_hardening`, SQLite and PostgreSQL trees, `release-20260920.prisma` baseline) replacing boot-time `db push` in the entrypoint, with the startup policy the entrypoint now enforces (schema failure blocks boot; explicit skip available).
- Delivery and billing hardening: transactional webhook outbox with fenced leases and stable delivery identities, SSRF-pinned webhook transport (`safe-webhook-http.ts`), atomic quota reservation and independent UTC monthly rollover (`monthly-period.ts`), mail outbox leasing with attempt budgets (`claimToken`), bounded DB-transaction admission (`transaction-gate.ts`), worker-loop shutdown fencing, versioned async password hashing, request-metadata audit identity.
- Test/CI parity from the upstream release line: release-verification and webhook-network workflows, remediation workflows, the verification evidence doc, `e2e/run.sh` self-sufficiency fixes (private-webhook fixture flag, fixture-db schema sync) and the Windows-capable SeaweedFS suite.

## Validation

`bun install --frozen-lockfile`, `prisma generate`, `tsc --noEmit` and `eslint .` all pass; `scripts/test-entrypoint.sh` passes all three policy cases. Isolated suites, each in its own process against scratch schemas, **91/91 passing**: authentication (11), passwords (9), quota (6), SSO (25), bot protection (10), payment events (23), blog + storage configuration (7). The retained database hash is unchanged. As with the upstream line, GitHub Actions could not validate this port (billing block); the recorded validation is local. No installation was redeployed as part of this sync.
