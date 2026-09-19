#!/bin/sh
# Docurama container entrypoint.
#
# Applies only schema changes Prisma can execute without accepting data
# loss, then starts the application. Any schema/connectivity failure stops
# startup. Destructive migrations require a separate reviewed procedure.
#
# Env knobs:
#   DOCURAMA_SKIP_DB_PUSH=1   skip the schema push (external migration step,
#                             e.g. a dedicated init container or Helm hook)
set -e

if [ "${DOCURAMA_SKIP_DB_PUSH:-0}" != "1" ]; then
  echo "[entrypoint] applying additive schema changes (prisma db push)…"
  if bunx prisma db push --skip-generate 2>&1; then
    echo "[entrypoint] schema is up to date"
  else
    echo "[entrypoint] ERROR: schema update failed; refusing to start" >&2
    exit 1
  fi
fi

exec "$@"
