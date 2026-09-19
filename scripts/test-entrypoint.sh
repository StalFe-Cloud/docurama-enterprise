#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf -- "$SCRATCH"' EXIT
cat > "$SCRATCH/bunx" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" > "$STARTUP_ARGS"
exit "${SCHEMA_RESULT:-0}"
MOCK
cat > "$SCRATCH/application" <<'MOCK'
#!/usr/bin/env bash
touch "$APP_STARTED"
MOCK
chmod +x "$SCRATCH/bunx" "$SCRATCH/application"
export PATH="$SCRATCH:$PATH" STARTUP_ARGS="$SCRATCH/args" APP_STARTED="$SCRATCH/started"
export SCHEMA_RESULT=1
if sh "$ROOT/docker-entrypoint.sh" application; then echo 'Failed schema unexpectedly allowed startup' >&2; exit 1; fi
test ! -e "$APP_STARTED"
if grep -q -- '--accept-data-loss' "$STARTUP_ARGS"; then echo 'Destructive schema flag detected' >&2; exit 1; fi
export SCHEMA_RESULT=0
sh "$ROOT/docker-entrypoint.sh" application
test -e "$APP_STARTED"
rm "$APP_STARTED"
export SCHEMA_RESULT=1 DOCURAMA_SKIP_DB_PUSH=1
sh "$ROOT/docker-entrypoint.sh" application
test -e "$APP_STARTED"
echo 'Startup policy: schema failure blocks boot; safe push and explicit migration skip pass.'
