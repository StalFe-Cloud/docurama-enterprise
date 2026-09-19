import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  consumeSsoTxn, decodeSsoTxn, emailDomain, isTrustedSsoConnection, jitSsoLogin, ssoSessionRedirect, SSO_TXN_COOKIE, verifySamlResponse,
} from "@/lib/sso";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/sso/callback/saml — the SAML Assertion Consumer Service.
 * The IdP posts SAMLResponse + RelayState here; the signature-verified
 * assertion JIT-logs the matching user in.
 */
export async function POST(req: NextRequest) {
  const txn = decodeSsoTxn(req.cookies.get(SSO_TXN_COOKIE)?.value);

  const form = await req.formData().catch(() => null);
  const samlResponse = String(form?.get("SAMLResponse") ?? "");
  const relayState = String(form?.get("RelayState") ?? "");

  if (!txn || !samlResponse || !txn.samlRequestId) {
    return NextResponse.redirect(new URL("/login?sso=expired", new URL(req.url).origin), { status: 303 });
  }
  if (!relayState || relayState !== txn.state) {
    return NextResponse.redirect(new URL("/login?sso=state-mismatch", new URL(req.url).origin), { status: 303 });
  }

  const connection = await db.ssoConnection.findUnique({ where: { id: txn.connectionId } });
  if (!connection || !await isTrustedSsoConnection(connection) || connection.protocol !== "SAML" || !connection.idpMetadataXml) {
    return NextResponse.redirect(new URL("/login?sso=misconfigured", new URL(req.url).origin), { status: 303 });
  }

  try {
    if (!await consumeSsoTxn(txn)) return NextResponse.redirect(new URL("/login?sso=expired", new URL(req.url).origin), { status: 303 });
    const identity = await verifySamlResponse({
      idpMetadataXml: connection.idpMetadataXml,
      origin: new URL(req.url).origin,
      samlResponse,
      requestId: txn.samlRequestId,
    });
    if (emailDomain(identity.email) !== connection.emailDomain) {
      return NextResponse.redirect(new URL("/login?sso=domain-mismatch", new URL(req.url).origin), { status: 303 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
    const login = await jitSsoLogin({
      email: identity.email,
      name: identity.name,
      connectionId: connection.id,
      ip,
      userAgent: req.headers.get("user-agent")?.slice(0, 250) ?? null,
      provider: "SAML",
      issuer: identity.issuer,
    });
    return ssoSessionRedirect(login.sessionId, txn.postLogin, req);
  } catch (err) {
    console.error("sso/callback/saml", err);
    return NextResponse.redirect(new URL("/login?sso=error", new URL(req.url).origin), { status: 303 });
  }
}
