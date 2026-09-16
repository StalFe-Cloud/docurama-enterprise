# Docurama — Enterprise e-Signature & Legal Evidence Platform

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
12. [Operational Runbooks & Commands](#12-operational-runbooks--commands)

---

## 1. Executive Summary & Core Value Proposition

Docurama is an EU-native, enterprise-grade electronic signature and document intelligence platform engineered specifically for organizations subject to European statutory compliance and international audit requirements.

Unlike generic signature tools that only insert rasterized signature stamps into PDFs, Docurama creates an **independently verifiable evidence chain**:
- **Cryptographic PAdES Sealing:** Generates ETSI EN 319 142 conformant signatures (PAdES B-B, B-T, B-LT, and B-LTA) that verify offline in Adobe Acrobat Reader and PDF-XChange without querying Docurama servers.
- **RFC 3161 Trusted Time-stamps:** Digitally binds every signature step to an independent EU-recognized Timestamp Authority (TSA).
- **Statutory French Contract Catalog:** Built-in repository of 8 statutory contracts (CDI, CDD, NDA, Bail Commercial, CGV, Prestation de services, Pacte d'associés, Accord de résiliation) draftable and signable in one click.
- **Document Intelligence (DocIntel):** Deep inspection pipeline utilizing AcroForm extraction, text layer parsing, and bilingual OCR (French & English) to automatically place signature fields, detect risk clauses, and generate audit metadata.
- **Corporate Auto-Enrollment (Billing Bypass):** Approved corporate email domains (e.g. `@singa.fr`, `@stalfe.com`) automatically route users into their company's shared workspace without requiring credit card details or passing through billing checkout.
- **True European Data Sovereignty:** 100% processed and stored in Paris, France. Zero international data transfers, strictly governed by GDPR and the CNIL framework.

---

## 2. Production Deployment Architecture

Docurama supports three deployment configurations: **Multi-Tenant Public Cloud**, **Dedicated Enterprise Cloud**, and **Self-Hosted Air-Gapped Appliance**.

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

The dedicated enterprise deployment at **`https://docurama.stalfe.com`** provides an isolated tenant environment for **StålFe Industrial Heavy Engineering**:

| Login Email | Organization | Role | Plan Tier | Password | Capabilities |
|---|---|---|---|---|---|
| **`alex@stalfe.example`** | StålFe | `WORKSPACE_ADMIN` (Owner) | **ENTERPRISE** | `demo1234` | Full workspace governance, BYO certificate upload, team management, billing, signing |
| **`marco@stalfe.example`** | StålFe | `MEMBER` (Admin) | **ENTERPRISE** | `demo1234` | Document authoring, template creation, audit log export, envelope sealing |
| **`sofia@stalfe.example`** | StålFe | `MEMBER` (Signer) | **ENTERPRISE** | `demo1234` | Document review, cryptographic signing, certificate verification |

#### Direct Access Links:
- **Sign In:** [`https://docurama.stalfe.com/login`](https://docurama.stalfe.com/login)
- **Password Reset:** [`https://docurama.stalfe.com/login`](https://docurama.stalfe.com/login) (Click *"Forgot password?"*) or direct at [`https://docurama.stalfe.com/reset-password`](https://docurama.stalfe.com/reset-password)
- **Corporate Registration:** [`https://docurama.stalfe.com/welcome`](https://docurama.stalfe.com/welcome) (Instant onboarding for approved company emails)

---

### 5.2 Platform Administrators (Root Operators)

Platform administrators have root oversight across all tenants, global audit logs, and domain management at **`https://admin.docurama.eu`** or **`/admin`**:

| Email | Role | Operator Name | Initial Password | 2FA Status | Permissions |
|---|---|---|---|---|---|
| **`admin@docurama.eu`** | `PLATFORM_ADMIN` | Elena Marchetti | `admin1234` | Enabled (TOTP) | Root Superadmin: tenant provisioning, domain whitelisting, compliance audits |
| **`ops@docurama.eu`** | `PLATFORM_ADMIN` | Jonas Weber | `admin1234` | Enabled (TOTP) | Infrastructure Operations: telemetry, rate-limiting, TSA configuration |

---

### 5.3 Enterprise Tenant Accounts Directory

Pre-configured tenant accounts across various subscription tiers for quality assurance and staging:

| Email | Organization | Role | Plan | Initial Password |
|---|---|---|---|---|
| `pietro@aurora-legal.example` | Aurora Legal LLP | `WORKSPACE_ADMIN` (Owner) | **BUSINESS** | `demo1234` |
| `hannah@helios-energy.example`| Helios Energy Group | `WORKSPACE_ADMIN` (Owner) | **ENTERPRISE** | `demo1234` |
| `lucas@bayern-immo.example` | Bayern Immobilien AG | `MEMBER` (Admin) | **BUSINESS** | `demo1234` |
| `amara@meteora-health.example`| Meteora Health Clinics | `MEMBER` (Owner) | **BUSINESS (Trial)** | `demo1234` |
| `tomas@solstice-media.example`| Solstice Media Ltd | `MEMBER` (Owner) | **STARTER** | `demo1234` |
| `greta@corvus-mfg.example` | Corvus Manufacturing | `MEMBER` (Owner) | **ENTERPRISE (Suspended)** | `demo1234` |
| `dmitri@atlas-freight.example`| Atlas Freight Systems | `MEMBER` (Admin) | **BUSINESS** | `demo1234` |
| `leila@verdant-agri.example` | Verdant Agriculture | `MEMBER` (Owner) | **STARTER** | `demo1234` |

> [!NOTE]
> All passwords in the database are hashed using SHA-256 with tenant-scoped cryptographic salts. Custom workspace users can be provisioned through **Settings → Team** or onboarded automatically via corporate domain matching.

---

### 5.4 Self-Service Password Reset System

Docurama features a complete, secure password recovery pipeline accessible from `/login`:

1. **Requesting a Reset:**
   - On `/login`, users click **"Forgot password?"**.
   - A modal allows the user to submit their registered email address.
   - Endpoint: `POST /api/auth/forgot-password`.
   - The server generates a high-entropy 32-byte hexadecimal token with a 1-hour expiration timestamp.
   - A branded email is sent via `notifications@docurama.eu` with the secure link `https://docurama.eu/reset-password?token=<TOKEN>`.
   - In staging/development environments, the recovery URL and token are also logged directly to the server terminal.
2. **Setting the New Password:**
   - The user opens `/reset-password?token=<TOKEN>`.
   - The page provides a real-time password strength meter and confirm-password verification.
   - Endpoint: `POST /api/auth/reset-password`.
   - Validates that the token exists and has not expired, hashes the new password with SHA-256 and workspace salt, invalidates the token, and automatically redirects to `/login` with a success alert.

---

### 5.5 Corporate Domain Auto-Enrollment & Billing Bypass

Organizations can enable seamless corporate onboarding where employees join the shared company workspace without entering credit card details or passing through the billing checkout.

#### How It Works:
1. **Platform Admin Whitelisting:**
   - Under **Admin → Tenants → Allowed Domains**, the platform administrator registers approved corporate domains (e.g. `singa.fr`, `stalfe.com`) and links them to the designated tenant (e.g. StålFe).
   - Flag: `autoJoin: true`, `bypassBilling: true`.
2. **Real-Time Frontend Domain Detection:**
   - When a user enters their email (e.g. `engineer@singa.fr`) on `/welcome` or `/login`, the frontend queries `GET /api/auth/check-domain?domain=singa.fr`.
   - The UI immediately surfaces a verified enterprise badge:  
     *"Recognized company domain: StålFe. You will join the shared company workspace without entering billing information."*
3. **Zero-Billing Provisioning:**
   - The registration wizard skips Step 2 (Plan Selection & Payment) completely.
   - The user account is provisioned with role `MEMBER` directly inside the existing StålFe enterprise workspace.

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

### How Cryptographic PAdES Sealing Works

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

- **DigiCert TSA:** `http://timestamp.digicert.com` (Global Trust List / AATL)
- **Sectigo TSA:** `http://timestamp.sectigo.com` (AATL & EUTL accredited)
- **GlobalSign TSA:** `http://timestamp.globalsign.com/tsa/r6advanced1`
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
| **Multi-Tenancy** | Shared Multi-Tenant | Dedicated Single-Tenant | Air-Gapped Single-Tenant |
| **Port on Host** | `3002` | `3003` | Configurable (`3000` / `80` / `443`) |
| **Database** | SQLite WAL (`db/custom.db`) | SQLite WAL (dedicated volume) | SQLite or PostgreSQL |
| **Branding** | Docurama Standard | White-label / StålFe Custom | Fully customizable |
| **BYO Certificates** | Enterprise Tier only | Full X.509 / PKCS#12 upload | HSM / Local PKI integration |
| **Updates** | Automatic rolling deploy | Synchronized release branch | Manual Docker pull / git tag |

---

## 10. Recent Implementations & Platform Enhancements (v1.2.0)

1. **Homepage Hero Demo Viewport & Scaling Fix:**
   - Eliminated rigid `.hero-fold` viewport constraint (`calc(100vh - 4rem)`) that compressed the demo canvas vertically on desktop displays.
   - Refactored `HeroDemo` responsive canvas scaling from constrained dual-axis `Math.min(w/CANVAS_W, h/CANVAS_H, 1)` to proportional width-based scaling `scale = Math.min(w / CANVAS_W, 1)` with automatic dynamic aspect-ratio height (`fit.h = CANVAS_H * scale`).
   - The interactive product movie now displays at full 1000px width on desktop and scales naturally across mobile and tablet devices without squishing.
2. **Self-Service Password Reset Pipeline:**
   - Implemented `POST /api/auth/forgot-password` with 32-byte cryptographic token generation and 1-hour expiration.
   - Created dedicated `/reset-password` UI with real-time password strength indicators and confirmation validation.
   - Implemented `POST /api/auth/reset-password` for secure token redemption, SHA-256 password rehashing, and automated token invalidation.
   - Added direct "Forgot password?" modal triggers on `/login`.
3. **Corporate Domain Auto-Enrollment & Billing Bypass:**
   - Added real-time corporate domain lookup via `GET /api/auth/check-domain?domain=...`.
   - Created Platform Admin Allowed Domains governance panel (`/admin` → Tenants / Domains) with `autoJoin` and `bypassBilling` toggles.
   - Implemented `@singa.fr` demonstration corporate bypass allowing employees to directly join the StålFe workspace without entering payment details.
4. **French Statutory Contract Integration in Templates Catalog:**
   - Embedded all 8 statutory French contracts (CDI, CDD, NDA, Bail Commercial, CGV, Prestation, Pacte d'associés, Accord de résiliation) directly inside `/templates`.
   - Added French legal system statutory badges (**Droit Français**), category filtering, and direct one-click drafting into the New Envelope wizard.

---

## 11. Key Decisions for Your Confirmation

1. **Header Navigation Decluttering:**  
   "Contract Templates" was removed from the crowded top navigation bar and relocated into the marketing footer (under *Product* and *Legal & Trust*) as well as the homepage feature bento. This creates a clean, balanced enterprise header.
2. **French Statutory Contract Integration:**  
   All 8 statutory French legal templates (`isBuiltIn: true`) are now directly embedded in the in-app `/templates` catalog with a distinct **Droit Français** statutory badge, categorization, and a direct "Use template" workflow into the New Envelope dialog.
3. **Permanent Vanity Auth Routing:**  
   To eliminate 404 errors on legacy links or external bookmarks, `/sign-in` permanently redirects to `/login` and `/sign-up` permanently redirects to `/welcome`.
4. **SQLite WAL Architecture vs PostgreSQL:**  
   For workloads under 100,000 active envelopes/month, SQLite in WAL mode provides instantaneous queries, sub-millisecond transactions, zero external network latency, and simple zero-dependency backups. The codebase provides a direct migration path to PostgreSQL for multi-region clustering.

---

## 12. Operational Runbooks & Commands

### Local Development

```bash
# Clone and install dependencies
git clone -b quality https://github.com/StalFe-Cloud/docurama.git
cd docurama
bun install

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

### Remote Server Deployment (`nexa-vps`)

```bash
# Deploy Docurama Public Cloud (port 3002)
ssh nexa-vps "cd /opt/docurama-cloud && git pull origin main && docker compose build && docker compose up -d"

# Deploy Docurama Enterprise (port 3003)
ssh nexa-vps "cd /opt/docurama-enterprise && git pull origin main && docker compose build && docker compose up -d"
```

---

*© 2026 Docurama SAS · 1 Rue Marguerin, 75014 Paris, France · All rights reserved.*
