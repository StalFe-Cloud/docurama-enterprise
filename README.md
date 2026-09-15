# Docurama — Enterprise e-Signature Portal

Docurama SAS — 1 Rue Marguerin, 75014 Paris, France · EU data residency · PAdES sealing with RFC 3161 trusted timestamps.

Dual-experience portal (Next.js 16 · Prisma · SQLite):

- **Workspace** (`/`): Home, Documents, Templates, Verify, Settings
- **Settings** (`/settings/*`): Account (organizations, DNS domain verification, access security, 21 CFR Part 11), Profile (signatures & initials, TOTP 2FA), Users, eSign (X.509/PKCS#12 certificates, TSA, preferences), Notifications (SMTP, completion alerts, reminder jobs), SMS (gateway + 14 providers incl. WhatsApp), API (keys, quickstart, reference), MCP (Model Context Protocol server)
- **Platform console** (`/admin/*`): 13 sections — Overview, Tenants, Users, Envelopes, Domains, Legal & DSAR, Compliance, Billing, API & Webhooks, Email & DNS provisioning, Platform Settings, Ops Health, Audit Log

## Quickstart (from this repository)

```bash
cp .env.example .env                  # set DATABASE_URL (absolute SQLite path)
bun install
bunx prisma generate
bunx prisma db push
bun run build
bun run start                         # http://localhost:3000
```

Demo accounts (QA data): `admin@docurama.eu` / `admin1234` (platform admin) · `alex@northwind.example` / `demo1234` (workspace admin, member of two organizations).

## Documentation

| Document | Contents |
|---|---|
| [`docs/PRODUCTION-PLAN.md`](docs/PRODUCTION-PLAN.md) | Restore-from-repo runbook, incremental updates, security baseline, go-live checklist |
| [`download/docurama.eu.zone`](download/docurama.eu.zone) | BIND zone export for docurama.eu (sub-domains, MX/SPF/DKIM/DMARC/MTA-STS/CAA) |
| [`download/DOCURAMA-DNS-EMAIL-PROVISIONING.md`](download/DOCURAMA-DNS-EMAIL-PROVISIONING.md) | Email addresses, DNS records, setup runbook |

## Public API surface

- `GET /api/v1/envelopes`, `GET /api/v1/envelopes/{id}`, `GET /api/v1/templates`, `GET /api/v1/verify/{code}` — authenticated with `X-API-Key` (Settings → API)
- `POST /api/mcp` — MCP server (JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`), key-authenticated
- Interactive reference: Settings → API after signing in
