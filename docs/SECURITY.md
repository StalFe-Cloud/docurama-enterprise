# Security Policy & Posture — Docurama

Internal document. Covers the shipped posture, the controls an operator inherits, and what self-hosters must do themselves. Public-facing disclosure policy: `https://security.<root>` + `/.well-known/security.txt` (RFC 9116).

## 1. Threat model (summary)

Docurama signs and seals business documents; the assets are (a) document confidentiality, (b) signature/evidence integrity, (c) tenant isolation, (d) account takeover. Primary adversaries: credential stuffing against the portal, forged signing links, webhook/API abuse, and a compromised host. Mitigations map to: revocable sessions + 2FA (§3), unguessable per-recipient tokens + domain-bound SSO, hashed API keys + scoped endpoints + signed webhooks, and the evidence chain (§5).

## 2. Security headers (shipped in next.config.ts)

| Header | Value |
|---|---|
| Content-Security-Policy | `default-src 'self'`; production drops `unsafe-eval` (dev-only, React refresh); `object-src 'none'`; `frame-ancestors 'none'` |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| Cross-Origin-Opener-Policy | `same-origin` |
| Cache-Control on `/api/*` | `no-store, max-age=0` |

Verify after deploy: `curl -sI https://app.<root>/ | grep -iE 'content-security|strict|frame|opener'` — no `unsafe-eval` in the production CSP.

## 3. Authentication

- **Passwords:** new passwords use versioned scrypt records (`N=32768`, `r=8`, `p=3`) with a random 128-bit salt and constant-time key comparison. The verifier accepts only the supported cost profile. Legacy SHA-256 records remain readable for compatibility and are replaced after a successful password login, including the required second factor. Dormant accounts retain their legacy record until login or password reset; there is no bulk plaintext-password migration. The offline bootstrap, signup, reset and password-change paths all write the new format.
- **Sessions:** server-side `Session` table — revocable, 7-day expiry, device/IP metadata. Logout revokes server-side; cookies are HttpOnly with CHIPS attributes on HTTPS, plus a Bearer fallback for hostile cookie contexts.
- **TOTP 2FA:** real RFC 6238 (zero deps, ±1-step window), 10 one-time recovery codes stored as SHA-256 hashes. Org-wide enforcement via `Tenant.enforceTwoFactor`; admin op `force-2fa` per user.
- **SSO (OIDC):** discovery-driven authorization-code flow with **PKCE (S256)** and **nonce**; `id_token` verified via `jose` against the IdP's JWKS (issuer + audience checked, nonce mismatch = replay rejected). A literal `email_verified: true` claim is required; omitted or nonboolean values are rejected.
- **SSO trust:** configuration and runtime authentication require an unambiguous VERIFIED domain with `verifiedAt`, owned by the configured ACTIVE/TRIAL tenant. Legacy platform-wide connections cannot authenticate. Domain proof is rechecked on lookup, callback and login; tenant admins manage only their tenant's connections.
- **SSO (SAML):** samlify signature verification plus original AuthnRequest correlation in the response and signed bearer confirmation (`InResponseTo`), recipient, audience, expiry and mandatory matching RelayState. HTTPS is required; unsolicited IdP-initiated responses are rejected. XML schema validation remains disabled and is a hardening limitation.
- **JIT provisioning:** new identities in the trusted domain become ACTIVE members of that tenant, with verified email and an unusable password hash. Creation checks and reserves seat capacity in the same transaction, counting active/pending-verification members and unexpired invitations. Existing accounts require verified email and exactly one ACTIVE membership in that tenant; platform admins, suspended/unverified accounts, other/multiple tenant memberships and local TOTP accounts cannot be linked. Tenants enforcing two-factor authentication use password sign-in with the local factor. Password reset remains the mailbox-based fallback for SSO-created accounts.
- **Transaction cookies:** `docurama_sso_txn` carries state, signed expiry and OIDC PKCE/nonce or the SAML request ID, signed with HMAC-SHA256 via `SSO_TXN_SECRET` (or `AUTH_SECRET`). Production requires a configured secret of at least 32 characters. HttpOnly, 10 minutes; OIDC uses `SameSite=Lax`, SAML `SameSite=None; Secure`. Hashed state is consumed atomically in `SsoTransaction`, preventing reuse across workers. Only local post-login redirects are allowed. See [SSO operator guide](SSO.md) for rollout gates and account limitations.

## 4. Bot protection & API security

**Signup and enterprise-lead forms** use a honeypot `website`, a 2.5 s client timestamp heuristic, and optional server-validated Cloudflare Turnstile (`src/lib/bot-guard.ts`). The timestamp is advisory and forgeable; it does not prove humanity. Timing checks are skipped in demo mode, while the honeypot remains active. Per-IP rate limiting is per-route on top. Password reset is separately rate-limited and is not currently wired to this widget.

Configure **both** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` at build time and `TURNSTILE_SECRET_KEY` at runtime before enabling Turnstile. The reusable form widget sends its token, clears expired tokens, prevents submission until ready and refreshes after server failure because tokens are single-use. CSP allows only `https://challenges.cloudflare.com` for the widget's script and frame, and only when a public site key is configured. Siteverify uses the required `response` parameter and accepts only literal `success: true`; network and malformed responses fail closed. A secret without its public site key will intentionally reject submissions. Local stub tests validate the API contract; a browser test using an approved Cloudflare test configuration is still required before rollout. See [Cloudflare validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) and [CSP guidance](https://developers.cloudflare.com/turnstile/reference/content-security-policy/).

**API keys:** `X-API-Key` values are SHA-256 hashed at rest and shown exactly once at creation; keys carry scopes (ENVELOPES / TEMPLATES / FULL — a wrong-scope key gets 403) and per-key rate limits; the MCP server (`/api/mcp`) adds its own per-key rate limit with per-tenant enable/allowlist. Outbound webhooks are HMAC-SHA256-signed (`X-Docurama-Signature` over the raw body) with the secret revealed once; endpoints are https-only (loopback excepted).

## 5. Evidence chain

The implemented evidence path records a SHA-256 document/ledger digest, RSA-signed attestation and append-only transparency log, with optional Rekor witnessing. A completion record or conformance label does not prove that the output PDF contains an embedded PAdES signature or an RFC 3161 timestamp. Independent validation of a completed PDF, TSA response and certificate chain remains a release gate. Do not claim B-B/B-T/B-LT/B-LTA or Part 11 compliance from the metadata alone.
## 6. Data protection

EU residency end-to-end (Docurama SAS, Paris; EU hosting and EU TSAs). DSAR tooling in the admin console (Legal & DSAR section: run/cancel, DMCA resolution with recorded notes). Retention policies and legal holds are first-class models (per-tenant retention rules, hold-scoped purge suppression). Consent records (GDPR Art. 7) are captured at signup with versioned references.

## 7. Incident response

| Severity | Trigger | Clock |
|---|---|---|
| SEV1 | Confirmed data breach, total sealing outage | Crisis cell ≤ 30 min; CNIL within 72 h (Art. 33) |
| SEV2 | Contained serious incident | Same-day containment write-up |
| SEV3 | Minor/cosmetic | Ticketed |

All incidents are tracked in the Incident ledger (rendered on `/status`). Audit expectations: `AuditEvent`/`SecurityEvent` rows are append-only records of every mutation (actor, IP, severity); the audit chain status is visible in the admin console — treat any chain gap as SEV2. External reports flow to **security@docurama.eu**; triage and safe-harbor commitments are published on the security page.

## 8. Operational security checklist (self-hosters)

- [ ] **Set `SSO_TXN_SECRET`** to a cryptographically random value of at least 32 characters, and apply the schema containing `SsoTransaction` before enabling SSO. Review legacy connections and verified domain ownership.
- [ ] If enabling Turnstile, build with its public site key, configure the matching server secret and verify successful, expired-token and failed-challenge submissions in a real browser.
- [ ] `NEXT_PUBLIC_DEMO_MODE` unset or `false` (the Dockerfile ships it off).
- [ ] Real **Postgres** requires a provider-specific generated client, migration rehearsal and application tests; schema-portability CI alone does not establish runtime support. The supplied SQLite configuration is single-replica only, on persistent storage.
- [ ] **TLS everywhere**: reverse proxy or ingress TLS; `smtps://` or STARTTLS relay; `https://` TSAs only.
- [ ] **Restrict admin console access** (`/admin`, platform-admin accounts) — network-restrict the host, enforce 2FA on every admin, keep the admin count minimal.
- [ ] **Encrypt backups**: `scripts/backup.sh --gpg <recipient>` + off-site `--remote`.
- [ ] Rotate the Stripe webhook secret and API keys on staff change; webhook secrets and API keys are shown once.
- [ ] Review `AuditEvent` and `SecurityEvent` feeds weekly; watch `/api/health` `checks.webhooks.failing`.
