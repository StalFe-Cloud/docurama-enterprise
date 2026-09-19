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
          "/sign",
          "/reset-password",
          "/api/admin",
          "/api/workspace",
          "/api/auth",
          "/api/onboarding",
          "/api/invitations",
          "/api/sign",
          "/api/enterprise-lead",
          "/invite/",
        ],
      },
    ],
    sitemap: "https://docurama.eu/sitemap.xml",
  };
}
