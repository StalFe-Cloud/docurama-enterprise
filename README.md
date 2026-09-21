# Docurama Enterprise — Sovereign Self-Hosted & On-Premises Edition

**Current installation guidance:** use [ENTERPRISE-SELFHOST.md](ENTERPRISE-SELFHOST.md) and [the recorded upstream source port](docs/UPSTREAM-SYNC.md). This repository review is not a production deployment certification. Historical hostnames, infrastructure diagrams and compliance/provider descriptions below require installation-specific verification; they do not establish live service availability, air-gap isolation or PAdES conformance.

> **Docurama SAS** · 1 Rue Marguerin, 75014 Paris, France  
> **Jurisdiction:** French Republic & European Union Law · **Data Residency:** Paris, France (EU-West)  
> **Cryptographic Standards:** PAdES (ETSI EN 319 142-1/-2), RFC 3161 TSA, SHA-256, RSA-2048/4096  
> **Compliance Frameworks:** eIDAS (Regulation EU 910/2014), GDPR (Regulation EU 2016/679), FDA 21 CFR Part 11

---

## Table of Contents

1. [Executive Summary & Core Value Proposition](#1-executive-summary--core-value-proposition)
2. [Production Deployment Architecture](#2-production-deployment-architecture)
3. [Topology Overview & Network Infrastructure](#3-topology-overview--network-infrastructure)
4. [Subdomain Matrix & Routing / Redirect Architecture](#4-subdomain-matrix--routing--redirect-architecture)
5. [Account Logins & Credential Directory](#5-account-logins--credential-directory)
   - [5.1 Dedicated Enterprise: https://docurama.stalfe.com](#51-dedicated-enterprise-httpsdocuramastalfecom)
   - [5.2 Platform Administrators (Root Operators)](#52-platform-administrators-root-operators)
   - [5.3 Enterprise Tenant Accounts Directory](#53-enterprise-tenant-accounts-directory)
   - [5.4 Self-Service Password Reset System](#54-self-service-password-reset-system)
   - [5.5 Corporate Domain Auto-Enrollment & Billing Bypass](#55-corporate-domain-auto-enrollment--billing-bypass)
6. [Email System: Inboxes, Logic, Routing & Deliverability](#6-email-system-inboxes-logic-routing--deliverability)
7. [Compliance Certificates, Approvals & Policy Library](#7-compliance-certificates-approvals--policy-library)
8. [Signature Providers, Authorities & Technical Mechanics](#8-signature-providers-authorities--technical-mechanics)
9. [Deployment Tiers: Platform, Enterprise & Self-Hosted](#9-deployment-tiers-platform-enterprise--self-hosted)
10. [Recent Implementations & Platform Enhancements (v1.2.0)](#10-recent-implementations--platform-enhancements-v120)
11. [Key Decisions for Your Confirmation](#11-key-decisions-for-your-confirmation)
12. [Action Items & Operator Tasks Checklist (Tasks to Do for You)](#12-action-items--operator-tasks-checklist-tasks-to-do-for-you)
13. [Operational Runbooks & Commands](#13-operational-runbooks--commands)

---

## 1. Executive Summary & Core Value Proposition

Docurama is an EU-native, enterprise-grade electronic signature and document intelligence platform engineered specifically for organizations subject to European statutory compliance and international audit requirements.

Unlike generic signature tools that only insert rasterized signature stamps into PDFs, Docurama creates an **independently verifiable evidence chain**:
- **Signing evidence:** document digests, audit records and signed evidence attestations are implemented. Embedded PAdES profiles and independent offline PDF validation remain release gates until a completed artifact proves them.
- **Timestamp configuration:** TSA settings exist; selecting a provider does not prove an RFC 3161 token is embedded into every completed PDF.
- **Statutory French Contract Catalog:** Built-in repository of 8 statutory contracts (CDI, CDD, NDA, Bail Commercial, CGV, Prestation de services, Pacte d'associés, Accord de résiliation) draftable and signable in one click.
- **Document Intelligence (DocIntel):** Deep inspection pipeline utilizing AcroForm extraction, text layer parsing, and bilingual OCR (French & English) to automatically place signature fields, detect risk clauses, and generate audit metadata.
- **Corporate enrollment:** eligible SaaS accounts join only after mailbox verification and a current domain check. Dedicated Enterprise installations require an invitation or a trusted, verified-domain SSO connection.
- **Customer-controlled hosting:** residency and transfers depend on the operator's deployment, storage and configured providers; they are not established by this repository alone.

---

## 2. Production Deployment Architecture

Deployment targets are **Multi-Tenant Public Cloud**, **Dedicated Enterprise Cloud**, and **Self-Hosted Installation**. Air-gap behavior requires a separately validated configuration with external integrations disabled or replaced.

### Architectural Layers

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                      Client Browser                     │
                    └────────────────────────────┬────────────────────────────┘
                                                 │ HTTPS / TLS 1.3
                                                 ▼
                    ┌─────────────────────────────────────────────────────────┐
                    │               Edge Proxy (Caddy / Cloudflare)           │
                    │   - HSTS Preload (63072000s)                            │
                    │   - Automatic ACME Let's Encrypt / ZeroSSL              │
                    │   - Subdomain Hostname Routing & Vanity Redirects       │
                    └───────────┬─────────────────────────────────┬───────────┘
                                │ :3002 (Cloud)                   │ :3003 (Enterprise)
                                ▼                                 ▼
         ┌───────────────────────────────────────┐ ┌───────────────────────────────────────┐
         │         Docurama Cloud Stack          │ │      Docurama Enterprise Stack        │
         │  - Next.js 16 (Turbopack, Standalone) │ │  - Next.js 16 (Turbopack, Standalone) │
         │  - Bun 1.2+ High-Performance Runtime  │ │  - Bun 1.2+ High-Performance Runtime  │
         │  - Worker Threads (OCR & DocIntel)    │ │  - Dedicated Isolated Tenant Context  │
         └──────────────────┬────────────────────┘ └──────────────────┬────────────────────┘
                            │                                         │
                            ▼                                         ▼
         ┌───────────────────────────────────────┐ ┌───────────────────────────────────────┐
         │       SQLite WAL Engine (Cloud)       │ │     SQLite WAL Engine (Enterprise)    │
         │       db/custom.db + shadow indexes   │ │     db/custom.db (isolated storage)   │
         └───────────────────────────────────────┘ └───────────────────────────────────────┘
```

### Technology Specifications

| Component | Technology | Specification / Notes |
|---|---|---|
| **Runtime** | Bun 1.2+ / Node 22 LTS | High-throughput async execution, native worker threads |
| **Framework** | Next.js 16.1.3 (App Router) | Standalone output bundle, React 19, Server Components |
| **ORM & Database** | Prisma + SQLite (WAL mode) | `db/custom.db` with accent-folded shadow search indices (`nameLower`, `titleLower`) |
| **OCR & AI Intel** | Tesseract OCR + AcroForm Engine | Multilingual (French/English) document parsing and field classification |
| **Styling & UI** | Tailwind CSS v4 + Radix UI + shadcn | Responsive, accessible (WAI-ARIA compliant), light/dark theme |
| **Container Engine**| Docker & Docker Compose | Multi-stage scratch build, unprivileged user execution |
| **Reverse Proxy** | Caddy v2.8+ | Automatic Let's Encrypt HTTPS, HTTP/3 QUIC support |

---

## 3. Topology Overview & Network Infrastructure

### Server Fleet Topology

The primary infrastructure is hosted in Paris, France (EU-West) on dedicated, ISO 27001-certified hardware (`nexa-vps`):

| Node / Container | Internal Port | External Binding / Domain | Role |
|---|---|---|---|
| **docurama-cloud** | `3000` | `127.0.0.1:3002` → `docurama.eu`, `*.docurama.eu` | Multi-Tenant Public Cloud production instance |
| **docurama-enterprise**| `3000` | `127.0.0.1:3003` → `docurama.stalfe.com` | Dedicated Enterprise StålFe Cloud instance |
| **Caddy Ingress** | `80`, `443` | `0.0.0.0:80`, `0.0.0.0:443` | TLS 1.3 termination, reverse proxy, security headers |
| **MTA Mail Relay** | `587`, `465` | `mail.docurama.eu` | Dedicated Postfix/DKIM transactional mail submission |

### Security Headers & Edge Policy

All endpoints enforce strict enterprise security headers at the Caddy ingress layer:

```caddyfile
header {
    Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "SAMEORIGIN"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
    Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https:;"
}
```

---

## 4. Subdomain Matrix & Routing / Redirect Architecture

Docurama features a dynamic host-aware routing system managed via `src/middleware.ts`. Single-origin requests are partitioned automatically based on the incoming `Host` header:

### Subdomain Directory

| FQDN | Target Route | Purpose & Target Audience |
|---|---|---|
| `docurama.eu` | `/` | Apex marketing surface, interactive PAdES live demos, legal templates |
| `www.docurama.eu` | `/` | CNAME alias to apex |
| `app.docurama.eu` | `/` | Enterprise signing workspace: documents, templates, team settings |
| `admin.docurama.eu` | `/admin` | Platform Operator console (13 governance & telemetry sections) |
| `verify.docurama.eu` | `/verify` | Public verification engine (validates `DOC-XXXXXX` and SHA-256) |
| `docs.docurama.eu` | `/docs` | Comprehensive documentation, API guides, legal compliance pack |
| `security.docurama.eu` | `/security` | Security hub, vulnerability disclosure policy, RFC 9116 `security.txt` |
| `status.docurama.eu` | `/status` | Public service health, component uptime, incident history |
| `api.docurama.eu` | `/api` | Public REST API index, OpenAPI specifications |
| `mail.docurama.eu` | `/mail` | Outbound mail relay identification & server documentation |
| `mta-sts.docurama.eu` | `/.well-known/mta-sts.txt` | RFC 8460 strict transport security policy file |
| `docurama.stalfe.com` | `/` | Dedicated Enterprise StålFe production deployment |

### Legacy & Vanity Redirection Logic

To prevent broken links across marketing assets, the middleware permanently handles the following redirects:

- `/sign-in` or `/signin` → **307 Redirect** to `/login` (preserves all query strings, e.g. `?next=/templates`)
- `/sign-up` or `/signup` → **307 Redirect** to `/welcome` (preserves trial parameters, e.g. `?template=...`)
- `/modeles-de-contrats` → Public French contract catalog with direct conversion routing to `/welcome?next=/templates` and `/login?next=/templates`

---

## 5. Account Logins & Credential Directory

### 5.1 Dedicated Enterprise: https://docurama.stalfe.com

This is a deployment example, not a verified live account directory. Use the operator-configured origin and unique credentials for the intended installation. Dedicated mode rejects public registration at `/welcome`, including when an email domain is recognized.

### 5.2 Platform Administrators (Root Operators)

For an empty installation, an operator provisions its first platform administrator using [the offline bootstrap](docs/INSTALLATION-BOOTSTRAP.md). The packaged image command is `bun /app/bootstrap-admin.js --empty-installation`, supplied with a secret-manager password through protected stdin. It refuses existing users or tenants, does not reset credentials and never runs automatically. The administrator then creates the first organization through authenticated settings; later tenant creation is refused in dedicated mode.

### 5.3 Enterprise Tenant Accounts Directory

Fixture users in `prisma/seed.ts`, `e2e/seed.ts` and the retained `db/custom.db` are only for isolated development/tests. No published fixture password is suitable for deployment. Start production with a fresh runtime database, keep demo login disabled and deliver mailbox-bound invitations to real users. New passwords use versioned, randomly salted scrypt with constant-time digest comparison and bounded parameters. Existing SHA-256 records remain compatible and migrate after a successful complete password login, including the required second factor. This change performs no mass password reset or direct rewrite of the retained database.

Authentication accepts only real unrevoked, unexpired sessions. User IDs are never bearer credentials. Inactive memberships cannot be selected or restored by an invitation/verification flow.

### 5.4 Self-Service Password Reset System

Password recovery starts from `/login` and requires control of the account's mailbox. Configure SMTP and the installation's public origin, then verify delivery and token expiry in an approved test account. Do not treat queued mail, logged fixture links or a demo shortcut as mailbox proof. Local two-factor settings continue to apply.

### 5.5 Corporate Domain Auto-Enrollment & Billing Bypass

On a public SaaS installation, a recognized verified domain may reserve a PENDING_VERIFICATION membership. That membership grants no workspace access until the matching mailbox link is consumed and the current domain/user/membership state is rechecked. Dedicated Enterprise installations instead use invitations or SSO and never reopen public signup through domain recognition.

SSO configuration and authentication require a domain verified for the tenant. Existing platform-admin, foreign/multiple-tenant and locally MFA-protected accounts cannot be linked automatically. OIDC requires literal `email_verified: true`; JIT provisioning observes seat reservations. SAML requires HTTPS and correlated single-use state. See [the SSO guide](docs/SSO.md) for provider limitations and browser validation gates.

---
## 6. Email System: Inboxes, Logic, Routing & Deliverability

Docurama specifies 12 official email endpoints adhering to IETF RFC standards and European regulatory requirements:

### Complete Mailbox & Routing Matrix

| Email Address | Mailbox Type | Primary Purpose | Inbound Routing / Forward Target | SLA / Priority |
|---|---|---|---|---|
| **`notifications@docurama.eu`** | Dedicated SMTP Mailbox | Outbound transactional signing links, OTPs, verification emails, tamper alerts | Local SMTP / Relay | **P0 (Critical)** |
| **`admin@docurama.eu`** | Real Mailbox / Forwarder | Infrastructure alarms, certificate expiry, root security notices | `docurama@voiria.com` | **P0 (Critical)** |
| **`support@docurama.eu`** | Shared Support Inbox | Technical support, customer inquiries, signer troubleshooting | Support Helpdesk / Zendesk | **P1 (High)** |
| **`sales@docurama.eu`** | Alias / Forwarder | Enterprise proposals, custom self-hosted contracts, volume licensing | `admin@docurama.eu` | **P1 (High)** |
| **`billing@docurama.eu`** | Alias / Forwarder | VAT receipts, SEPA notifications, invoice disputes | `admin@docurama.eu` | **P1 (High)** |
| **`privacy@docurama.eu`** | Regulatory Alias (DPO) | GDPR Data Subject Access Requests (DSAR/DSR), Article 13/14 inquiries | `admin@docurama.eu` | **P0 (Statutory 30d)** |
| **`legal@docurama.eu`** | Alias / Forwarder | Service agreements, commercial NDAs, formal legal notices | `admin@docurama.eu` | **P1 (High)** |
| **`security@docurama.eu`** | Security Alias | Vulnerability disclosure, bug bounty reports (RFC 9116 security.txt) | `admin@docurama.eu` | **P0 (24h Acknowledge)** |
| **`postmaster@docurama.eu`**| RFC 5321 Mandatory | Mail server bounce notifications, deliverability troubleshooting | `admin@docurama.eu` | **P0 (RFC Standard)** |
| **`abuse@docurama.eu`** | RFC 2142 Mandatory | Spam, phishing, and fraudulent envelope reporting | `admin@docurama.eu` | **P0 (Immediate)** |
| **`contact@docurama.eu`** | Inbound General Alias | General inquiries and partnership communications | `support@docurama.eu` | **P2 (Standard)** |
| **`dmarc@docurama.eu`** | Automated Collector | DMARC aggregate XML (RUA) and forensic failure (RUF) telemetry | DMARC Analyzer Tool | **P2 (Automated)** |

### Deliverability & Authentication Records (DNS)

To ensure zero delivery to spam folders and protect brand reputation against spoofing:

- **SPF:** `v=spf1 include:_spf.docurama.eu ip4:51.75.124.20 -all`
- **DKIM:** `v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz...` (Selector: `docurama2026`)
- **DMARC:** `v=DMARC1; p=reject; sp=reject; pct=100; rua=mailto:dmarc@docurama.eu; ruf=mailto:abuse@docurama.eu; fo=1; aspf=r; adkim=r`
- **MTA-STS (RFC 8460):** Enforces mandatory TLS on all inbound SMTP traffic (`mode: enforce`, `max_age: 31536000`).

---

## 7. Compliance Certificates, Approvals & Policy Library

Docurama is architected to survive comprehensive statutory audits (GDPR CNIL, eIDAS ANSSI, and FDA 21 CFR Part 11).

### Regulatory Compliance Mapping

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Docurama Compliance Architecture                         │
├───────────────────────┬─────────────────────────┬───────────────────────────────┤
│  Regulation / Norm    │ Statutory Requirement   │ Technical Implementation      │
├───────────────────────┼─────────────────────────┼───────────────────────────────┤
│ **eIDAS**             │ Art. 25 & 26 (AdES)     │ PAdES cryptographic sealing,  │
│ (EU Reg 910/2014)     │ Non-repudiation, tamper │ SHA-256 document hashing,     │
│                       │ evidence, signer link   │ X.509 cert + RFC 3161 TSA.    │
├───────────────────────┼─────────────────────────┼───────────────────────────────┤
│ **GDPR**              │ Art. 7 (Consent proof)  │ Versioned consent records,    │
│ (EU Reg 2016/679)     │ Art. 15-20 (DSAR)       │ 1-click JSON/ZIP DSAR export, │
│                       │ Art. 44 (Data residency)│ 100% Paris EU residency.      │
├───────────────────────┼─────────────────────────┼───────────────────────────────┤
│ **FDA 21 CFR Part 11**│ Electronic signatures   │ Re-authentication on signing, │
│ (US Life Sciences)    │ in GxP environments     │ manifest of signature intent, │
│                       │                         │ audit trail with ms precision.│
├───────────────────────┼─────────────────────────┼───────────────────────────────┤
│ **ETSI EN 319 142**   │ PAdES profile standards │ ETSI-compliant byte ranges,   │
│ (European Standards)  │ B-B, B-T, B-LT, B-LTA   │ DSS archive timestamp support.│
└───────────────────────┴─────────────────────────┴───────────────────────────────┘
```

### Official Compliance Policy Suite (12 Documents)

The complete policy documentation is stored in `src/lib/compliance-library/` and published under `/docs/legal`:

1. **POL-SEC-01:** Information Security Management Policy (ISO 27001 aligned)
2. **POL-ACC-02:** Access Control, Authentication & RBAC Policy
3. **PLN-INC-03:** Security Incident Response Plan (CNIL 72h notification framework)
4. **PLN-DR-04:** Disaster Recovery & Business Continuity Plan (RPO < 1h, RTO < 4h)
5. **POL-RET-05:** Data Retention, Archival & Statutory Erasure Policy
6. **POL-VND-06:** Vendor & Subprocessor Risk Management Policy
7. **POL-CHG-07:** Production Change Management & CI/CD Verification Policy
8. **POL-CRY-08:** Cryptographic Controls & Key Management Standard (RSA/AES)
9. **SOP-DSR-09:** Data Subject Rights (DSAR) Standard Operating Procedure
10. **POL-VUL-10:** Vulnerability Assessment & Patch Management Policy
11. **POL-PHY-11:** Physical & Environmental Data Center Security Standard
12. **POL-AUP-12:** Acceptable Use Policy for Enterprise Workspaces

---

## 8. Signature Providers, Authorities & Technical Mechanics

### Target PAdES Sealing Pipeline

The following diagram is a target integration, not verified behavior of every current signer completion. Prove the embedded PDF signature, timestamp and claimed profile with an independent validator before representing them as shipped conformance.

```
 1. Document Upload (PDF)
    │
    ▼
 2. Normalization & AcroForm Analysis
    │  - Page bounding boxes computed
    │  - Visual signatures and text fields positioned
    ▼
 3. ByteRange Allocation
    │  - Allocates signature dictionary `/ByteRange [0, offset1, offset2, length2]`
    │  - Leaves placeholder for PKCS#7 / CMS signature container
    ▼
 4. Hash Computation
    │  - Computes SHA-256 over all bytes excluding the signature container itself
    ▼
 5. RFC 3161 TSA Token Acquisition
    │  - Submits SHA-256 hash to configured Timestamp Authority (DigiCert / Sectigo)
    │  - TSA signs the token with its qualified private key
    ▼
 6. CMS Detached Signature Generation
    │  - Workspace X.509 certificate signs `(Document SHA-256 + TSA Token)`
    ▼
 7. Final Injection & Sealing
       - Injects hexadecimal CMS blob into the allocated PDF byte range
       - Final PAdES-sealed PDF is sealed and immutable
```

### Supported Timestamp Authorities (RFC 3161)

Workspaces can configure preset or custom TSAs via **Settings → eSign**:

- **DigiCert TSA:** `https://timestamp.digicert.com` (Global Trust List / AATL)
- **Sectigo TSA:** `https://timestamp.sectigo.com` (AATL & EUTL accredited)
- **GlobalSign TSA:** `https://timestamp.globalsign.com/tsa/rsladvanced/rfc3161`
- **FreeTSA:** `https://freetsa.org/tsr` (Open testing authority)
- **Custom Enterprise TSA:** Any RFC 3161 compliant server supporting HTTP POST `application/timestamp-query`.

### SMS & Multi-Channel Verification Providers (14 Providers)

For two-factor signing verification and OTP delivery, Docurama integrates 14 carriers:

- **WhatsApp Cloud API (Meta):** Free tier eligible, interactive template messages
- **Twilio:** Global SMS & Voice delivery
- **Infobip:** Enterprise carrier-grade SMS gateway
- **Brevo (Sendinblue):** European-hosted transactional SMS
- **MessageBird:** Global omnichannel messaging
- **OVHcloud SMS:** French sovereign SMS routing
- **Vonage / Nexmo, Sinch, Plivo, CM.com, Textmagic, ClickSend, Octopush, BulkSMS**

---

## 9. Deployment Tiers: Platform, Enterprise & Self-Hosted

| Feature | Platform Cloud (SaaS) | Enterprise Private Cloud | Self-Hosted Appliance |
|---|---|---|---|
| **Target URL** | `https://docurama.eu` | `https://docurama.stalfe.com` | `https://docurama.internal.corp` |
| **Multi-Tenancy** | Shared Multi-Tenant | Dedicated mode blocks additional tenant creation | Dedicated mode; air-gap validation required |
| **Port on Host** | `3002` | `3003` | Configurable (`3000` / `80` / `443`) |
| **Database** | SQLite (`db/custom.db`) | SQLite (dedicated volume) | SQLite; PostgreSQL needs provider, data-migration and runtime validation |
| **Branding** | Docurama Standard | White-label / StålFe Custom | Fully customizable |
| **BYO Certificates** | Enterprise Tier only | Full X.509 / PKCS#12 upload | HSM / Local PKI integration |
| **Updates** | Automatic rolling deploy | Synchronized release branch | Manual Docker pull / git tag |

---

## 10. Platform Enhancements & Architectural Advancements (Cycles 1–11)

The following engineering history describes the implemented surfaces. Their production acceptance criteria and outstanding installation-specific validation are tracked separately in the go-live checklist:

1. **Upstream Quality-Hardening Port (Cycle 11, 2026-09-21):**
   - Synchronized with Docurama `quality` @ `34086af` (three-way port from base `4303be8`; provenance and validation in [docs/UPSTREAM-SYNC.md](docs/UPSTREAM-SYNC.md)).
   - Versioned Prisma migrations with a boot-blocking entrypoint policy (schema failure refuses startup; explicit skip available), replacing silent boot-time schema pushes.
   - Delivery and billing hardening: transactional webhook outbox with fenced leases and stable delivery identities, SSRF-pinned webhook transport, atomic quota reservation with independent UTC monthly rollover, leased mail outbox with attempt budgets, bounded database-transaction admission, worker shutdown fencing, and versioned async password hashing.
   - Local validation: `tsc`/`eslint` clean, entrypoint policy pass, isolated suites 91/91. Upstream GitHub Actions validation is pending restoration of the account's Actions billing.
2. **Maestro Browser E2E Automation Suite (Cycle 1):**
   - 25 end-to-end browser flows verifying the entire user journey: authentication, document drafting, template instantiation, multi-recipient handoffs, decline workflows, and administrative console operations.
   - Deterministic fixtures seeded in `e2e/seed.ts` with strict type gates (`tsc --noEmit`) and visual regression baseline comparisons.
2. **Public Signer Portal & Core Signing Loop (Cycle 2):**
   - Responsive, zero-friction signer journey at `/sign/[token]` requiring no account creation.
   - Dual-mode signature execution: biometric freehand canvas drawing or SVG-rendered cryptographic type-to-sign fonts (Dancing Script, Great Vibes, Caveat).
   - In-app signer decline workflow with statutory audit event logging and sender notifications.
3. **Evidence Pack Export & Attestation Federation (Cycle 3):**
   - One-click `.zip` evidence archive generation via `src/lib/evidence-pack.ts` containing the sealed PDF, canonical JSON audit trail manifest, SHA-256 certificate chains, and an offline zero-dependency HTML verifier (`verify.html`).
   - Cross-instance public portal attestation loopback (`/api/attestations`) allowing sovereign self-hosted instances to federate minimal verification fingerprints without exposing document contents.
4. **Certificate Transparency (CT)-Style Append-Only Registry (Cycle 4):**
   - Cryptographic Merkle/hash-chain registry (`src/lib/transparency.ts`) recording every seal commitment with SHA-256 links to preceding block headers.
   - Public inclusion proofs (`GET /api/transparency/proof/{code}`) and signed checkpoints (`GET /api/transparency/checkpoint`) enabling third-party monitors to detect rewrite attacks or log truncation without central trust.
5. **Embedded Document Preview Engine (Cycle 5):**
   - High-fidelity PDF page rasterizer (`/api/sign/[token]/pages/[n]`) allowing signers to review full document typography, layouts, and statutory clauses before executing signatures.
6. **Sigstore Rekor Neutral Third-Party Witnessing (Cycle 6):**
   - Cryptographic integration with OpenSSF's public Rekor transparency log (`src/lib/rekor.ts`).
   - The portal transparency key signs a self-commitment statement (`docurama-portal-key-witness-v1`), submitted to `rekor.sigstore.dev` as a `hashedrekord`. Checkpoints embed the Rekor entry UUID, log index, and inclusion proof, eliminating single-operator trust.
7. **Per-Recipient Preview Watermarking & MCP Server (Cycle 7):**
   - Dynamic canvas watermarking (`CONFIDENTIAL - REVIEW ONLY`) stamped on document preview pages with recipient email and timestamp, deterring unauthorized pre-signature distribution.
   - Key-authenticated Model Context Protocol (MCP) server at `/api/mcp` for LLM agents to programmatically query envelope status, audit logs, and compliance records.
8. **Production Deployment Readiness & Hardened Packaging (Cycle 8):**
   - `/api/health` reports implemented dependency checks; a healthy response does not prove provider activation, PostgreSQL runtime support, signing conformance or a restore drill.
   - Hardened non-root container image (`uid 10001 docurama`), automated boot-time additive schema migrations (`docker-entrypoint.sh`), and enterprise Helm charts (`deploy/helm/docurama`).
   - Postfix/SMTP retry daemon with exponential backoff and HMAC-SHA256 signed webhook delivery engine.
9. **S3-Compatible Scalable Object Storage (Cycle 9):**
   - Native dual-engine document store supporting local POSIX storage or S3-compatible backends (Apache-2.0 SeaweedFS, MinIO, Ceph, AWS S3, Cloudflare R2).
   - Real SeaweedFS test integration in CI and Docker Compose (`--profile s3`).
10. **Repriced Commercial Catalogue & Guided Onboarding (Cycle 10):**
    - Multi-tier catalogue (SOLO 1-seat €19/mo, STARTER 5-seat €49/mo, BUSINESS 15-seat €149/mo, ENTERPRISE custom).
    - Unused envelope rollover on renewal, committed-term billing discounts, and small team organizational groups.
    - Public `/enterprise` intake pipeline (`/api/enterprise-lead`) with platform admin triage console.

---

## 11. Key Decisions for Your Confirmation

1. **Header Navigation Decluttering:**  
   "Contract Templates" was removed from the crowded top navigation bar and relocated into the marketing footer (under *Product* and *Legal & Trust*) as well as the homepage feature bento. This creates a clean, balanced enterprise header.
2. **French Statutory Contract Integration:**  
   All 8 statutory French legal templates (`isBuiltIn: true`) are now directly embedded in the in-app `/templates` catalog with a distinct **Droit Français** statutory badge, categorization, and a direct "Use template" workflow into the New Envelope dialog.
3. **Permanent Vanity Auth Routing:**  
   To eliminate 404 errors on legacy links or external bookmarks, `/sign-in` permanently redirects to `/login` and `/sign-up` permanently redirects to `/welcome`.
4. **SQLite WAL Architecture vs PostgreSQL:**  
   The checked-in Prisma provider is SQLite. Use a single application replica with validated persistent storage and backups. PostgreSQL requires a provider change, generated client, data migration and workload/runtime tests; a `DATABASE_URL` edit alone is insufficient. No envelope-volume performance guarantee was measured in this review.

---

## 12. Action Items & Operator Tasks Checklist (Tasks to Do for You)

The following checklist details the operational and configuration tasks that require action from the domain owner / infrastructure administrator to finalize full production readiness:

### 12.1 DNS Records & Subdomain Routing (Cloudflare / Registrar)

Configure the following records in your DNS manager (Cloudflare or domain registrar):

- [ ] **Apex & Subdomain Routing Records:**
  - `docurama.eu` → **A Record** pointing to server IP `51.75.124.20` (or Cloudflare proxied)
  - `www.docurama.eu` → **CNAME** pointing to `docurama.eu`
  - `app.docurama.eu` → **A Record** `51.75.124.20` (or CNAME to `docurama.eu`)
  - `admin.docurama.eu` → **A Record** `51.75.124.20` (or CNAME to `docurama.eu`)
  - `verify.docurama.eu` → **A Record** `51.75.124.20` (or CNAME to `docurama.eu`)
  - `docs.docurama.eu` → **A Record** `51.75.124.20` (or CNAME to `docurama.eu`)
  - `security.docurama.eu` → **A Record** `51.75.124.20` (or CNAME to `docurama.eu`)
  - `status.docurama.eu` → **A Record** `51.75.124.20` (or CNAME to `docurama.eu`)
  - `api.docurama.eu` → **A Record** `51.75.124.20` (or CNAME to `docurama.eu`)
  - `mail.docurama.eu` → **A Record** `51.75.124.20` (or CNAME to `docurama.eu`)
  - `mta-sts.docurama.eu` → **A Record** `51.75.124.20` (or CNAME to `docurama.eu`)
  - `docurama.stalfe.com` → **A Record** `51.75.124.20` (or CNAME pointing to VPS for the dedicated Enterprise stack)

- [ ] **Email Deliverability & Authentication Records:**
  - **SPF Record (TXT):**
    ```dns
    docurama.eu. IN TXT "v=spf1 include:_spf.docurama.eu ip4:51.75.124.20 -all"
    ```
  - **DKIM Record (TXT):**
    ```dns
    docurama2026._domainkey.docurama.eu. IN TXT "v=DKIM1; k=rsa; p=<YOUR_PUBLIC_KEY>"
    ```
  - **DMARC Policy (TXT):**
    ```dns
    _dmarc.docurama.eu. IN TXT "v=DMARC1; p=reject; sp=reject; pct=100; rua=mailto:dmarc@docurama.eu; ruf=mailto:abuse@docurama.eu; fo=1; aspf=r; adkim=r"
    ```
  - **MX Records:**
    ```dns
    docurama.eu. IN MX 10 mail.docurama.eu.
    ```
  - **MTA-STS Policy (TXT):**
    ```dns
    _mta-sts.docurama.eu. IN TXT "v=STSv1; id=20260916T080000Z"
    ```

---

### 12.2 Production Email System & Mailbox Setup

Set up the following mailboxes and inbound routing at your email host (e.g. Google Workspace, Brevo, OVH, or Proton):

- [ ] **Transactional Outbound SMTP Mailbox:**
  - Create `notifications@docurama.eu` on your mail server.
  - Add SMTP credentials into `/opt/docurama-cloud/.env` and `/opt/docurama-enterprise/.env` on `nexa-vps`:
    ```env
    SMTP_HOST=mail.docurama.eu
    SMTP_PORT=587
    SMTP_USER=notifications@docurama.eu
    SMTP_PASSWORD=<YOUR_STRONG_SMTP_PASSWORD>
    SMTP_FROM="Docurama <notifications@docurama.eu>"
    ```
  - *Effect:* Enables live delivery of envelope signing invitations, signer OTP verification codes, and password reset links.

- [ ] **Inbound Routing & Aliases:**
  - `admin@docurama.eu` → Forward to your primary executive inbox (e.g. `docurama@voiria.com`)
  - `support@docurama.eu` → Forward to customer support helpdesk
  - `sales@docurama.eu` & `billing@docurama.eu` → Forward to finance / sales lead
  - `privacy@docurama.eu` → Forward to designated Data Protection Officer (DPO) for GDPR Article 15–20 DSAR intake
  - `legal@docurama.eu` → Forward to legal counsel
  - `security@docurama.eu` → Forward to security incident response team (RFC 9116)
  - `abuse@docurama.eu` & `postmaster@docurama.eu` → Forward to server administrators for bounce/abuse monitoring

---

### 12.3 Credentials & Secret Key Rotation

Rotate initial demonstration credentials for production deployment:

- [ ] **Rotate Platform Superadmin Passwords:**
  - Change default password for `admin@docurama.eu` and `ops@docurama.eu` (default was `admin1234`) via [https://admin.docurama.eu](https://admin.docurama.eu) or direct `/reset-password`.
  - Configure TOTP Two-Factor Authentication (Google Authenticator / 1Password) on the platform operator account.
- [ ] **Rotate StålFe Dedicated Enterprise Passwords:**
  - Change initial passwords for `alex@stalfe.example`, `marco@stalfe.example`, and `sofia@stalfe.example` (default was `demo1234`) via [https://docurama.stalfe.com/login](https://docurama.stalfe.com/login).
- [ ] **Rotate Production Environment Encryption Salts:**
  - Verify `/opt/docurama-cloud/.env` and `/opt/docurama-enterprise/.env` on `nexa-vps` have unique, random 64-character hex values for `SESSION_SECRET`, `ENCRYPTION_KEY`, and `NEXTAUTH_SECRET`.

---

### 12.4 Commercial Certificates, Authorities & Carrier Integrations

To enable legally binding eIDAS seals and two-factor SMS OTPs:

- [ ] **Upload Official X.509 PAdES Sealing Certificate (AATL / eIDAS QES):**
  - Obtain an organization seal certificate (e.g. from CertEurope, QuoVadis, DigiCert, or SwissSign) in PKCS#12 (`.p12` / `.pfx`) format.
  - Upload under **Settings → eSign → Custom Certificate** or via Platform Admin for the StålFe tenant.
- [ ] **Connect Commercial RFC 3161 Timestamp Authority (TSA):**
  - Current default is FreeTSA (`https://freetsa.org/tsr`).
  - If contractually requiring qualified timestamps, configure DigiCert (`https://timestamp.digicert.com`), Sectigo, or GlobalSign credentials in **Settings → eSign**.
- [ ] **Configure SMS / WhatsApp Carrier API Key:**
  - Select your preferred carrier (e.g. Brevo, Twilio, WhatsApp Cloud API, or OVHcloud SMS).
  - Enter the API key in **Settings → Channels & Messaging** to activate live SMS OTP delivery for signers.

---

### 12.5 Payment Gateway & Corporate Domain Whitelisting

- [ ] **Stripe Live Billing Credentials:**
  - Replace test Stripe keys with Live Stripe API keys in `/opt/docurama-cloud/.env`:
    ```env
    STRIPE_SECRET_KEY=sk_live_...
    STRIPE_WEBHOOK_SECRET=whsec_...
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
    ```
  - Verify webhook endpoint is configured in Stripe Dashboard pointing to `https://docurama.eu/api/billing/webhook`.
- [ ] **Whitelist Additional Client Corporate Domains:**
  - Verify tenant domain ownership and configure invitations/SSO under the installation policy. A claimed corporate email never grants immediate workspace access; mailbox proof is required, and dedicated installations keep public signup closed.

---

### 12.6 Legal Entity & Compliance Finalization

- [ ] **Confirm Official Corporate Identifiers:**
  - Verify that SIRET/SIREN, RCS Paris registration number, and VAT numbers in [`src/lib/compliance-library/`](file:///d:/Dev/Under-Development/Docurama/src/lib/compliance-library/) and the website footer match your registered French SAS company details.
- [ ] **Formalize DPO Notification with CNIL:**
  - Submit the official Data Protection Officer designation form to CNIL referencing `privacy@docurama.eu`.

---

## 13. Operational Runbooks & Commands

### Local Development

```bash
# Clone and install dependencies
git clone -b quality https://github.com/StalFe-Cloud/docurama-enterprise.git
cd docurama-enterprise
bun install --frozen-lockfile

# Database initialization
bunx prisma generate
bunx prisma db push

# Run development server
bun run dev           # http://localhost:3000
```

### Production Build & Type Check

```bash
# Verify type safety
bunx tsc --noEmit

# Linting
bun run lint

# Compile Next.js production bundle
bunx next build
```

### Release deployment

Promote only a reviewed, validated revision and deploy it through the installation's approved release procedure. Follow [the Enterprise update and rollback guide](ENTERPRISE-SELFHOST.md); do not pull an unpinned branch onto a live database or assume a schema failure is safe to ignore. No deployment was performed by this branch reconciliation.

---

*© 2026 Docurama SAS · 1 Rue Marguerin, 75014 Paris, France · All rights reserved.*
