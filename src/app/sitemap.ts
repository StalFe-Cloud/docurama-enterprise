import type { MetadataRoute } from "next";
import { listBlogPosts } from "@/lib/blog";

/** Public sitemap for the docurama.eu marketing and trust surfaces. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://docurama.eu";
  const now = new Date();
  const routes: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" | "yearly" }[] = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" },
    { path: "/marketing", priority: 0.8, changeFrequency: "weekly" },
    { path: "/verify", priority: 0.9, changeFrequency: "weekly" },
    { path: "/docs", priority: 0.8, changeFrequency: "weekly" },
    { path: "/developers", priority: 0.7, changeFrequency: "weekly" },
    { path: "/status", priority: 0.7, changeFrequency: "daily" },
    { path: "/security", priority: 0.6, changeFrequency: "monthly" },
    { path: "/enterprise", priority: 0.7, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.4, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.4, changeFrequency: "yearly" },
    { path: "/modeles-de-contrats", priority: 0.6, changeFrequency: "weekly" },
    { path: "/mail", priority: 0.2, changeFrequency: "yearly" },
    { path: "/welcome", priority: 0.8, changeFrequency: "weekly" },
    { path: "/login", priority: 0.5, changeFrequency: "monthly" },
    { path: "/blog", priority: 0.7, changeFrequency: "weekly" },
  ];
  const posts = listBlogPosts().map((p) => ({
    url: `${base}/blog/${p.slug}`,
    lastModified: new Date(`${p.date}T00:00:00Z`),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));
  return [
    ...routes.map((r) => ({
      url: `${base}${r.path}`,
      lastModified: now,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    })),
    ...posts,
  ];
}
