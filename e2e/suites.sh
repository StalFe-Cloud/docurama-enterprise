#!/usr/bin/env bash
# Internal suite dispatch. Use run.sh for database and server isolation.
set -euo pipefail
: ${E2E_FIXTURE_DB:?Run through e2e/run.sh}
BASE_URL="${E2E_BASE_URL:?Run through e2e/run.sh}"
if [[ "${E2E_SKIP_S3:-0}" != "1" ]]; then
  WEED_BIN="${WEED_BIN:-$(command -v weed || true)}"
  node --input-type=module -e 'import { assertS3LifecycleSafe } from "./e2e/isolation.mjs"; assertS3LifecycleSafe(process.argv[1]);' "$WEED_BIN"
fi
# ── 1b. Warm the public routes ────────────────────────────────────────────────
# In dev mode every route compiles on first hit; a flow that navigates
# straight after a cold boot can race the compiler (seen on the marketing
# CTA → /welcome). Touching the public surfaces once here removes that race
# for every flow. Non-fatal: warming only triggers compilation.
for route in / /login /welcome /modeles-de-contrats /verify /docs /sign /sign/e2e-warmup-not-a-real-token; do
  curl -s -o /dev/null --max-time 180 "$BASE_URL$route" || true
done
echo "── e2e: public routes warmed"

# ── 2. Seed the deterministic fixtures ────────────────────────────────────────
if [[ "${E2E_SKIP_SEED:-0}" != "1" ]]; then
  echo "── e2e: seeding fixtures"
  bun --no-env-file e2e/seed.ts
fi

# ── 2b. Type gate (F3: the build must never ignore type errors again) ─────────
if [[ "${E2E_SKIP_TSC:-0}" != "1" ]]; then
  echo "── e2e: type-checking (tsc --noEmit)"
  bun --no-env-file node_modules/typescript/bin/tsc --noEmit || { echo "!! tsc failed — fix type errors first"; exit 1; }
fi

# ── 2c. API-layer + evidence-layer + transparency-layer + MCP + visual suites ──
# Security tests use mocked request context and a fresh database. Keep them
# in their own process so mocks cannot affect the HTTP regression suites.
bun --no-env-file test e2e/contract-snapshot.test.ts
bun --no-env-file test e2e/final-document.test.ts
bun --no-env-file test e2e/signing-email.test.ts
bun --no-env-file test e2e/signing-email-smtp.test.ts
bun --no-env-file test e2e/mail-signing-gate.test.ts
bun --no-env-file test e2e/mail-completion-attachments.test.ts
bun --no-env-file test scripts/signing-workflow-regression.test.ts
bun --no-env-file test e2e/esign-preferences.test.ts
bun --no-env-file test --timeout 90000 e2e/retention-fixture.test.mjs
bun --no-env-file test scripts/mfa-regression.test.ts
bun --no-env-file test e2e/admin-response-security.test.ts
bun --no-env-file test e2e/admin-route-security.test.ts
bun --no-env-file test e2e/signer-policy.test.ts
bun --no-env-file test e2e/evidence-assurance.test.ts
bun --no-env-file test e2e/request-origin.test.ts
bun --no-env-file test e2e/auth-security.test.ts || { echo "!! authentication security tests failed"; exit 1; }
bun --no-env-file test e2e/password-security.test.ts || { echo "!! password security tests failed"; exit 1; }
bun --no-env-file test e2e/quota-security.test.ts || { echo "!! quota and API entitlement tests failed"; exit 1; }
bun --no-env-file test e2e/lead-conversion.test.ts || { echo "!! enterprise lead conversion tests failed"; exit 1; }
bun --no-env-file test e2e/blog.test.ts e2e/storage-config.test.ts || { echo "!! content/storage tests failed"; exit 1; }
if [[ "${E2E_SKIP_API:-0}" != "1" ]]; then
  echo "── e2e: API-layer + evidence-layer + transparency-layer + MCP + visual tests"
  E2E_BASE_URL="$BASE_URL" bun --no-env-file test e2e/api.test.ts e2e/evidence.test.ts e2e/transparency.test.ts e2e/rekor.test.ts e2e/plans.test.ts e2e/webhooks.test.ts || { echo "!! API/evidence/transparency/plans/webhooks tests failed"; exit 1; }
  # Performance measurements follow completed HTTP load in their own process.
  echo "e2e: visual regression and fresh-client LCP gate (separate phase)"
  E2E_BASE_URL="$BASE_URL" bun --no-env-file test e2e/visual.test.ts || { echo "!! visual regression/LCP tests failed"; exit 1; }
fi

# ── 2c-bis. MCP server (own process: the per-key rate-limit test needs a
#         deterministic bucket state, which parallel sibling files disturb) ──
  E2E_BASE_URL="$BASE_URL" bun --no-env-file test e2e/mcp.test.ts || { echo "!! MCP server tests failed"; exit 1; }

# ── 2d. Mail delivery engine (own process: it owns DATABASE_URL + SMTP_URL) ───
if [[ "${E2E_SKIP_MAIL:-0}" != "1" ]]; then
  echo "── e2e: mail delivery engine (fake SMTP relay)"
  bun --no-env-file test e2e/mail.test.ts || { echo "!! mail delivery tests failed"; exit 1; }
fi

# ── 2d-bis. Payment rails (own process: it owns PAYMENT_PROVIDER + STRIPE_*
#        env and runs a stub Stripe API in-process). ──────────────────────────
if [[ "${E2E_SKIP_BILLING:-0}" != "1" ]]; then
  echo "── e2e: payment rails (manual mode + stub Stripe + signed webhooks)"
  bun --no-env-file test e2e/billing.test.ts || { echo "!! payment rails tests failed"; exit 1; }
fi

# ── 2d-ter. SSO (own process: it owns SSO_TXN_SECRET, spawns a stub OIDC
#        provider and openssl-generates a SAML IdP keypair). ──────────────────
if [[ "${E2E_SKIP_SSO:-0}" != "1" ]]; then
  echo "── e2e: SSO (stub OIDC provider + samlify round-trip)"
  bun --no-env-file test e2e/sso.test.ts || { echo "!! SSO tests failed"; exit 1; }
fi

# ── 2d-quater. Bot guard (own process: it owns NEXT_PUBLIC_DEMO_MODE +
#        TURNSTILE_* env). ────────────────────────────────────────────────────
if [[ "${E2E_SKIP_BOTGUARD:-0}" != "1" ]]; then
  echo "── e2e: bot guard (honeypot, time trap, Turnstile stub)"
  bun --no-env-file test e2e/bot-guard.test.ts || { echo "!! bot guard tests failed"; exit 1; }
fi

# ── 2e. S3 storage backend (own process: spawns a REAL SeaweedFS `weed
#        server -s3` on scratch ports). Requires the weed binary — skipped
#        honestly when absent so CI without it stays green.
#        E2E_SKIP_S3=1 force-off · WEED_BIN=/path/to/weed to point at one. ──
if [[ "${E2E_SKIP_S3:-0}" != "1" ]]; then
  WEED_BIN="${WEED_BIN:-$(command -v weed || true)}"
  if [[ -n "$WEED_BIN" ]]; then
    echo "── e2e: S3 storage backend (real SeaweedFS: $WEED_BIN)"
    S3_E2E=1 WEED_BIN="$WEED_BIN" bun --no-env-file test e2e/s3-seaweed.test.ts || { echo "!! S3 storage tests failed"; exit 1; }
  else
    echo "── e2e: S3 storage suite skipped (no weed binary on PATH; set WEED_BIN to enable)"
  fi
fi

# ── 3. Browser suites (Playwright) ────────────────────────────────────────────
# The critical user journeys, driven through Chromium via Playwright. These
# replaced a Maestro flow runner (e2e/flows/*.yaml): Maestro drove its own
# bundled browser over CDP and flaked on roughly one flow per CI run, a
# different one each time, while these ran green. See e2e/browser/harness.ts.
if [[ "${E2E_SKIP_BROWSER:-0}" != "1" ]]; then
  echo "── e2e: browser suites (Playwright)"
  E2E_BASE_URL="$BASE_URL" bun --no-env-file test e2e/browser/ || { echo "!! browser suites failed"; exit 1; }
fi

echo ""
echo "────────────────────────────────────────────"
echo "E2E: all suites passed"
