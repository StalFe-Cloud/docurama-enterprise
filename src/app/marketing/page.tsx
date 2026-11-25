import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing/marketing-page";

export const metadata: Metadata = {
  alternates: { canonical: "/" }, // marketing preview mirrors the homepage
  title: "Docurama - Sign documents. Record evidence.",
  description:
    "Email-link document signing with typed adoption, immutable contract terms, explicit consent and digest evidence.",
};

/** Always-on marketing preview (the conditional version lives at `/`). */
export default function MarketingPreviewPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // Structured data limited to verifiable facts about the organization.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "VOIRIA SASU",
            alternateName: "Docurama",
            url: "https://docurama.eu",
            logo: "https://docurama.eu/brand/docurama-mark.svg",
            email: "support@docurama.eu",
            address: {
              "@type": "PostalAddress",
              streetAddress: "1 Rue Marguerin",
              postalCode: "75014",
              addressLocality: "Paris",
              addressCountry: "FR",
            },
            contactPoint: [
              { "@type": "ContactPoint", contactType: "customer support", email: "support@docurama.eu", availableLanguage: ["en", "fr"] },
              { "@type": "ContactPoint", contactType: "sales", email: "sales@docurama.eu" },
              { "@type": "ContactPoint", contactType: "privacy", email: "privacy@docurama.eu" },
            ],
          }),
        }}
      />
      <MarketingPage />
    </>
  );
}
