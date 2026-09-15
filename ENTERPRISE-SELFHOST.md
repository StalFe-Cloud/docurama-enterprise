# Docurama Enterprise — Self-Hosted & On-Premises Edition

**Target Environment:** Customer Data Centers · Air-Gapped Networks · Private Clouds · `docurama.stalfe.com`

---

## 1. Overview & Architecture

Docurama Enterprise is the self-hosted, sovereign edition of Docurama. It enables enterprises to execute cryptographic electronic signatures, timestamping (RFC 3161), and audit verification entirely within their own perimeter.

- **Zero External Telemetry:** No tracking scripts, analytics, or third-party pings.
- **Air-Gapped Ready:** Self-hosted Geist typography, embedded WebAssembly OCR models (fra, eng), and bundled static assets.
- **Data Sovereignty:** All documents, hashes, logs, and signature manifestations stay inside your local filesystem and database.
- **BYOK (Bring Your Own Key):** Direct mounting of corporate X.509 PKCS#12 signing certs, HSM endpoints, or internal enterprise Sub-CAs.
- **Port:** Default host mapping `:3003` (configurable via `PORT_HOST`).

---

## 2. Quickstart (Docker Compose)

```bash
# 1. Clone or unpack the release
cd /opt/docurama-enterprise

# 2. Configure environment
cp .env.example .env

# 3. Launch isolated enterprise stack
docker compose up -d

# 4. Access console
open http://localhost:3003
```

---

## 3. Configuration Variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:/app/db/custom.db` | Path to persistent SQLite database |
| `STORAGE_DIR` | `/app/storage` | Path to persistent PDF artifact storage |
| `DOCURAMA_DEPLOYMENT_MODE` | `selfhost` | Operates in single-tenant sovereign mode |
| `DOCURAMA_PUBLIC_REGISTRATION` | `false` | Disables public registration (invite / SSO only) |
| `PORT_HOST` | `3003` | Exposed host port |

---

## 4. Backup & Disaster Recovery

Backups can be taken while the service is running:

```bash
# SQLite backup (safe live snapshot)
docker exec docurama-enterprise sqlite3 /app/db/custom.db ".backup '/app/storage/backup-custom.db'"

# Archive data & storage
tar -czf docurama-enterprise-backup.tar.gz db/ storage/
```
