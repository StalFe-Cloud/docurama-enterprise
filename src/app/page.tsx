import { headers } from "next/headers";
import type { Metadata } from "next";
import { PortalRoot } from "@/components/portal/portal-root";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { getSessionUser } from "@/lib/auth";
import { PLAN_CATALOG, PLAN_ORDER } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const hdrs = await headers();
  const host = (hdrs.get("host") ?? "").toLowerCase();
  if (host.startsWith("app.")) return {};
  const me = await getSessionUser();
  if (me) return {};
  return {
    title: "Docurama: Sign documents. Record evidence.",
    description:
      "Email-link document signing with typed adoption, immutable contract terms, explicit consent and digest evidence.",
    alternates: { canonical: "/" },
    openGraph: {
      title: "Docurama: Sign documents. Record evidence.",
      description:
        "Email-link document signing with typed adoption, immutable contract terms, explicit consent and digest evidence.",
      siteName: "Docurama",
      images: ["/brand/og-image.png"],
      type: "website",
    },
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

  return (
    <>
      <script
        type="application/ld+json"
        // Structured product data: one Offer per plan, generated from the
        // live catalogue so the markup can never drift from the pricing grid.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: "Docurama eSignature",
            description:
              "Email-link document signing with typed adoption, immutable contract terms, explicit consent and digest evidence.",
            brand: { "@type": "Brand", name: "Docurama" },
            offers: PLAN_ORDER.filter((c) => c !== "ENTERPRISE").map((code) => {
              const p = PLAN_CATALOG[code];
              return {
                "@type": "Offer",
                name: `${p.name} plan`,
                price: p.monthlyEur.toFixed(2),
                priceCurrency: "EUR",
                url: "https://docurama.eu/#pricing",
                availability: "https://schema.org/InStock",
                priceSpecification: {
                  "@type": "UnitPriceSpecification",
                  price: p.monthlyEur.toFixed(2),
                  priceCurrency: "EUR",
                  billingIncrement: 1,
                  unitCode: "MON",
                },
              };
            }),
          }),
        }}
      />
      <script
        type="application/ld+json"
        // Structured data limited to verifiable facts about the organization.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Docurama SAS",
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
