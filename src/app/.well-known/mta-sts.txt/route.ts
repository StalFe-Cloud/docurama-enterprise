import { NextResponse } from "next/server";

/**
 * RFC 8460 MTA-STS policy. Served at /.well-known/mta-sts.txt on every host;
 * the mta-sts.docurama.eu host rewrites all requests here (see middleware).
 * The policy id must change whenever the policy changes - it matches the
 * _mta-sts DNS TXT record id in the provisioning zone (2026091501).
 */
export function GET() {
  const body = [
    "version: STSv1",
    "mode: enforce",
    "mx: mail.docurama.eu",
    "max_age: 604800",
    "",
  ].join("\n");
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=604800" },
  });
}
