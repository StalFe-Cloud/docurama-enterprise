import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /.well-known/security.txt — RFC 9116 security policy discovery.
 * Standard trust signal: tells researchers where to report vulnerabilities.
 */
export async function GET() {
  const body = [
    "Contact: mailto:security@docurama.eu",
    "Expires: 2027-12-31T23:59:59.000Z",
    "Encryption: https://docurama.eu/security",
    "Preferred-Languages: en, fr",
    "Canonical: https://docurama.eu/.well-known/security.txt",
    "Policy: https://docurama.eu/security",
    "",
  ].join("\n");
  return new NextResponse(body, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
