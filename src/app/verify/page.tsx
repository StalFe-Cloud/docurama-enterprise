import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { PortalRoot } from "@/components/portal/portal-root";
import { PublicVerify } from "@/components/marketing/public-verify";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verify a document",
  description:
    "Check a Docurama verification code and confirm the signatures, seal and SHA-256 digest of a completed document. No account needed.",
};

/**
 * /verify - the public verification portal.
 *
 * Anonymous visitors (marketing-site traffic, counterparties holding a
 * verification code) get the standalone public tool backed by the keyless
 * /api/v1/verify endpoint. Signed-in members keep the in-app experience with
 * workspace navigation.
 */
export default async function VerifyPage() {
  const me = await getSessionUser();
  if (me) return <PortalRoot />;
  return <PublicVerify />;
}
