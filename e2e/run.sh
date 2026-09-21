#!/usr/bin/env bash
# Docurama E2E runner — one command to a green (or red) suite.
#
#   bash e2e/run.sh    # everything, against a local dev server
#
# To run one browser suite directly (server must already be up):
#   E2E_BASE_URL=http://127.0.0.1:3000 bun test e2e/browser/public.test.ts
#
# Environment:
#   E2E_BASE_URL       target origin (default http://127.0.0.1:3000)
#   E2E_SKIP_SEED=1    skip the seed step (the suites need it for fixtures)
#   E2E_START_SERVER=0 don't boot/stop a dev server (CI or remote targets)
#   E2E_SKIP_BROWSER=1 skip the Playwright browser suites (no Chromium)
#   E2E_SKIP_VISUAL=1  skip the visual-regression file (no Chromium available)
#   CHROME_BIN         explicit Chromium/Chrome path for the browser suites
#   UPDATE_BASELINES=1 regenerate (don't compare) the visual baselines
#
# Exit code: 0 iff every suite passed.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:3000}"

# CI exports this at the job level; a bare local `bash e2e/run.sh` needs it
# too, or the loopback webhook fixtures are blocked by the SSRF guard
# (observed as delivered=0 / statusCode=0 in webhooks.test.ts).
export DOCURAMA_ALLOW_PRIVATE_WEBHOOKS="${DOCURAMA_ALLOW_PRIVATE_WEBHOOKS:-1}"

# ── 0. Sanity + isolation: the suite runs on a COPY of the committed db. ─────
# CI's e2e job pushes the schema onto db/custom.db before invoking this
# script; do the same here so a fresh clone runs green without that step —
# mail.test.ts copies db/custom.db directly and the seed needs current
# columns (e.g. EnterpriseLead.companyLower, MailOutbox.claimToken).
# Pinned to the fixture via the schema-relative path the tests also use, so
# an ambient DATABASE_URL can't redirect the push.
DATABASE_URL="file:../db/custom.db" bunx prisma db push --accept-data-loss --skip-generate > /dev/null
# A globally exported DATABASE_URL silently overrides .env and every DB route
# 500s (found the hard way). Beyond pinning, the suite writes a LOT (events,
# seals, seed cycles) — writing to db/custom.db INSIDE the repo makes
# Turbopack's dev watcher recompile routes mid-suite, which can tear down an
# in-flight page's hydration (observed as a dead /sign page ~20 flows in on
# 2-CPU runners). A db outside the tree is invisible to the watcher, and the
# committed demo/fixture db stays pristine.
#
#   E2E_DATABASE_URL set        → that target, verbatim (CI / custom setups)
#   foreign dev server running  → the repo db it was booted with
#   otherwise (normal case)     → fresh /tmp copy of the committed db
SERVER_ALREADY_UP=0
curl -sf -o /dev/null "$BASE_URL/login" 2>/dev/null && SERVER_ALREADY_UP=1
if [[ -n "${E2E_DATABASE_URL:-}" ]]; then
  export DATABASE_URL="$E2E_DATABASE_URL"
elif [[ "$SERVER_ALREADY_UP" == "1" ]]; then
  export DATABASE_URL="file:$ROOT/db/custom.db"
else
  E2E_DB_COPY="/tmp/docurama-e2e.db"
  cp -f "$ROOT/db/custom.db" "$E2E_DB_COPY"
  export DATABASE_URL="file:$E2E_DB_COPY"
fi
echo "── e2e: DATABASE_URL=$DATABASE_URL (server ${SERVER_ALREADY_UP:+already}up: $SERVER_ALREADY_UP)"

# ── 1. Dev server: reuse a running one, or boot a fresh instance ─────────────
SERVER_PID=""
if [[ "${E2E_START_SERVER:-1}" == "1" ]]; then
  if [[ "$SERVER_ALREADY_UP" == "1" ]]; then
    echo "── e2e: dev server already answering at $BASE_URL — reusing it"
  else
    echo "── e2e: no server at $BASE_URL — starting one"
    # Hermetic: the suite's server never egresses to the real Rekor log
    # (the lazy checkpoint witness would otherwise depend on external
    # reachability and leak test keys into the public log). rekor.test.ts
    # drives the witness code paths in-process against a local mock.
    # DEMO_MODE is forced on: login-demo.yaml drives the demo buttons, and
    # .env.example now ships the safe production default (false).
    # The background worker is off: retry passes (mail, webhooks) are driven
    # explicitly by webhooks.test.ts / mail.test.ts — no 30s-timer races.
    REKOR_WITNESS="${E2E_REKOR_WITNESS:-off}" \
      NEXT_PUBLIC_DEMO_MODE="${E2E_DEMO_MODE:-true}" \
      DOCURAMA_WORKER="${E2E_DOCURAMA_WORKER:-off}" \
      DOCURAMA_ALLOW_PRIVATE_WEBHOOKS="1" \
      bun run dev > /tmp/docurama-e2e-dev.log 2>&1 &
    SERVER_PID=$!
    for i in $(seq 1 60); do
      if curl -sf -o /dev/null "$BASE_URL/login"; then break; fi
      if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "!! dev server died — see /tmp/docurama-e2e-dev.log"; exit 1
      fi
      sleep 2
    done
    curl -sf -o /dev/null "$BASE_URL/login" || { echo "!! dev server never came up"; exit 1; }
    echo "── e2e: dev server ready at $BASE_URL"
  fi
fi

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "── e2e: stopping dev server"
    # Kill the whole tree, not just the `bun run dev` wrapper: the next-server
    # child survives the wrapper and holds :3000, which a later run then
    # reuses/hits with a stale database binding (observed as phantom MCP/rekor
    # failures across consecutive runs on a busy host).
    pkill -TERM -P "$SERVER_PID" 2>/dev/null || true
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    pkill -KILL -P "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

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
  bun e2e/seed.ts
fi

# ── 2b. Type gate (F3: the build must never ignore type errors again) ─────────
if [[ "${E2E_SKIP_TSC:-0}" != "1" ]]; then
  echo "── e2e: type-checking (tsc --noEmit)"
  bunx tsc --noEmit || { echo "!! tsc failed — fix type errors first"; exit 1; }
fi

# ── 2c. API-layer + evidence-layer + transparency-layer + MCP + visual suites ──
# Security tests use mocked request context and a fresh database. Keep them
# in their own process so mocks cannot affect the HTTP regression suites.
bun test e2e/auth-security.test.ts || { echo "!! authentication security tests failed"; exit 1; }
bun test e2e/password-security.test.ts || { echo "!! password security tests failed"; exit 1; }
bun test e2e/quota-security.test.ts || { echo "!! quota and API entitlement tests failed"; exit 1; }
bun test e2e/lead-conversion.test.ts || { echo "!! enterprise lead conversion tests failed"; exit 1; }
bun test e2e/blog.test.ts e2e/storage-config.test.ts || { echo "!! content/storage tests failed"; exit 1; }
if [[ "${E2E_SKIP_API:-0}" != "1" ]]; then
  echo "── e2e: API-layer + evidence-layer + transparency-layer + MCP + visual tests"
  E2E_BASE_URL="$BASE_URL" bun test e2e/api.test.ts e2e/evidence.test.ts e2e/transparency.test.ts e2e/rekor.test.ts e2e/plans.test.ts e2e/webhooks.test.ts e2e/visual.test.ts || { echo "!! API/evidence/transparency/plans/webhooks/visual tests failed"; exit 1; }
fi

# ── 2c-bis. MCP server (own process: the per-key rate-limit test needs a
#         deterministic bucket state, which parallel sibling files disturb) ──
  E2E_BASE_URL="$BASE_URL" bun test e2e/mcp.test.ts || { echo "!! MCP server tests failed"; exit 1; }

# ── 2d. Mail delivery engine (own process: it owns DATABASE_URL + SMTP_URL) ───
if [[ "${E2E_SKIP_MAIL:-0}" != "1" ]]; then
  echo "── e2e: mail delivery engine (fake SMTP relay)"
  bun test e2e/mail.test.ts || { echo "!! mail delivery tests failed"; exit 1; }
fi

# ── 2d-bis. Payment rails (own process: it owns PAYMENT_PROVIDER + STRIPE_*
#        env and runs a stub Stripe API in-process). ──────────────────────────
if [[ "${E2E_SKIP_BILLING:-0}" != "1" ]]; then
  echo "── e2e: payment rails (manual mode + stub Stripe + signed webhooks)"
  bun test e2e/billing.test.ts || { echo "!! payment rails tests failed"; exit 1; }
fi

# ── 2d-ter. SSO (own process: it owns SSO_TXN_SECRET, spawns a stub OIDC
#        provider and openssl-generates a SAML IdP keypair). ──────────────────
if [[ "${E2E_SKIP_SSO:-0}" != "1" ]]; then
  echo "── e2e: SSO (stub OIDC provider + samlify round-trip)"
  bun test e2e/sso.test.ts || { echo "!! SSO tests failed"; exit 1; }
fi

# ── 2d-quater. Bot guard (own process: it owns NEXT_PUBLIC_DEMO_MODE +
#        TURNSTILE_* env). ────────────────────────────────────────────────────
if [[ "${E2E_SKIP_BOTGUARD:-0}" != "1" ]]; then
  echo "── e2e: bot guard (honeypot, time trap, Turnstile stub)"
  bun test e2e/bot-guard.test.ts || { echo "!! bot guard tests failed"; exit 1; }
fi

# ── 2e. S3 storage backend (own process: spawns a REAL SeaweedFS `weed
#        server -s3` on scratch ports). Requires the weed binary — skipped
#        honestly when absent so CI without it stays green.
#        E2E_SKIP_S3=1 force-off · WEED_BIN=/path/to/weed to point at one. ──
if [[ "${E2E_SKIP_S3:-0}" != "1" ]]; then
  WEED_BIN="${WEED_BIN:-$(command -v weed || true)}"
  if [[ -n "$WEED_BIN" ]]; then
    echo "── e2e: S3 storage backend (real SeaweedFS: $WEED_BIN)"
    S3_E2E=1 WEED_BIN="$WEED_BIN" bun test e2e/s3-seaweed.test.ts || { echo "!! S3 storage tests failed"; exit 1; }
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
  E2E_BASE_URL="$BASE_URL" bun test e2e/browser/ || { echo "!! browser suites failed"; exit 1; }
fi

echo ""
echo "────────────────────────────────────────────"
echo "E2E: all suites passed"
