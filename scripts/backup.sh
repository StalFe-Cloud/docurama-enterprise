#!/usr/bin/env bash
# Docurama backup — SQLite database + document tree, with retention.
#
# What it produces (under BACKUP_DIR):
#   db-YYYYmmdd-HHMMSS.sqlite      — consistent snapshot via sqlite3 .backup
#                                     (safe while the server is running; a
#                                     plain cp can catch a half-written WAL)
#   storage-YYYYmmdd-HHMMSS.tar.gz — the tenant document tree (STORAGE_DIR)
#
# Retention: files older than KEEP_DAYS are deleted (default 30).
# Off-site: set REMOTE_TARGET to rsync the backup dir after each run
#           (e.g. "backup@second-host:/var/backups/docurama").
# Encryption at rest: set GPG_RECIPIENT to encrypt each artifact
#           (decrypt with: gpg -d file.gpg > file).
#
# Cron example (03:15 nightly):
#   15 3 * * *  /opt/docurama/scripts/backup.sh >> /var/log/docurama-backup.log 2>&1
#
# Restore (PRODUCTION-PLAN §7):
#   systemctl stop docurama
#   gpg -d db-….sqlite.gpg > /opt/docurama/db/custom.db   # if encrypted
#   tar xzf storage-….tar.gz -C /opt/docurama/storage --strip-components=2
#   systemctl start docurama && curl -fsS https://app.example.com/api/health

set -euo pipefail

# ── Configuration (override via env or flags) ────────────────────────────────
APP_DIR="${APP_DIR:-/opt/docurama}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/docurama}"
KEEP_DAYS="${KEEP_DAYS:-30}"
REMOTE_TARGET="${REMOTE_TARGET:-}"
GPG_RECIPIENT="${GPG_RECIPIENT:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir) APP_DIR="$2"; shift 2 ;;
    --backup-dir) BACKUP_DIR="$2"; shift 2 ;;
    --keep-days) KEEP_DAYS="$2"; shift 2 ;;
    --remote) REMOTE_TARGET="$2"; shift 2 ;;
    --gpg) GPG_RECIPIENT="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

DB_FILE="${DATABASE_FILE:-$APP_DIR/db/custom.db}"
STORAGE_DIR="${STORAGE_DIR:-$APP_DIR/storage}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

# ── 1. Database snapshot ─────────────────────────────────────────────────────
if [[ -f "$DB_FILE" ]]; then
  echo "── backup: snapshotting $DB_FILE"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_FILE" ".backup '$BACKUP_DIR/db-$STAMP.sqlite'"
  else
    # No sqlite3 CLI: fall back to the Prisma-carried engine via the app dir,
    # else a plain copy with a clear warning (stop the app for full safety).
    echo "   WARNING: sqlite3 CLI not found — falling back to plain copy." >&2
    echo "            For guaranteed consistency, install sqlite3 or stop the app first." >&2
    cp "$DB_FILE" "$BACKUP_DIR/db-$STAMP.sqlite"
  fi
else
  echo "── backup: no database at $DB_FILE (skipped)" >&2
  exit 1
fi

# ── 2. Document tree ─────────────────────────────────────────────────────────
if [[ -d "$STORAGE_DIR" ]]; then
  echo "── backup: archiving $STORAGE_DIR"
  tar czf "$BACKUP_DIR/storage-$STAMP.tar.gz" -C "$STORAGE_DIR" .
else
  echo "── backup: no storage dir at $STORAGE_DIR (skipped)"
fi

# ── 3. Optional encryption ───────────────────────────────────────────────────
if [[ -n "$GPG_RECIPIENT" ]] && command -v gpg >/dev/null 2>&1; then
  for f in "$BACKUP_DIR/db-$STAMP.sqlite" "$BACKUP_DIR/storage-$STAMP.tar.gz"; do
    [[ -f "$f" ]] || continue
    gpg --batch --yes --recipient "$GPG_RECIPIENT" --encrypt "$f"
    rm -f "$f"
    echo "── backup: encrypted $(basename "$f").gpg"
  done
fi

# ── 4. Retention ─────────────────────────────────────────────────────────────
echo "── backup: pruning artifacts older than $KEEP_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'db-*.sqlite' -o -name 'db-*.sqlite.gpg' -o -name 'storage-*.tar.gz' -o -name 'storage-*.tar.gz.gpg' \) \
  -mtime "+$KEEP_DAYS" -delete

# ── 5. Optional off-site copy ────────────────────────────────────────────────
if [[ -n "$REMOTE_TARGET" ]]; then
  echo "── backup: rsyncing to $REMOTE_TARGET"
  rsync -a --delete "$BACKUP_DIR/" "$REMOTE_TARGET/"
fi

echo "── backup: done ($(ls -1 "$BACKUP_DIR" | wc -l) artifacts in $BACKUP_DIR)"
