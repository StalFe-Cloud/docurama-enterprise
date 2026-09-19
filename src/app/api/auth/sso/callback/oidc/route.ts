import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  consumeSsoTxn, decodeSsoTxn, emailDomain, isTrustedSsoConnection, jitSsoLogin, oidcDiscovery, ssoSessionRedirect, SSO_TXN_COOKIE, verifyOidcCallback,
} from "@/lib/sso";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/sso/callback/oidc — the IdP redirects here with code+state.
 * Verifies the transaction cookie, exchanges the code (PKCE), verifies the
 * id_token (signature via JWKS, issuer, audience, nonce), then JIT-logs the
 * user in with a session cookie.
 */
export async function GET(req: NextRequest) {
  const txn = decodeSsoTxn(req.cookies.get(SSO_TXN_COOKIE)?.value);
  const code = new URL(req.url).searchParams.get("code");
  const state = new URL(req.url).searchParams.get("state");

  if (!txn || !code || !txn.nonce || !txn.codeVerifier) {
    return NextResponse.redirect(new URL("/login?sso=expired", new URL(req.url).origin));
  }
  if (state !== txn.state) {
    return NextResponse.redirect(new URL("/login?sso=state-mismatch", new URL(req.url).origin));
  }

  const connection = await db.ssoConnection.findUnique({ where: { id: txn.connectionId } });
  if (!connection || !await isTrustedSsoConnection(connection) || connection.protocol !== "OIDC" || !connection.issuerUrl || !connection.clientId) {
    return NextResponse.redirect(new URL("/login?sso=misconfigured", new URL(req.url).origin));
  }

  try {
    if (!await consumeSsoTxn(txn)) return NextResponse.redirect(new URL("/login?sso=expired", new URL(req.url).origin));
    const discovery = await oidcDiscovery(connection.issuerUrl);
    const identity = await verifyOidcCallback({
      discovery,
      clientId: connection.clientId,
      clientSecret: connection.clientSecret ?? "",
      code,
      codeVerifier: txn.codeVerifier ?? "",
      nonce: txn.nonce ?? "",
      origin: new URL(req.url).origin,
    });

    // The authenticated email must belong to the connection's domain — a
    // mismatching IdP account cannot pivot into another tenant.
    if (emailDomain(identity.email) !== connection.emailDomain) {
      return NextResponse.redirect(new URL("/login?sso=domain-mismatch", new URL(req.url).origin));
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
    const login = await jitSsoLogin({
      email: identity.email,
      name: identity.name,
      connectionId: connection.id,
      ip,
      userAgent: req.headers.get("user-agent")?.slice(0, 250) ?? null,
      provider: "OIDC",
      issuer: identity.issuer,
    });
    return ssoSessionRedirect(login.sessionId, txn.postLogin, req);
  } catch (err) {
    console.error("sso/callback/oidc", err);
    return NextResponse.redirect(new URL("/login?sso=error", new URL(req.url).origin));
  }
}
