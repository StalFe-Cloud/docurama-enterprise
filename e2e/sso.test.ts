/// <reference types="bun-types" />

/**
 * SSO E2E — OIDC and SAML wiring, hermetic.
 *
 * Run: bun test e2e/sso.test.ts   (run.sh wires a scratch DATABASE_URL)
 * Own process — it owns SSO_TXN_SECRET and spawns a stub OIDC provider.
 *
 * Covered:
 *  1. transaction-cookie sign/verify (tamper → rejected);
 *  2. OIDC: discovery, authorize URL (PKCE + nonce), full code exchange
 *     against a stub provider with a jose-signed id_token, nonce mismatch
 *     rejection, domain-bound JIT login (user + member + session + audit);
 *  3. SAML: SP metadata generation, a samlify-signed AuthnResponse
 *     round-trip (openssl-generated IdP key/cert), attribute extraction,
 *     JIT login;
 *  4. routes: lookup answers for matching/unknown domains, SP metadata
 *     endpoint serves valid XML.
 */

import { describe, expect, test, mock, afterAll } from "bun:test";
import { rmSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import * as jose from "jose";
import { NextRequest } from "next/server";
import { Database } from "bun:sqlite";

/* ── Scratch database ──────────────────────────────────────────────────────── */

const SCRATCH = join(mkdtempSync(join(tmpdir(), "sso-e2e-")), "scratch.db");
process.env.DATABASE_URL = `file:${SCRATCH.replace(/\\/g, "/")}`;
new Database(SCRATCH, { create: true }).close();
execFileSync("node", ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: process.env, stdio: "pipe" });
process.env.SSO_TXN_SECRET = "sso-e2e-secret";

let sessionToken: string | undefined;
mock.module("next/headers", () => ({
  cookies: async () => ({ get: () => sessionToken ? { value: sessionToken } : undefined }),
  headers: async () => new Headers(),
}));
const { db } = await import("../src/lib/db");

const lib = await import("../src/lib/sso");

/* ── Stub OIDC provider (discovery + authorize + token + JWKS) ─────────────── */

const ISSUER_PATH = "/idp";
const oidcStub = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === `${ISSUER_PATH}/.well-known/openid-configuration`) {
      return Response.json({
        issuer: `${url.origin}${ISSUER_PATH}`,
        authorization_endpoint: `${url.origin}${ISSUER_PATH}/authorize`,
        token_endpoint: `${url.origin}${ISSUER_PATH}/token`,
        jwks_uri: `${url.origin}${ISSUER_PATH}/jwks.json`,
      });
    }
    if (req.method === "GET" && url.pathname === `${ISSUER_PATH}/jwks.json`) {
      return Response.json(jwks);
    }
    if (req.method === "GET" && url.pathname === `${ISSUER_PATH}/authorize`) {
      // A compliant IdP would render a login page; the test drives the code
      // exchange directly, so just acknowledge.
      return new Response("authorize", { status: 200 });
    }
    if (req.method === "POST" && url.pathname === `${ISSUER_PATH}/token`) {
      const body = new URLSearchParams(await req.text());
      const code = body.get("code") ?? "";
      const issued = issuedTokens.get(code);
      if (!issued) return Response.json({ error: "invalid_grant" }, { status: 400 });
      issuedTokens.delete(code);
      return Response.json(issued);
    }
    return new Response("not found", { status: 404 });
  },
});

const ISSUER = `http://127.0.0.1:${oidcStub.port}${ISSUER_PATH}`;
const issuedTokens = new Map<string, { id_token: string; access_token: string }>();

const { publicKey, privateKey } = await jose.generateKeyPair("RS256", { extractable: true });
const jwks = {
  keys: [{ ...(await jose.exportJWK(publicKey)), alg: "RS256", use: "sig", kid: "sso-e2e-key" }],
};

async function issueOidcToken(code: string, claims: Record<string, unknown>) {
  const id_token = await new jose.SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "sso-e2e-key" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience("sso-e2e-client")
    .setExpirationTime("5m")
    .sign(privateKey);
  issuedTokens.set(code, { id_token, access_token: "at_test" });
}

/* ── Fixtures: tenant + SSO connections ────────────────────────────────────── */

const tenant = await db.tenant.create({ data: { name: "SSO test", slug: "sso-test", status: "ACTIVE", planCode: "ENTERPRISE" } });

const SSO_DOMAIN = "ssotest.example";
for (const domain of [SSO_DOMAIN, "samlexample.test"]) {
  await db.domain.create({ data: { tenantId: tenant.id, domain, token: "test-domain-proof", status: "VERIFIED", verifiedAt: new Date() } });
}

await db.ssoConnection.create({
  data: {
    tenantId: tenant.id,
    protocol: "OIDC",
    label: "SSO E2E Entra",
    emailDomain: SSO_DOMAIN,
    issuerUrl: ISSUER,
    clientId: "sso-e2e-client",
    clientSecret: "sso-e2e-secret-value",
  },
});

/* SAML IdP material (openssl-generated key + cert, embedded in metadata). */

const tmp = mkdtempSync(join(tmpdir(), "sso-idp-"));
const keyPath = join(tmp, "idp-key.pem");
const certPath = join(tmp, "idp-cert.pem");
const openssl = process.platform === "win32" && existsSync("C:/Program Files/Git/usr/bin/openssl.exe") ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl";
execFileSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-keyout", keyPath, "-out", certPath,
  "-nodes", "-subj", "/CN=idp.ssotest.example", "-days", "2"], { stdio: "pipe" });
const idpKey = await Bun.file(keyPath).text();
const idpCertMod = (await Bun.file(certPath).text())
  .replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");

const IDP_ENTITY_ID = "https://idp.ssotest.example/metadata";
const idpMetadataXml = `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${IDP_ENTITY_ID}">
  <md:IDPSSODescriptor WantAuthnRequestsSigned="false" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data><ds:X509Certificate>${idpCertMod}</ds:X509Certificate></ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.ssotest.example/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

await db.ssoConnection.create({
  data: {
    tenantId: tenant.id,
    protocol: "SAML",
    label: "SSO E2E SAML",
    emailDomain: "samlexample.test",
    idpMetadataXml,
  },
});

afterAll(async () => {
  await db.$disconnect();
  oidcStub.stop(true);
  rmSync(join(SCRATCH, ".."), { recursive: true, force: true });
  rmSync(tmp, { recursive: true, force: true });
  mock.restore();
});

/* ── 1. Transaction cookie ─────────────────────────────────────────────────── */

describe("sso transaction cookie", () => {
  test("round-trips and rejects tampering", () => {
    const txn = { state: "abc", connectionId: "c1", postLogin: "/welcome", nonce: "n", codeVerifier: "v", expiresAt: Date.now() + 60_000 };
    const encoded = lib.encodeSsoTxn(txn);
    expect(lib.decodeSsoTxn(encoded)).toEqual(txn);
    expect(lib.decodeSsoTxn(undefined)).toBeNull();
    expect(lib.decodeSsoTxn("garbage")).toBeNull();
    const [body] = encoded.split(".");
    expect(lib.decodeSsoTxn(`${body}.forged`)).toBeNull();
  });

  test("expired, malformed and replayed transactions are rejected", async () => {
    expect(lib.decodeSsoTxn(lib.encodeSsoTxn({ state: "expired", connectionId: "c1", postLogin: "/", expiresAt: Date.now() - 1 }))).toBeNull();
    expect(lib.decodeSsoTxn(`${lib.encodeSsoTxn({ state: "abc", connectionId: "c1", postLogin: "/" })}.extra`)).toBeNull();
    const encoded = await lib.createSsoTxn({ state: "single-use-state", connectionId: "c1", postLogin: "/" });
    const txn = lib.decodeSsoTxn(encoded)!;
    const results = await Promise.all([lib.consumeSsoTxn(txn), lib.consumeSsoTxn(txn)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  test("SAML cookies support cross-site POST and redirects remain local", () => {
    expect(lib.txnCookieAttributes("SAML", true)).toContain("SameSite=None; Secure");
    expect(lib.txnCookieAttributes("OIDC", true)).toContain("SameSite=Lax");
    for (const path of ["//evil.example", "/\\evil.example", "https://evil.example", "/\r\nLocation: evil"]) {
      expect(lib.safeSsoRedirect(path)).toBe("/");
    }
    expect(lib.safeSsoRedirect("/welcome?step=verify")).toBe("/welcome?step=verify");
  });
});

/* ── 2. OIDC ───────────────────────────────────────────────────────────────── */

describe("oidc flow", () => {
  test("connection lookup matches by email domain", async () => {
    const conn = await lib.findSsoConnection(`someone@${SSO_DOMAIN}`);
    expect(conn?.protocol).toBe("OIDC");
    expect(conn?.label).toBe("SSO E2E Entra");
    expect(await lib.findSsoConnection("nobody@unknown.example")).toBeNull();
  });

  test("discovery resolves the endpoints", async () => {
    const doc = await lib.oidcDiscovery(ISSUER);
    expect(doc.authorization_endpoint).toContain("/authorize");
    expect(doc.token_endpoint).toContain("/token");
    expect(doc.jwks_uri).toContain("/jwks.json");
  });

  test("authorize URL carries PKCE, nonce, state and login hint", () => {
    const pkce = lib.pkcePair();
    expect(pkce.verifier.length).toBeGreaterThanOrEqual(43);
    const url = new URL(lib.buildOidcAuthorizeUrl({
      discovery: {
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks.json`,
      },
      clientId: "sso-e2e-client",
      origin: "http://127.0.0.1:3000",
      state: "st1", nonce: "n1", codeChallenge: pkce.challenge, loginHint: "a@b.c",
    }));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(pkce.challenge);
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3000/api/auth/sso/callback/oidc");
    expect(url.searchParams.get("login_hint")).toBe("a@b.c");
  });

  test("full code exchange verifies signature, issuer, audience and nonce", async () => {
    const nonce = "nonce-123";
    await issueOidcToken("good-code", { email: `ada@${SSO_DOMAIN}`, email_verified: true, name: "Ada Lovelace", nonce });
    const discovery = await lib.oidcDiscovery(ISSUER);
    const identity = await lib.verifyOidcCallback({
      discovery, clientId: "sso-e2e-client", clientSecret: "sso-e2e-secret-value",
      code: "good-code", codeVerifier: "v", nonce, origin: "http://127.0.0.1:3000",
    });
    expect(identity.email).toBe(`ada@${SSO_DOMAIN}`);
    expect(identity.name).toBe("Ada Lovelace");
    expect(identity.issuer).toBe(ISSUER);
  });

  test("a nonce mismatch is rejected (replay protection)", async () => {
    await issueOidcToken("replay-code", { email: `eve@${SSO_DOMAIN}`, email_verified: true, name: "Eve", nonce: "original" });
    const discovery = await lib.oidcDiscovery(ISSUER);
    await expect(lib.verifyOidcCallback({
      discovery, clientId: "sso-e2e-client", clientSecret: "sso-e2e-secret-value",
      code: "replay-code", codeVerifier: "v", nonce: "different", origin: "http://127.0.0.1:3000",
    })).rejects.toThrow(/nonce/);
  });

  test("OIDC requires literal true mailbox verification, including absent and malformed claims", async () => {
    for (const [index, value] of [undefined, false, "true", 1, null].entries()) {
      const code = `unverified-code-${index}`;
      await issueOidcToken(code, { email: `eve@${SSO_DOMAIN}`, ...(value === undefined ? {} : { email_verified: value }), nonce: "n" });
      await expect(lib.verifyOidcCallback({
        discovery: await lib.oidcDiscovery(ISSUER), clientId: "sso-e2e-client", clientSecret: "test",
        code, codeVerifier: "v", nonce: "n", origin: "http://127.0.0.1:3000",
      })).rejects.toThrow(/email_verified/);
    }
  });

  test("JIT login provisions the user, enrolls them in the tenant and opens a session", async () => {
    const conn = await lib.findSsoConnection(`grace@${SSO_DOMAIN}`);
    expect(conn).toBeTruthy();
    const login = await lib.jitSsoLogin({
      email: `grace@${SSO_DOMAIN}`, name: "Grace Hopper",
      connectionId: conn!.id, ip: "10.0.0.9", userAgent: "sso-e2e",
      provider: "OIDC", issuer: ISSUER,
    });
    expect(login.created).toBe(true);

    const user = await db.user.findUnique({ where: { email: `grace@${SSO_DOMAIN}` } });
    expect(user?.status).toBe("ACTIVE");
    expect(user?.emailVerifiedAt).toBeTruthy();
    // SSO accounts cannot fall back to password login (hash is not a real one).
    expect(user?.passwordHash.startsWith("sso!")).toBe(true);

    const member = await db.member.findFirst({ where: { userId: user!.id, tenantId: tenant.id } });
    expect(member?.role).toBe("MEMBER");

    const session = await db.session.findUnique({ where: { id: login.sessionId } });
    expect(session?.userId).toBe(user!.id);

    const audit = await db.auditEvent.findFirst({ where: { action: "user.login.sso_oidc", resource: `user:grace@${SSO_DOMAIN}` } });
    expect(audit?.detail).toContain("JIT-provisioned");

    // Second login: same user, no duplicate, no re-provision.
    const second = await lib.jitSsoLogin({
      email: `grace@${SSO_DOMAIN}`, name: "Grace Hopper",
      connectionId: conn!.id, ip: "10.0.0.9", userAgent: "sso-e2e",
      provider: "OIDC", issuer: ISSUER,
    });
    expect(second.created).toBe(false);
    expect(await db.member.count({ where: { userId: user!.id, tenantId: tenant.id } })).toBe(1);
  });
});

/* ── 3. SAML ───────────────────────────────────────────────────────────────── */

describe("saml flow", () => {
  test("SP metadata is generated from the origin with the ACS bound", () => {
    const xml = lib.spMetadataXml("http://127.0.0.1:3000");
    expect(xml).toContain('entityID="http://127.0.0.1:3000/api/auth/sso/metadata/saml"');
    expect(xml).toContain('Location="http://127.0.0.1:3000/api/auth/sso/callback/saml"');
    expect(xml).toContain('WantAssertionsSigned="true"');
  });

  test("a signed AuthnResponse round-trips: extraction, signature and JIT login", async () => {
    const samlify = await import("samlify");
    const sp = samlify.ServiceProvider({ metadata: lib.spMetadataXml("http://127.0.0.1:3000") });
    const idp = samlify.IdentityProvider({ metadata: idpMetadataXml, privateKey: idpKey });
    const { context } = await idp.createLoginResponse(
      sp,
      { extract: { request: { id: "request-123" } } },
      "post",
      { email: "alan@samlexample.test" },
      undefined as never,
    );
    // Post-binding context is already the base64 SAMLResponse form value.
    const samlResponse = String(context);

    const identity = await lib.verifySamlResponse({
      idpMetadataXml, origin: "http://127.0.0.1:3000", samlResponse, requestId: "request-123",
    });
    // The default template maps user.email to the NameID; the lib falls back
    // to the email-format NameID when no attribute statement is present.
    expect(identity.email).toBe("alan@samlexample.test");
    expect(identity.issuer).toContain("idp.ssotest.example");

    const conn = await lib.findSsoConnection("alan@samlexample.test");
    expect(conn?.protocol).toBe("SAML");
    const login = await lib.jitSsoLogin({
      email: identity.email, name: identity.name,
      connectionId: conn!.id, ip: "10.0.0.9", userAgent: "sso-e2e",
      provider: "SAML", issuer: identity.issuer,
    });
    expect(login.created).toBe(true);
    const audit = await db.auditEvent.findFirst({ where: { action: "user.login.sso_saml", resource: "user:alan@samlexample.test" } });
    expect(audit).toBeTruthy();
  });

  test("a tampered assertion is rejected by signature verification", async () => {
    const samlify = await import("samlify");
    const sp = samlify.ServiceProvider({ metadata: lib.spMetadataXml("http://127.0.0.1:3000") });
    const idp = samlify.IdentityProvider({ metadata: idpMetadataXml, privateKey: idpKey });
    const { context } = await idp.createLoginResponse(sp, null as never, "post", { email: "alan@samlexample.test" }, undefined as never);
    // Re-sign nothing: swap the signed NameID after the fact — the signature
    // no longer covers the document, so verification must fail.
    const xml = Buffer.from(String(context), "base64").toString("utf8")
      .replace("alan@samlexample.test", "mallory@samlexample.test");
    const tampered = Buffer.from(xml, "utf8").toString("base64");
    await expect(lib.verifySamlResponse({
      idpMetadataXml, origin: "http://127.0.0.1:3000", samlResponse: tampered, requestId: "request-123",
    })).rejects.toThrow();
  });

  test("signed assertions are bound to their request, audience and recipient", async () => {
    const samlify = await import("samlify");
    const sp = samlify.ServiceProvider({ metadata: lib.spMetadataXml("https://docurama.test") });
    const idp = samlify.IdentityProvider({ metadata: idpMetadataXml, privateKey: idpKey });
    const { context } = await idp.createLoginResponse(sp, { extract: { request: { id: "original-request" } } }, "post", { email: "alan@samlexample.test" }, undefined as never);
    await expect(lib.verifySamlResponse({ idpMetadataXml, origin: "https://docurama.test", samlResponse: String(context), requestId: "other-request" })).rejects.toThrow(/InResponseTo/);
    await expect(lib.verifySamlResponse({ idpMetadataXml, origin: "https://other.test", samlResponse: String(context), requestId: "original-request" })).rejects.toThrow(/recipient|audience/);
    // Alter only the unsigned response wrapper: the signed bearer confirmation
    // must still bind the assertion to the original request.
    const forgedWrapper = Buffer.from(Buffer.from(String(context), "base64").toString("utf8")
      .replace('InResponseTo="original-request"', 'InResponseTo="other-request"')).toString("base64");
    await expect(lib.verifySamlResponse({ idpMetadataXml, origin: "https://docurama.test", samlResponse: forgedWrapper, requestId: "other-request" })).rejects.toThrow();
  });

  // ── Schema validation (the samlify setSchemaValidator gate) ───────────────
  // samlify requires a schema validator and ships none. Before this gate the
  // validator returned true unconditionally / validated against an empty
  // schema list, so ANY well-formed document reached the assertion extractor.
  // These two cases are what that gate buys; they run ahead of signature
  // verification, not instead of it.

  const b64 = (xml: string) => Buffer.from(xml, "utf8").toString("base64");

  test("a malformed XML payload is rejected with a parser diagnostic", async () => {
    await expect(lib.verifySamlResponse({
      idpMetadataXml,
      origin: "http://127.0.0.1:3000",
      samlResponse: b64('<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"><unclosed></samlp:Response>'),
      requestId: "request-123",
    })).rejects.toThrow(/SAML XML validation failed[\s\S]*parser error/);
  });

  test("a well-formed document that is not schema-valid SAML is rejected", async () => {
    // Well-formed XML in the SAML protocol namespace, but missing the required
    // ID/Version/IssueInstant attributes and <Status>, and carrying a child the
    // protocol XSD does not define. Well-formedness alone lets this through;
    // only real XSD validation rejects it.
    const wellFormedButInvalid = [
      '<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">',
      "  <samlp:NotARealElement>whatever</samlp:NotARealElement>",
      "</samlp:Response>",
    ].join("\n");
    // Assert the xmllint diagnostic, not merely "it threw": this document is
    // rejected by samlify for other reasons too, so a bare toThrow() here
    // passes even with schema validation disabled and proves nothing.
    await expect(lib.verifySamlResponse({
      idpMetadataXml,
      origin: "http://127.0.0.1:3000",
      samlResponse: b64(wellFormedButInvalid),
      requestId: "request-123",
    })).rejects.toThrow(/SAML XML validation failed[\s\S]*Schemas validity error/);
  });
});

describe("SSO tenant trust boundary", () => {
  const login = async (email: string, connectionId?: string) => lib.jitSsoLogin({
    email, name: "Security Test", connectionId: connectionId ?? (await lib.findSsoConnection(`a@${SSO_DOMAIN}`))!.id,
    ip: "127.0.0.1", userAgent: "test", provider: "OIDC", issuer: ISSUER,
  });

  test("unverified, revoked, foreign and ambiguous domain authority is refused at runtime", async () => {
    const foreign = await db.tenant.create({ data: { name: "Foreign", slug: "foreign", status: "ACTIVE" } });
    const conn = await db.ssoConnection.create({ data: { tenantId: foreign.id, protocol: "OIDC", label: "Attacker", emailDomain: "unowned.test", issuerUrl: ISSUER } });
    expect(await lib.findSsoConnection("victim@unowned.test")).toBeNull();
    await expect(login("victim@unowned.test", conn.id)).rejects.toThrow(/trusted/);
    const claim = await db.domain.create({ data: { tenantId: foreign.id, domain: "unowned.test", status: "VERIFIED", token: "unproven" } });
    expect(await lib.findSsoConnection("victim@unowned.test")).toBeNull();
    await db.domain.update({ where: { id: claim.id }, data: { verifiedAt: new Date() } });
    expect(await lib.findSsoConnection("victim@unowned.test")).not.toBeNull();
    await db.domain.update({ where: { id: claim.id }, data: { status: "FAILED" } });
    await expect(login("victim@unowned.test", conn.id)).rejects.toThrow(/trusted/);
    const ambiguous = await db.domain.create({ data: { tenantId: foreign.id, domain: SSO_DOMAIN, status: "VERIFIED", verifiedAt: new Date(), token: "ambiguous" } });
    expect(await lib.findSsoConnection(`victim@${SSO_DOMAIN}`)).toBeNull();
    await db.domain.delete({ where: { id: ambiguous.id } });
    expect(await db.user.count({ where: { email: "victim@unowned.test" } })).toBe(0);
  });

  test("JIT provisioning respects occupied seats and pending membership/invitation reservations", async () => {
    for (const reservation of ["ACTIVE", "PENDING_VERIFICATION", "INVITATION"]) {
      const domain = `${reservation.toLowerCase().replaceAll("_", "-")}.seat-test.example`;
      const workspace = await db.tenant.create({ data: { name: "SSO capacity", slug: `sso-capacity-${reservation}`, planCode: "SOLO", status: "ACTIVE" } });
      await db.domain.create({ data: { tenantId: workspace.id, domain, token: "test", status: "VERIFIED", verifiedAt: new Date() } });
      const connection = await db.ssoConnection.create({ data: { tenantId: workspace.id, protocol: "OIDC", label: "Capacity test", emailDomain: domain, issuerUrl: ISSUER } });
      if (reservation === "INVITATION") {
        await db.invitation.create({ data: { tenantId: workspace.id, email: `invited@${domain}`, token: "sso-capacity-invite", invitedBy: "Owner", expiresAt: new Date(Date.now() + 60_000) } });
      } else {
        await db.user.create({ data: { email: `reserved@${domain}`, firstName: "Reserved", lastName: "Seat", passwordHash: "test", memberships: { create: { tenantId: workspace.id, status: reservation } } } });
      }
      await expect(login(`new@${domain}`, connection.id)).rejects.toThrow(/No workspace seat/);
      expect(await db.user.findUnique({ where: { email: `new@${domain}` } })).toBeNull();
      expect(await db.member.count({ where: { tenantId: workspace.id } })).toBe(reservation === "INVITATION" ? 0 : 1);
    }
  });

  test("concurrent JIT logins cannot consume the final seat twice", async () => {
    const domain = "concurrent-seat.example";
    const workspace = await db.tenant.create({ data: { name: "SSO final seat", slug: "sso-final-seat", planCode: "SOLO", status: "ACTIVE" } });
    await db.domain.create({ data: { tenantId: workspace.id, domain, token: "test", status: "VERIFIED", verifiedAt: new Date() } });
    const connection = await db.ssoConnection.create({ data: { tenantId: workspace.id, protocol: "OIDC", label: "Final seat", emailDomain: domain, issuerUrl: ISSUER } });
    const results = await Promise.allSettled([login(`one@${domain}`, connection.id), login(`two@${domain}`, connection.id)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.member.count({ where: { tenantId: workspace.id } })).toBe(1);
    expect(await db.user.count({ where: { email: { endsWith: `@${domain}` } } })).toBe(1);
  });

  test("existing platform admins and accounts outside the authorized tenant cannot be impersonated", async () => {
    const otherTenant = await db.tenant.create({ data: { name: "Other", slug: "other-accounts", status: "ACTIVE" } });
    const cases = [
      { name: "platform", role: "PLATFORM_ADMIN", memberships: [{ tenantId: tenant.id, status: "ACTIVE" }] },
      { name: "foreign", memberships: [{ tenantId: otherTenant.id, status: "ACTIVE" }] },
      { name: "multi", memberships: [{ tenantId: tenant.id, status: "ACTIVE" }, { tenantId: otherTenant.id, status: "ACTIVE" }] },
      { name: "unaffiliated", memberships: [] },
      { name: "pending", memberships: [{ tenantId: tenant.id, status: "PENDING_VERIFICATION" }] },
      { name: "suspended", status: "SUSPENDED", memberships: [{ tenantId: tenant.id, status: "ACTIVE" }] },
      { name: "mfa", totpEnabled: true, memberships: [{ tenantId: tenant.id, status: "ACTIVE" }] },
      { name: "unverified", emailVerifiedAt: null, memberships: [{ tenantId: tenant.id, status: "ACTIVE" }] },
    ];
    for (const item of cases) {
      const { name, memberships, ...overrides } = item;
      const user = await db.user.create({ data: {
        email: `${name}@${SSO_DOMAIN}`, firstName: "Protected", lastName: name, passwordHash: "not-a-password",
        emailVerifiedAt: new Date(), ...overrides, memberships: { create: memberships },
      } });
      await expect(login(user.email)).rejects.toThrow(/cannot be linked/);
      expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    }
  });

  test("the core login boundary rejects mismatched domains and inactive tenants", async () => {
    const conn = (await lib.findSsoConnection(`person@${SSO_DOMAIN}`))!;
    await expect(login("victim@other.example", conn.id)).rejects.toThrow(/trusted domain/);
    await db.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });
    try { await expect(login(`victim@${SSO_DOMAIN}`, conn.id)).rejects.toThrow(/trusted/); }
    finally { await db.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } }); }
    expect(await db.user.count({ where: { email: "victim@other.example" } })).toBe(0);
  });

  test("workspace configuration create, update and re-enable require verified domain ownership", async () => {
    const admin = await db.user.create({ data: { email: "owner@configuration.test", firstName: "Owner", lastName: "Test", passwordHash: "test", emailVerifiedAt: new Date(), memberships: { create: { tenantId: tenant.id, role: "OWNER" } } } });
    sessionToken = (await db.session.create({ data: { userId: admin.id, expiresAt: new Date(Date.now() + 60_000) } })).id;
    const route = await import("../src/app/api/workspace/sso/route");
    const post = (op: string, data: Record<string, unknown> = {}, id?: string) => route.POST(new NextRequest("https://docurama.test/api/workspace/sso", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, data, id }),
    }));
    const data = { protocol: "OIDC", label: "Test config", emailDomain: "unowned-config.test", issuerUrl: ISSUER, clientId: "client", clientSecret: "test" };
    try {
      expect((await post("create", data)).status).toBe(403);
      const proof = await db.domain.create({ data: { tenantId: tenant.id, domain: "owned-config.test", token: "proof", status: "VERIFIED", verifiedAt: new Date() } });
      const created = await post("create", { ...data, emailDomain: " OWNED-CONFIG.TEST " });
      expect(created.status).toBe(200);
      const { id } = await created.json() as { id: string };
      expect((await post("update", data, id)).status).toBe(403);
      expect((await db.ssoConnection.findUnique({ where: { id } }))?.emailDomain).toBe("owned-config.test");
      expect((await post("toggle", {}, id)).status).toBe(200);
      await db.domain.delete({ where: { id: proof.id } });
      expect((await post("toggle", {}, id)).status).toBe(403);
      expect((await db.ssoConnection.findUnique({ where: { id } }))?.status).toBe("DISABLED");
    } finally { sessionToken = undefined; }
  });
});

/* ── 4. Routes (cookie-free ones, invoked directly) ────────────────────────── */

describe("sso routes", () => {
  test("SAML start sets a cross-site cookie and callback requires matching, single-use state", async () => {
    const start = await import("../src/app/api/auth/sso/start/route");
    const callback = await import("../src/app/api/auth/sso/callback/saml/route");
    const res = await start.GET(new NextRequest("https://docurama.test/api/auth/sso/start?email=route@samlexample.test&post=//evil.example"));
    expect(res.status).toBe(307);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain("SameSite=None; Secure");
    const value = cookie.split(";")[0].split("=")[1];
    const txn = lib.decodeSsoTxn(value)!;
    expect(txn.postLogin).toBe("/");
    expect(txn.samlRequestId).toBeTruthy();
    const samlify = await import("samlify");
    const sp = samlify.ServiceProvider({ metadata: lib.spMetadataXml("https://docurama.test") });
    const idp = samlify.IdentityProvider({ metadata: idpMetadataXml, privateKey: idpKey });
    const { context } = await idp.createLoginResponse(sp, { extract: { request: { id: txn.samlRequestId! } } }, "post", { email: "route@samlexample.test" }, undefined as never);
    const post = (relayState?: string) => callback.POST(new NextRequest("https://docurama.test/api/auth/sso/callback/saml", {
      method: "POST", headers: { cookie: cookie.split(";")[0], "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ SAMLResponse: String(context), ...(relayState ? { RelayState: relayState } : {}) }),
    }));
    expect((await post()).headers.get("location")).toContain("state-mismatch");
    expect((await post("forged-state")).headers.get("location")).toContain("state-mismatch");
    const success = await post(txn.state);
    expect(success.status).toBe(302);
    expect(success.headers.get("location")).toBe("/");
    expect(success.headers.get("set-cookie")).toContain("docurama_session=");
    expect((await post(txn.state)).headers.get("location")).toContain("expired");
    expect(await db.session.count({ where: { user: { email: "route@samlexample.test" } } })).toBe(1);
    const httpStart = await start.GET(new NextRequest("http://docurama.test/api/auth/sso/start?email=route@samlexample.test"));
    expect(httpStart.headers.get("location")).toContain("https-required");
  });

  test("lookup answers for a configured domain and stays silent otherwise", async () => {
    const route = await import("../src/app/api/auth/sso/lookup/route");
    const req = new Request(`http://127.0.0.1:3000/api/auth/sso/lookup?email=ada@${SSO_DOMAIN}`) as never;
    const res = await route.GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sso: boolean; label?: string };
    expect(body.sso).toBe(true);
    expect(body.label).toBe("SSO E2E Entra");

    const none = new Request("http://127.0.0.1:3000/api/auth/sso/lookup?email=x@unknown.example") as never;
    expect(((await (await route.GET(none)).json()) as { sso: boolean }).sso).toBe(false);
  });

  test("SP metadata endpoint serves the XML", async () => {
    const route = await import("../src/app/api/auth/sso/metadata/saml/route");
    const res = await route.GET(new Request("http://127.0.0.1:3000/api/auth/sso/metadata/saml") as never);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("md:EntityDescriptor");
  });
});
