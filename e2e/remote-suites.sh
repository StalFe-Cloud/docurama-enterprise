#!/usr/bin/env bash
# Owned CI PostgreSQL HTTP/browser tier only. SQLite scratch suites are local.
set -euo pipefail
: "${E2E_BASE_URL:?Run through e2e/run.sh}"
: "${E2E_DATABASE_URL:?Explicit disposable CI database required}"
if [[ "${E2E_SKIP_SEED:-0}" != "1" ]]; then
  bun --no-env-file e2e/seed.ts
fi
if [[ "${E2E_SKIP_TSC:-0}" != "1" ]]; then
  bun --no-env-file node_modules/typescript/bin/tsc --noEmit
fi
for route in / /login /welcome /modeles-de-contrats /verify /docs /sign; do
  curl -s -o /dev/null --max-time 180 "$E2E_BASE_URL$route" || true
done
if [[ "${E2E_SKIP_API:-0}" != "1" ]]; then
  bun --no-env-file test e2e/api.test.ts e2e/evidence.test.ts e2e/transparency.test.ts e2e/rekor.test.ts e2e/plans.test.ts e2e/webhooks.test.ts
  bun --no-env-file test e2e/mcp.test.ts
fi
if [[ "${E2E_SKIP_BROWSER:-0}" != "1" ]]; then
  bun --no-env-file test e2e/browser/
fi
