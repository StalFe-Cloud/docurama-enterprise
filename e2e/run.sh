#!/usr/bin/env bash
# Always owns a unique scratch database and a dedicated loopback server.
# Explicit disposable CI PostgreSQL mode is validated by run-isolated.mjs.
set -euo pipefail
unset NODE_OPTIONS BUN_OPTIONS
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$ROOT/e2e/run-isolated.mjs"
