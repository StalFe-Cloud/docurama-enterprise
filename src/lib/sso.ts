import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { domainToASCII } from "node:url";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { SESSION_COOKIE, sessionCookieAttributes } from "@/lib/auth";
import { seatCapacity } from "@/lib/billing";
import * as jose from "jose";

/**
 * Single sign-on (go-live cycle): OIDC and SAML wiring for enterprise
 * workspaces and self-hosted instances.
 *
 *  OIDC  — discovery-driven authorization-code flow with PKCE and a nonce.
 *          Works with Microsoft Entra ID, Google Workspace, Okta, Keycloak,
 *          Authentik and any compliant provider.
 *  SAML  — this instance is the SP (metadata served at
 *          /api/auth/sso/metadata/saml); the IdP is configured from its
 *          metadata XML in Settings → Security → SSO.
 *
 * Users are matched by email domain to an ACTIVE SsoConnection. Unknown
 * emails are JIT-provisioned (ACTIVE, email-verified, member of the
 * connection's tenant) — the IdP's assertion is the proof of identity.
 */

// ─── Transaction cookie (state + PKCE + nonce, HMAC-signed) ──────────────────

export interface SsoTxn {
  /** Anti-CSRF state (OIDC) or RelayState (SAML). */
  state: string;
  connectionId: string;
  /** OIDC only. */
  codeVerifier?: string;
  nonce?: string;
  samlRequestId?: string;
  expiresAt?: number;
  /** Where to land after a successful login. */
  postLogin: string;
}

const ephemeralTxnSecret = randomBytes(32).toString("hex");
const TXN_TTL_MS = 10 * 60_000;
function txnSecret(): string {
  const configured = process.env.SSO_TXN_SECRET || process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production" && (!configured || configured.length < 32)) {
    throw new Error("SSO requires a random SSO_TXN_SECRET of at least 32 characters");
  }
  return configured || ephemeralTxnSecret;
}

export function encodeSsoTxn(txn: SsoTxn): string {
  const body = Buffer.from(JSON.stringify({ ...txn, expiresAt: txn.expiresAt ?? Date.now() + TXN_TTL_MS }), "utf8").toString("base64url");
  const mac = createHmac("sha256", txnSecret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function decodeSsoTxn(cookie: string | undefined): SsoTxn | null {
  if (!cookie) return null;
  const [body, mac, extra] = cookie.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const expected = createHmac("sha256", txnSecret()).update(body).digest("base64url");
  if (expected.length !== mac.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  try {
    const txn = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SsoTxn;
    if (!txn || typeof txn.state !== "string" || !txn.state || typeof txn.connectionId !== "string" || !txn.connectionId ||
        typeof txn.postLogin !== "string" || typeof txn.expiresAt !== "number" ||
        txn.expiresAt <= Date.now() || txn.expiresAt > Date.now() + TXN_TTL_MS) return null;
    return txn;
  } catch {
    return null;
  }
}

export async function createSsoTxn(txn: SsoTxn): Promise<string> {
  const expiresAt = Date.now() + TXN_TTL_MS;
  const encoded = encodeSsoTxn({ ...txn, expiresAt });
  await db.ssoTransaction.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 3600_000) } } });
  await db.ssoTransaction.create({ data: {
    id: createHash("sha256").update(txn.state).digest("hex"),
    connectionId: txn.connectionId,
    expiresAt: new Date(expiresAt),
  } });
  return encoded;
}

/** Atomically consume state across processes; clearing a browser cookie alone cannot prevent replay. */
export async function consumeSsoTxn(txn: SsoTxn): Promise<boolean> {
  const consumed = await db.ssoTransaction.updateMany({
    where: { id: createHash("sha256").update(txn.state).digest("hex"), connectionId: txn.connectionId,
      consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  return consumed.count === 1;
}

export const SSO_TXN_COOKIE = "docurama_sso_txn";

export function txnCookieAttributes(protocol: "OIDC" | "SAML" = "OIDC", isHttps = process.env.NODE_ENV === "production"): string {
  // SAML arrives via a cross-site POST; browsers require None + Secure for that cookie.
  if (protocol === "SAML") return "Path=/; HttpOnly; SameSite=None; Secure; Max-Age=600";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=600${isHttps ? "; Secure" : ""}`;
}

// ─── Connection lookup ───────────────────────────────────────────────────────

export function normalizeSsoDomain(value: string): string {
  const domain = domainToASCII(value.trim().toLowerCase());
  if (!domain || domain.length > 253 || !domain.includes(".") || !domain.split(".").every(
    (label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
  )) return "";
  return domain;
}

export function emailDomain(email: string): string {
  const parts = email.trim().split("@");
  return parts.length === 2 && parts[0] && !/\s/.test(parts[0]) ? normalizeSsoDomain(parts[1]) : "";
}

/** A connection may assert identities only for an unambiguous verified tenant-owned domain. */
export async function ownsVerifiedSsoDomain(tenantId: string | null, domain: string, client: Prisma.TransactionClient = db): Promise<boolean> {
  if (!tenantId || !domain || normalizeSsoDomain(domain) !== domain) return false;
  const owners = await client.domain.findMany({
    where: { domain, status: "VERIFIED", verifiedAt: { not: null } },
    select: { tenantId: true },
  });
  return owners.length > 0 && owners.every((owner) => owner.tenantId === tenantId);
}

export async function isTrustedSsoConnection(connection: { tenantId: string | null; emailDomain: string; status: string }, client: Prisma.TransactionClient = db): Promise<boolean> {
  if (connection.status !== "ACTIVE" || !await ownsVerifiedSsoDomain(connection.tenantId, connection.emailDomain, client)) return false;
  const tenant = await client.tenant.findUnique({ where: { id: connection.tenantId! }, select: { status: true } });
  return tenant?.status === "ACTIVE" || tenant?.status === "TRIAL";
}

export async function findSsoConnection(email: string) {
  const domain = emailDomain(email);
  if (!domain) return null;
  const connections = await db.ssoConnection.findMany({
    where: { emailDomain: domain, status: "ACTIVE" },
  });
  const trusted: typeof connections = [];
  for (const connection of connections) {
    if (await isTrustedSsoConnection(connection)) trusted.push(connection);
  }
  // Ambiguous authorities fail closed, including records created outside this UI.
  return trusted.length === 1 ? trusted[0] : null;
}

// ─── OIDC ────────────────────────────────────────────────────────────────────

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

const discoveryCache = new Map<string, { doc: OidcDiscovery; at: number }>();
const DISCOVERY_TTL_MS = 10 * 60_000;

export async function oidcDiscovery(issuerUrl: string): Promise<OidcDiscovery> {
  const cached = discoveryCache.get(issuerUrl);
  if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.doc;

  const wellKnown = new URL(issuerUrl);
  if (wellKnown.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && wellKnown.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(wellKnown.hostname))) {
    throw new Error("OIDC issuer must use HTTPS");
  }
  // Well-known resolution per OIDC Discovery: strip trailing slash, append path.
  const base = issuerUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/.well-known/openid-configuration`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Discovery document unavailable (HTTP ${res.status})`);
  const doc = (await res.json()) as OidcDiscovery;
  if (doc.issuer !== issuerUrl) throw new Error("Discovery issuer does not match the configured authority");
  for (const key of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
    if (!doc[key]) throw new Error(`Discovery document missing ${key}`);
    const endpoint = new URL(doc[key]);
    if (endpoint.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && endpoint.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname))) {
      throw new Error("OIDC endpoints must use HTTPS");
    }
  }
  discoveryCache.set(issuerUrl, { doc, at: Date.now() });
  return doc;
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  // S256: base64url(sha256(verifier)) per RFC 7636.
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildOidcAuthorizeUrl(input: {
  discovery: OidcDiscovery;
  clientId: string;
  origin: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  loginHint: string;
}): string {
  const url = new URL(input.discovery.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", `${input.origin}/api/auth/sso/callback/oidc`);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("login_hint", input.loginHint);
  return url.toString();
}

export interface OidcIdentity {
  email: string;
  name: string;
  issuer: string;
}

export async function verifyOidcCallback(input: {
  discovery: OidcDiscovery;
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
  nonce: string;
  origin: string;
}): Promise<OidcIdentity> {
  const tokenRes = await fetch(input.discovery.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: `${input.origin}/api/auth/sso/callback/oidc`,
      code_verifier: input.codeVerifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) throw new Error(`Token exchange failed (HTTP ${tokenRes.status})`);
  const tokens = (await tokenRes.json()) as { id_token?: string; access_token?: string };
  if (!tokens.id_token) throw new Error("Token response missing id_token");

  const jwks = jose.createRemoteJWKSet(new URL(input.discovery.jwks_uri));
  const claims = await jose.jwtVerify(tokens.id_token, jwks, {
    issuer: input.discovery.issuer,
    audience: input.clientId,
    clockTolerance: 60,
  });

  const payload = claims.payload as { nonce?: string; email?: string; email_verified?: boolean; name?: string; preferred_username?: string };
  if (payload.nonce !== input.nonce) throw new Error("id_token nonce mismatch — possible replay");
  if (!payload.email) throw new Error("id_token carries no email claim (require the 'email' scope)");
  if (payload.email_verified !== true) throw new Error("id_token must carry email_verified: true");

  return {
    email: String(payload.email).toLowerCase(),
    name: String(payload.name ?? payload.preferred_username ?? payload.email),
    issuer: claims.payload.iss ?? input.discovery.issuer,
  };
}


// ─── SAML (SP side, via samlify) ─────────────────────────────────────────────

let samlifyReady = false;
async function getSamlify() {
  const samlify = await import("samlify");
  if (!samlifyReady) {
    // XSD validation disabled (signature verification still enforced);
    // the xmllint-wasm validator is an optional peer dependency.
    samlify.setSchemaValidator({
      validate: async () => Promise.resolve(true),
    });
    samlifyReady = true;
  }
  return samlify;
}

/** SP metadata for this instance, generated from the request origin. */
export function spMetadataXml(origin: string): string {
  const entityId = `${origin}/api/auth/sso/metadata/saml`;
  const acs = `${origin}/api/auth/sso/callback/saml`;
  return `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService isDefault="true" index="0" Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acs}"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
}

export async function buildSamlLoginUrl(input: {
  idpMetadataXml: string;
  origin: string;
  relayState: string;
}): Promise<{ url: string; requestId: string }> {
  const samlify = await getSamlify();
  const sp = samlify.ServiceProvider({ metadata: spMetadataXml(input.origin) });
  const idp = samlify.IdentityProvider({ metadata: input.idpMetadataXml });
  const { context, id } = await sp.createLoginRequest(idp, "redirect");
  const url = new URL(String(context));
  url.searchParams.set("RelayState", input.relayState);
  if (!id) throw new Error("SAML request has no ID");
  return { url: url.toString(), requestId: id };
}

export interface SamlIdentity {
  email: string;
  name: string;
  issuer: string;
}

export async function verifySamlResponse(input: {
  idpMetadataXml: string;
  origin: string;
  samlResponse: string;
  requestId: string;
}): Promise<SamlIdentity> {
  const samlify = await getSamlify();
  const sp = samlify.ServiceProvider({ metadata: spMetadataXml(input.origin) });
  const idp = samlify.IdentityProvider({ metadata: input.idpMetadataXml });
  const result = await sp.parseLoginResponse(idp, "post", {
    body: { SAMLResponse: input.samlResponse },
  });
  const extracted = result.extract ?? {};
  // samlify validates the signature and conditions but leaves SP request,
  // audience and bearer-recipient correlation to the application.
  const [verified, assertion] = samlify.SamlLib.verifySignature(result.samlContent, { metadata: idp.entityMeta });
  if (!verified || !assertion || !input.requestId) throw new Error("SAML assertion is not correlated to a login request");
  const confirmation = samlify.Extractor.extract(assertion, [{
    key: "confirmation", localPath: ["Assertion", "Subject", "SubjectConfirmation", "SubjectConfirmationData"],
    attributes: ["InResponseTo", "Recipient", "NotOnOrAfter"],
  }]).confirmation as Record<string, string> | undefined;
  const acs = `${input.origin}/api/auth/sso/callback/saml`;
  if (extracted.response?.inResponseTo !== input.requestId || confirmation?.inResponseTo !== input.requestId) {
    throw new Error("SAML InResponseTo does not match the login request");
  }
  if (extracted.response?.destination !== acs || confirmation?.recipient !== acs) throw new Error("SAML recipient mismatch");
  if (extracted.audience !== `${input.origin}/api/auth/sso/metadata/saml`) throw new Error("SAML audience mismatch");
  const deadline = Date.parse(confirmation.notOnOrAfter);
  if (!Number.isFinite(deadline) || deadline <= Date.now() || !extracted.conditions?.notOnOrAfter) throw new Error("SAML assertion has expired or is missing an expiry");

  const attrs = (extracted.attributes ?? {}) as Record<string, string | string[]>;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const nameId = typeof extracted.nameID === "string" ? extracted.nameID : undefined;
  const email =
    first(attrs["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"]) ??
    first(attrs.email) ??
    first(attrs.mail) ??
    (nameId?.includes("@") ? nameId : undefined);
  if (!email) throw new Error("SAML assertion carries no email attribute or email-format NameID");
  const name =
    first(attrs["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"]) ??
    first(attrs.displayName) ??
    first(attrs.name) ??
    email;

  return {
    email: String(email).toLowerCase(),
    name: String(name),
    issuer: String(first(extracted.issuer) ?? ""),
  };
}

// ─── JIT provisioning + session issuance ─────────────────────────────────────

export interface SsoLoginResult {
  ok: true;
  userId: string;
  email: string;
  sessionId: string;
  created: boolean;
}

/**
 * Find-or-provision the user for a verified SSO identity, enroll them in the
 * connection's tenant when configured, and open a session. Password login is
 * left untouched (the password hash is random and unusable for SSO-created
 * accounts until the user sets one through reset-password).
 */
export async function jitSsoLogin(input: {
  email: string;
  name: string;
  connectionId: string;
  ip: string;
  userAgent: string | null;
  provider: "OIDC" | "SAML";
  issuer: string;
}): Promise<SsoLoginResult> {
  return db.$transaction(async (tx) => {
  const connection = await tx.ssoConnection.findUnique({ where: { id: input.connectionId }, include: { tenant: true } });
  if (!connection || !await isTrustedSsoConnection(connection, tx) || connection.protocol !== input.provider) throw new Error("SSO connection is not a trusted active authority");
  const domain = emailDomain(input.email);
  if (domain !== connection.emailDomain) throw new Error("SSO identity does not belong to the trusted domain");
  const email = `${input.email.trim().split("@")[0].toLowerCase()}@${domain}`;
  if (connection.tenant!.enforceTwoFactor) throw new Error("Use password sign-in with the required second factor");

  let user = await tx.user.findUnique({ where: { email } });
  let created = false;
  if (!user) {
    if ((await seatCapacity(connection.tenantId!, tx)).remaining <= 0) {
      throw new Error("No workspace seat is available for SSO provisioning; contact your administrator");
    }
    const [firstName, ...rest] = input.name.trim().split(/\s+/);
    user = await tx.user.create({
      data: {
        email,
        passwordHash: `sso!${randomBytes(24).toString("hex")}`, // not a valid argon/bcrypt hash — password login disabled
        firstName: firstName || input.email.split("@")[0],
        lastName: rest.join(" ") || "",
        role: "MEMBER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(), // the IdP asserted mailbox control
        activeTenantId: connection.tenantId,
      },
    });
    created = true;
  } else {
    // A tenant IdP is not an authority over platform admins or accounts that
    // can access another tenant. Existing accounts must be explicitly enrolled.
    const memberships = await tx.member.findMany({ where: { userId: user.id } });
    if (user.role === "PLATFORM_ADMIN" || user.status !== "ACTIVE" || !user.emailVerifiedAt ||
        user.totpEnabled || memberships.length !== 1 || memberships[0].tenantId !== connection.tenantId || memberships[0].status !== "ACTIVE") {
      throw new Error("This account cannot be linked automatically to this SSO authority; use password sign-in");
    }
  }

  // Tenant enrollment for tenant-bound connections.
  if (connection.tenantId) {
    const existing = await tx.member.findFirst({ where: { userId: user.id, tenantId: connection.tenantId } });
    if (!existing) {
      await tx.member.create({
        data: { userId: user.id, tenantId: connection.tenantId, role: "MEMBER", status: "ACTIVE" },
      });
    }
  }

  const session = await tx.session.create({
    data: {
      userId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
    },
  });
  await tx.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date(), activeTenantId: connection.tenantId } });
  await tx.auditEvent.create({
    data: {
      actor: `${user.firstName} ${user.lastName}`.trim(),
      actorRole: user.role,
      action: `user.login.sso_${input.provider.toLowerCase()}`,
      resource: `user:${user.email}`,
      ip: input.ip,
      detail: `${input.provider} login via ${connection.label}${created ? " — account JIT-provisioned" : ""} (issuer ${input.issuer})`,
    },
  });

  return { ok: true, userId: user.id, email: user.email, sessionId: session.id, created };
  });
}

/** A redirect Response that carries the freshly-minted session cookie. */
export function ssoSessionRedirect(sessionId: string, postLogin: string, req: Request): Response {
  const target = safeSsoRedirect(postLogin);
  const res = new Response(null, { status: 302, headers: { location: target } });
  res.headers.append("set-cookie", `${SESSION_COOKIE}=${sessionId}; ${sessionCookieAttributes(req as never)}`);
  res.headers.append("set-cookie", `${SSO_TXN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
}

export function safeSsoRedirect(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") && !/[\\\r\n]/.test(path) ? path : "/";
}
