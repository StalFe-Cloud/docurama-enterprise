#!/bin/sh
# Docurama container entrypoint.
#
# Applies additive schema changes (prisma db push is idempotent: additive
# columns/tables no-op when already present) and then execs the standalone
# Next.js server. The push is best-effort — if the database is unreachable
# the server itself will log the real connection error on first query, and
# /api/health will report unready, which is the signal orchestrators act on.
#
# Env knobs:
#   DOCURAMA_SKIP_DB_PUSH=1   skip the schema push (external migration step,
#                             e.g. a dedicated init container or Helm hook)
set -e

if [ "${DOCURAMA_SKIP_DB_PUSH:-0}" != "1" ]; then
  echo "[entrypoint] applying additive schema changes (prisma db push)…"
  if bunx prisma db push --skip-generate --accept-data-loss 2>&1; then
    echo "[entrypoint] schema is up to date"
  else
    echo "[entrypoint] WARNING: prisma db push failed — continuing; check DB connectivity (health endpoint will report unready)"
  fi
fi

exec "$@"
