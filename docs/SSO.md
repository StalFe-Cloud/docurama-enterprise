# SSO Operator Guide — Docurama

Implementation: `src/lib/sso.ts` + routes under `src/app/api/auth/sso/`. Admin surface: **Settings → SSO** (workspace OWNER/ADMIN or platform admin; ops `create | update | delete | toggle | test` via `src/app/api/workspace/sso/route.ts`).

## 1. Architecture

Connections live in the `SsoConnection` model:

| Field | Meaning |
|---|---|
| `tenantId` (nullable in legacy schema) | The workspace the connection belongs to. A real tenant is required for authentication; legacy `null` connections are refused |
| `protocol` | `OIDC` or `SAML` |
| `emailDomain` | Normalized domain owned by this tenant, with a `Domain` record in `VERIFIED` state and a non-null `verifiedAt` |
| `status` | `ACTIVE` / `DISABLED` — **one ACTIVE connection per domain** (enforced on create and toggle) |
| `label` | Shown on the "Continue with {label}" button |

Lookup (`findSsoConnection`) matches the typed email's normalized domain against ACTIVE connections. Configuration creation, updates and re-enabling require verified ownership by the configuring tenant. Lookup and login recheck ownership and the tenant's ACTIVE/TRIAL status. Missing/revoked proof, competing verified ownership or multiple trusted connections fail closed. Workspace administrators can manage only their own tenant's connections.

Before adding a connection, verify the domain through the workspace's domain verification flow (Settings → Email/domain setup), or use an existing domain already verified for that workspace. A typed email domain alone is never proof of ownership. Apply the current Prisma schema before rollout: the `SsoTransaction` table stores one-time login state. Existing platform-wide connections must be reviewed and explicitly replaced with a tenant-bound, verified-domain configuration; there is no automatic trust migration.

## 2. OIDC setup (per provider)

Redirect URI to register at the IdP: **`{origin}/api/auth/sso/callback/oidc`** (e.g. `https://app.docurama.eu/api/auth/sso/callback/oidc`). Scope requested: `openid email profile`.

| Provider | Where |
|---|---|
| **Microsoft Entra ID** | App registration → Redirect URI (web) as above → note the Application (client) ID + a client secret; issuer `https://login.microsoftonline.com/{tenant}/v2.0` |
| **Google Workspace** | Cloud console → OAuth client (web application) → authorized redirect URI as above; issuer `https://accounts.google.com` |
| **Okta** | Application → OIDC sign-in → sign-in redirect URI as above; issuer `https://{okta-domain}/oauth2/default` (or your auth-server issuer) |
| **Keycloak** | Client (confidential, standard flow) → valid redirect URI as above; issuer `https://{kc}/realms/{realm}` |

In Docurama: **Settings → SSO → Add connection** — protocol OIDC, label (e.g. "Microsoft Entra ID"), email domain, issuer URL, client ID, client secret. Use the **test-discovery button** (op `test`) first: it performs live OIDC discovery and reports the authorize/token/JWKS endpoints before you save anything.

Flow: discovery-driven (cached 10 min) → authorize URL with **PKCE S256** challenge + **nonce** + `login_hint` → token exchange → `id_token` verified with `jose` against the IdP JWKS (issuer, audience, clock tolerance 60 s) → nonce re-checked → email claim extracted. The discovery issuer must exactly match the configured issuer. Production requires HTTPS for the issuer and endpoints. The signed token must carry literal boolean `email_verified: true`; absent, false and non-boolean claims are rejected. Providers that do not issue this claim cannot use this OIDC path until an explicitly reviewed equivalent verified-identity mapping is implemented. Provider recipes above are setup guidance, not evidence of a completed live-provider validation.

## 3. SAML

- **SP metadata** (this instance): `GET /api/auth/sso/metadata/saml` — hand the XML (or its URL) to the IdP. EntityID = that URL; **ACS endpoint**: `{origin}/api/auth/sso/callback/saml`; NameID format emailAddress; `WantAssertionsSigned`.
- In Docurama: Settings → SSO → Add connection — protocol SAML, label, verified email domain, and **paste the IdP's metadata XML**. Save performs a basic XML presence check; parsing and signature validation occur during the flow. The client secret / issuer fields are OIDC-only.
- SAML start requires an HTTPS origin. The login URL is built via samlify (`createLoginRequest`, redirect binding). **RelayState must exactly match the transaction state**, and both the response and signed bearer confirmation must match the original AuthnRequest ID (`InResponseTo`). Signed recipient, audience and expiry are checked. Responses are signature-verified (`parseLoginResponse`); email is taken from the email attribute, `mail`, or an email-format NameID. XSD validation remains disabled; signature verification is enforced. Unsolicited IdP-initiated responses are not supported.

## 4. Flow details & JIT

- **Transaction cookie** (`docurama_sso_txn`, 10-minute Max-Age, HttpOnly): carries state, connection ID, signed expiry, OIDC PKCE verifier/nonce or SAML request ID, and a local post-login path. OIDC uses `SameSite=Lax`; SAML uses `SameSite=None; Secure` to support an external IdP's POST. It is **HMAC-SHA256 signed with `SSO_TXN_SECRET`** (or `AUTH_SECRET`). Production refuses missing/secrets shorter than 32 characters; development uses an ephemeral random secret if none is configured. The server validates expiry and atomically consumes hashed state in `SsoTransaction`; replaying a saved cookie cannot reuse the login. Tampering and nonlocal redirect targets are rejected. Expired transaction rows older than one day are removed when new transactions start.
- **Domain-mismatch check**: the IdP-asserted email's normalized domain must exactly match the connection's verified domain; the core login function enforces this even when called outside the callback route.
- **JIT provisioning**: unknown emails from the bound domain are auto-provisioned — user created `ACTIVE`, `emailVerifiedAt` set (the IdP asserted mailbox control), role `MEMBER`, **unusable password hash** (`sso!` + random hex), enrolled as `MEMBER` of the connection's tenant (tenant-bound connections). Login is audited as `user.login.sso_oidc` / `user.login.sso_saml`. Suspended accounts are refused.
- **Existing account linking:** an account must already have a verified mailbox and exactly one ACTIVE membership in the trusted tenant. PLATFORM_ADMIN accounts, unverified/suspended accounts, pending memberships, accounts with no membership or another tenant membership, and locally TOTP-enabled accounts cannot be linked automatically. This prevents a tenant IdP from issuing a global session for an account beyond its authority. The session's active workspace is set to the trusted tenant.
- **Seat capacity:** new JIT accounts require an available seat inside the same transaction that creates their membership. ACTIVE and PENDING_VERIFICATION memberships and unexpired pending invitations reserve seats. Existing invitations must be accepted through the invitation flow; SSO does not silently consume or exceed their reservation.
- **Local MFA:** SSO does not replace Docurama's local second factor. Accounts with local TOTP, and tenants enforcing two-factor authentication, must use password sign-in with that factor until an SSO second-factor handoff is implemented.
- **Fallback:** password login remains available — users without a matching domain, with restricted account linking, or when the connection is disabled/deleted can use it. SSO-created accounts set a password through the mailbox reset flow.

## 5. Login UX

Sign-in page: user types their email → `/api/auth/sso/lookup` resolves the domain → the button **"Continue with {label}"** appears next to password sign-in. Clicking it starts the OIDC/SAML flow for that connection. Deleting a connection prints an honest fallback message: those users return to password sign-in.

## 6. Testing

`e2e/sso.test.ts` (hermetic, fresh temporary database/schema and explicit fixtures; owns `SSO_TXN_SECRET`; requires local Node, Bun and OpenSSL):

- transaction-cookie signing, expiry, tampering, atomic single-use replay protection and safe local redirects;
- OIDC end-to-end against an **in-process stub provider** (discovery + authorize + token + JWKS, jose-signed `id_token`), including nonce-mismatch rejection and domain-bound JIT login (user + member + session + audit);
- SAML round-trip: SP metadata XML, an IdP keypair **generated with openssl**, signed AuthnResponse, request/recipient/audience binding, attribute extraction and JIT login;
- adversarial tenant cases: unverified/revoked/ambiguous domain authority, unauthorized create/update/re-enable, platform admin and foreign/multi-tenant accounts, pending memberships and MFA;
- routes: real session-backed configuration, SAML start and callback with missing/mismatching RelayState and replay, lookup and metadata.

```bash
bun --no-env-file test e2e/sso.test.ts # standalone, no local secrets loaded
E2E_SKIP_SSO=1 bash e2e/run.sh    # skip within the full battery
```

Before rollout, run an approved browser smoke test against an external test IdP over HTTPS: verify domain ownership → add connection → test discovery for OIDC → sign in from a private window → verify the tenant and audit entry. For SAML confirm the cross-site POST carries its transaction cookie, and that reusing the response, omitting RelayState, using an unrelated request or revoking the domain cannot establish a session. Local signed-assertion tests do not replace this browser/provider gate.
