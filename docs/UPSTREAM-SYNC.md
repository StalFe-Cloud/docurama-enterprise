# Enterprise application synchronization provenance

Prepared 2026-09-19 for `codex/reconcile-release-hardening`, proposed as a draft pull request to Enterprise `quality`. This source port does not promote `main` or deploy an installation.

## Source and destination

| Reference | Commit |
|---|---|
| Enterprise starting `origin/main` | `393dbbd93abc7f21bc028e8f866f01f6114d7728` |
| Enterprise existing `origin/quality` | `242724e` (seven commits behind that main) |
| Docurama comparison base `origin/main` | `d1912f9c48e54738f98c39f3ff62de4168249cde` |
| Initial integrated application snapshot | `a7f88c4322ea478e6571938f7569121e8e742800` |
| Final integrated Docurama application source | `d023128d4da899b59a5e95d2ddb433845a6e6e2b` |

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

## Validation

Dependencies were installed with the frozen lockfile. Prisma client generation, full TypeScript and ESLint checks passed. Generation does not update the retained database. Security/provider suites run as separate processes with their own scratch schemas:

Final local run: **88 tests passed, 557 assertions, zero failures**, covering authentication (11), passwords (9), quota (6), SSO (23), bot protection (10), payment events (23), blog (3) and storage configuration (3). `scripts/test-entrypoint.sh` also passed its schema-failure, success and explicit-skip cases. Shared source, schema, tests, content, scripts and configuration were compared against `d023128` with no content differences after normalizing line endings. The retained database hash remained unchanged.

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

CI and release-gate results are reported on the draft PR. A production-image build, real external IdP/Cloudflare browser validation, SMTP/payment activation, customer installation, independent PDF validation and restore drill remain gates until separately recorded. No live deployment or data migration is part of this port.
