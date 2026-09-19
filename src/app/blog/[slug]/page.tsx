import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/logo";
import { getBlogPost, listBlogPosts, formatDate } from "@/lib/blog";
import { MarkdownBody } from "@/components/docs/markdown-body";
import { ScrollTop } from "@/components/marketing/scroll-top";
import { ArrowLeft, CalendarDays, Clock, User } from "lucide-react";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return listBlogPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return { title: "Post not found · Docurama" };
  return {
    alternates: { canonical: `/blog/${post.slug}` },
    title: `${post.title} · Docurama Blog`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      siteName: "Docurama",
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const related = listBlogPosts()
    .filter((p) => p.slug !== post.slug && p.tags.some((t) => post.tags.includes(t)))
    .slice(0, 2);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { "@type": "Organization", name: post.author },
    publisher: { "@type": "Organization", name: "Docurama SAS" },
    mainEntityOfPage: `https://docurama.eu/blog/${post.slug}`,
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/blog" aria-label="Docurama blog" className="flex items-center gap-2.5">
            <BrandLogo size="sm" />
            <span className="text-xs font-medium text-muted-foreground">Blog</span>
          </Link>
          <Link href="/docs" className="text-xs font-medium text-muted-foreground hover:text-foreground">
            Documentation
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <article>
          <div className="flex flex-wrap gap-2">
            {post.tags.map((t) => (
              <span key={t} className="rounded-full border bg-card px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">{t}</span>
            ))}
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{post.title}</h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{post.description}</p>
          <div className="mt-4 flex flex-wrap items-center gap-4 border-b pb-6 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5" aria-hidden /> {post.author}</span>
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden /> {formatDate(post.date)}</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden /> {post.readingMinutes} min read</span>
          </div>

          <MarkdownBody>{post.content}</MarkdownBody>
        </article>

        {related.length > 0 && (
          <section className="mt-14 border-t pt-8" aria-label="Related posts">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Keep reading</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {related.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary/50">
                  <h2 className="text-sm font-semibold leading-snug group-hover:text-primary">{p.title}</h2>
                  <p className="mt-1.5 text-xs text-muted-foreground">{formatDate(p.date)}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="mt-10 border-t pt-6">
          <Link href="/blog" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All posts
          </Link>
        </div>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <p>© 2026 Docurama SAS · Paris, France</p>
          <div className="flex gap-4">
            <Link href="/docs" className="hover:text-foreground">Documentation</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
          </div>
        </div>
      </footer>

      <ScrollTop />
    </div>
  );
}
