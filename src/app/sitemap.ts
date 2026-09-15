import type { MetadataRoute } from "next";

/** Public sitemap for the docurama.eu marketing and trust surfaces. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://docurama.eu";
  const now = new Date();
  const routes: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" },
    { path: "/marketing", priority: 0.8, changeFrequency: "weekly" },
    { path: "/verify", priority: 0.9, changeFrequency: "weekly" },
    { path: "/docs", priority: 0.8, changeFrequency: "weekly" },
    { path: "/developers", priority: 0.7, changeFrequency: "weekly" },
    { path: "/status", priority: 0.7, changeFrequency: "daily" },
    { path: "/security", priority: 0.6, changeFrequency: "monthly" },
    { path: "/welcome", priority: 0.8, changeFrequency: "weekly" },
    { path: "/login", priority: 0.5, changeFrequency: "monthly" },
  ];
  return routes.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
