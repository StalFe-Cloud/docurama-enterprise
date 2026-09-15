import { NextResponse } from "next/server";

/**
 * RFC 9116 security.txt - served on every Docurama host at
 * /.well-known/security.txt. The canonical copy lives on the apex domain.
 * No PGP Encryption field is published because no public key is in use yet;
 * sensitive reports are handled over the security@ mailbox on request.
 */
export function GET() {
  const body = [
    "Contact: mailto:security@docurama.eu",
    "Expires: 2027-09-15T00:00:00.000Z",
    "Preferred-Languages: en, fr",
    "Policy: https://security.docurama.eu/",
    "Canonical: https://docurama.eu/.well-known/security.txt",
    "",
  ].join("\n");
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
