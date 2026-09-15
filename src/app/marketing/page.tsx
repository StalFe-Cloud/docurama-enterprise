import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  title: "Docurama - Sign documents. Prove everything.",
  description:
    "EU-built eSignatures with cryptographic evidence: X.509 sealing, RFC 3161 timestamps, GDPR, eIDAS-aligned and 21 CFR Part 11 workflows.",
};

/** Always-on marketing preview (the conditional version lives at `/`). */
export default function MarketingPreviewPage() {
  return <MarketingPage />;
}
