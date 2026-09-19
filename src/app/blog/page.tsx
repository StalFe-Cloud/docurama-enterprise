import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/logo";
import { listBlogPosts, blogTagCloud, formatDate } from "@/lib/blog";
import { ScrollTop } from "@/components/marketing/scroll-top";
import { ArrowRight, CalendarDays, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/blog" },
  title: "Blog · Docurama",
  description:
    "Product news, eIDAS and eSignature deep dives, security engineering and self-hosting guides from the Docurama team.",
  openGraph: {
    title: "Docurama Blog",
    description: "Product news, eIDAS deep dives, security engineering and self-hosting guides.",
    siteName: "Docurama",
    type: "website",
  },
};

export default function BlogIndexPage() {
  const posts = listBlogPosts();
  const tags = blogTagCloud();
  const [latest, ...rest] = posts;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Docurama Blog",
    url: "https://docurama.eu/blog",
    blogPost: posts.slice(0, 10).map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      description: p.description,
      datePublished: p.date,
      author: { "@type": "Organization", name: p.author },
      url: `https://docurama.eu/blog/${p.slug}`,
    })),
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Docurama home"><BrandLogo size="sm" /></Link>
          <nav className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
            <Link href="/docs" className="hover:text-foreground">Documentation</Link>
            <Link href="/verify" className="hover:text-foreground">Verify</Link>
            <Link href="/marketing#pricing" className="hover:text-foreground">Pricing</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">The Docurama Blog</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Evidence-grade signing, explained.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Product announcements, eIDAS and PAdES deep dives, security engineering notes and
            self-hosting guides — written by the team building Docurama in Paris.
          </p>
        </div>

        {tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {tags.map(({ tag, count }) => (
              <span key={tag} className="rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
                {tag} <span className="text-muted-foreground/60">({count})</span>
              </span>
            ))}
          </div>
        )}

        {posts.length === 0 ? (
          <p className="mt-12 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            The first posts are on their way.
          </p>
        ) : (
          <div className="mt-10 space-y-10">
            {latest && (
              <Link
                href={`/blog/${latest.slug}`}
                className="group block rounded-2xl border bg-card p-8 transition-colors hover:border-primary/50"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Latest</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight group-hover:text-primary">{latest.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{latest.description}</p>
                <p className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden /> {formatDate(latest.date)}</span>
                  <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden /> {latest.readingMinutes} min read</span>
                </p>
              </Link>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {rest.map((p) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="group flex flex-col rounded-xl border bg-card p-6 transition-colors hover:border-primary/50"
                >
                  <h2 className="text-base font-semibold leading-snug group-hover:text-primary">{p.title}</h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{p.description}</p>
                  <p className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden /> {formatDate(p.date)}</span>
                    <span className="inline-flex items-center gap-1 font-medium text-primary">
                      Read <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <p>© 2026 Docurama SAS · Paris, France</p>
          <div className="flex gap-4">
            <Link href="/docs" className="hover:text-foreground">Documentation</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
            <Link href="/security" className="hover:text-foreground">Security</Link>
          </div>
        </div>
      </footer>

      <ScrollTop />
    </div>
  );
}
