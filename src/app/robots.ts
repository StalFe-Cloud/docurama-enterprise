import type { MetadataRoute } from "next";

/**
 * robots.txt for docurama.eu. Public surfaces (marketing, verify, docs,
 * status, security, welcome, login) are crawlable. Authenticated portal
 * surfaces and internal APIs are not.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/settings",
          "/documents",
          "/templates",
          "/api/admin",
          "/api/workspace",
          "/api/auth",
          "/api/onboarding",
          "/api/invitations",
          "/invite/",
        ],
      },
    ],
    sitemap: "https://docurama.eu/sitemap.xml",
  };
}
