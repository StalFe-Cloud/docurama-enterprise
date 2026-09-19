import { NextRequest, NextResponse } from "next/server";
import { findSsoConnection } from "@/lib/sso";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/sso/lookup?email=… — does this email's domain have SSO?
 * Public, used by the login screen to offer the SSO path. Reveals only the
 * connection label and protocol — never client secrets or redirect config.
 */
export async function GET(req: NextRequest) {
  const email = new URL(req.url).searchParams.get("email") ?? "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ sso: false });
  }
  try {
    const connection = await findSsoConnection(email);
    if (!connection) return NextResponse.json({ sso: false });
    return NextResponse.json({
      sso: true,
      protocol: connection.protocol,
      label: connection.label,
      domain: connection.emailDomain,
    });
  } catch {
    return NextResponse.json({ sso: false });
  }
}
