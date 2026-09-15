import { headers } from "next/headers";
import type { Metadata } from "next";
import { PortalRoot } from "@/components/portal/portal-root";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const hdrs = await headers();
  const host = (hdrs.get("host") ?? "").toLowerCase();
  if (host.startsWith("app.")) return {};
  const me = await getSessionUser();
  if (me) return {};
  return {
    title: "Docurama: Sign documents. Prove everything.",
    description:
      "EU-built eSignatures with cryptographic evidence: X.509 sealing, RFC 3161 timestamps, GDPR, eIDAS-aligned and 21 CFR Part 11 workflows.",
  };
}

/**
 * Root entry - host- and session-aware:
 *
 *   app.docurama.eu  → always the application portal
 *   docurama.eu /    → the marketing site for anonymous visitors,
 *   localhost etc.     the workspace for signed-in users (dev UX preserved)
 *
 * An always-available marketing preview also lives at /marketing, and the
 * sign-in screen is reachable explicitly at /login.
 */
export default async function Home() {
  const hdrs = await headers();
  const host = (hdrs.get("host") ?? "").toLowerCase();
  const isAppSubdomain = host.startsWith("app.");

  if (isAppSubdomain) return <PortalRoot />;

  const me = await getSessionUser();
  if (me) return <PortalRoot />;

  return <MarketingPage />;
}
