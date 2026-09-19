import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import {
  buildOidcAuthorizeUrl, buildSamlLoginUrl, createSsoTxn, findSsoConnection,
  oidcDiscovery, pkcePair, safeSsoRedirect, SSO_TXN_COOKIE, txnCookieAttributes,
} from "@/lib/sso";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/sso/start?email=…[&post=/welcome] — begin the SSO flow for
 * the email's domain: 302 to the IdP (OIDC authorize / SAML AuthnRequest)
 * with a signed transaction cookie carrying state, PKCE and nonce.
 */
export async function GET(req: NextRequest) {
  const email = (new URL(req.url).searchParams.get("email") ?? "").trim().toLowerCase();
  const postLogin = new URL(req.url).searchParams.get("post") ?? "/";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.redirect(new URL("/login?sso=invalid-email", new URL(req.url).origin));
  }

  const connection = await findSsoConnection(email);
  if (!connection) {
    return NextResponse.redirect(new URL("/login?sso=none", new URL(req.url).origin));
  }

  const state = randomBytes(24).toString("base64url");
  const origin = new URL(req.url).origin;

  try {
    if (connection.protocol === "OIDC") {
      if (!connection.issuerUrl || !connection.clientId) {
        return NextResponse.redirect(new URL("/login?sso=misconfigured", new URL(req.url).origin));
      }
      const discovery = await oidcDiscovery(connection.issuerUrl);
      const pkce = pkcePair();
      const nonce = randomBytes(24).toString("base64url");
      const txn = await createSsoTxn({
        state, connectionId: connection.id, codeVerifier: pkce.verifier, nonce,
        postLogin: safeSsoRedirect(postLogin),
      });
      const url = buildOidcAuthorizeUrl({
        discovery, clientId: connection.clientId, origin, state, nonce,
        codeChallenge: pkce.challenge, loginHint: email,
      });
      const res = NextResponse.redirect(url);
      res.headers.append("set-cookie", `${SSO_TXN_COOKIE}=${txn}; ${txnCookieAttributes("OIDC", origin.startsWith("https:"))}`);
      return res;
    }

    if (connection.protocol === "SAML") {
      if (!origin.startsWith("https:")) {
        return NextResponse.redirect(new URL("/login?sso=https-required", origin));
      }
      if (!connection.idpMetadataXml) {
        return NextResponse.redirect(new URL("/login?sso=misconfigured", new URL(req.url).origin));
      }
      const { url, requestId } = await buildSamlLoginUrl({
        idpMetadataXml: connection.idpMetadataXml, origin, relayState: state,
      });
      const txn = await createSsoTxn({
        state, connectionId: connection.id, samlRequestId: requestId,
        postLogin: safeSsoRedirect(postLogin),
      });
      const res = NextResponse.redirect(url);
      res.headers.append("set-cookie", `${SSO_TXN_COOKIE}=${txn}; ${txnCookieAttributes("SAML", true)}`);
      return res;
    }

    return NextResponse.redirect(new URL("/login?sso=unknown-protocol", new URL(req.url).origin));
  } catch (err) {
    console.error("sso/start", err);
    return NextResponse.redirect(new URL("/login?sso=error", new URL(req.url).origin));
  }
}
