#!/bin/sh
# Only reviewed migrations. Never reset, db-push, or auto-baseline production.
set -eu
PROVIDER="${DOCURAMA_DB_PROVIDER:-sqlite}"
case "$PROVIDER" in sqlite|postgresql) ;; *) echo "Invalid database provider" >&2; exit 1 ;; esac
SCHEMA="prisma/$PROVIDER/schema.prisma"
if [ "${DOCURAMA_SKIP_MIGRATIONS:-${DOCURAMA_SKIP_DB_PUSH:-0}}" != "1" ]; then
  if [ ! -f "$SCHEMA" ]; then echo "Missing provider schema: $SCHEMA" >&2; exit 1; fi
  echo "[entrypoint] applying reviewed $PROVIDER migrations"
  if bunx prisma migrate deploy --schema "$SCHEMA"; then
    echo "[entrypoint] migrations applied"
  else
    echo "[entrypoint] ERROR: migration failed; refusing to start" >&2
    exit 1
  fi
fi
exec "$@"
