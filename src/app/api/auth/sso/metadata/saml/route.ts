import { NextRequest, NextResponse } from "next/server";
import { spMetadataXml } from "@/lib/sso";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/sso/metadata/saml — this instance's SP metadata, generated
 * from the request origin so admins can register the exact ACS/EntityID in
 * their IdP without editing XML by hand.
 */
export async function GET(req: NextRequest) {
  const xml = spMetadataXml(new URL(req.url).origin);
  return new NextResponse(xml, {
    status: 200,
    headers: { "content-type": "application/samlmetadata+xml" },
  });
}
