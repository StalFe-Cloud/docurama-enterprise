import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BrandLogo, BRAND_LEGAL_NAME } from "@/components/brand/logo";
import { getDocArticle, getDocsNav } from "@/lib/docs";
import { ScrollTop } from "@/components/marketing/scroll-top";
import { ArrowLeft, BookOpen, ChevronRight, FileCode, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocsSearch } from "@/components/docs/docs-search";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocArticle(slug);
  if (!doc) return { title: "Documentation · Docurama" };

  return {
    title: `${doc.meta.title} · Docurama Documentation`,
    description: doc.meta.description || "Docurama developer and user documentation.",
  };
}

export default async function DocArticlePage({ params }: Props) {
  const { slug } = await params;
  const doc = getDocArticle(slug);
  if (!doc) notFound();

  const nav = getDocsNav();
  const currentPath = slug.join("/");
  const searchItems = nav.flatMap((group) =>
    group.items.map((item) => ({ ...item, group: group.name }))
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <BrandLogo size="sm" />
            <span className="hidden sm:inline-block text-xs font-medium text-muted-foreground border-l pl-4">
              Documentation
            </span>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <DocsSearch items={searchItems} />
            <LanguageSwitcher />
            <Link href="/docs/legal" className="hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Conformité légale
            </Link>
            <Link href="/docs/llms.txt" className="hover:text-foreground hidden sm:inline-flex items-center gap-1 text-xs">
              <FileCode className="h-3.5 w-3.5" /> llms.txt
            </Link>
            <Link href="/status" className="hover:text-foreground text-xs">Status</Link>
            <Link href="/security" className="hover:text-foreground text-xs">Security</Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[240px_1fr_200px]">
        {/* Left Sidebar Nav */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-6 max-h-[calc(100vh-7rem)] overflow-y-auto pr-3">
            <div className="space-y-1">
              <Link
                href="/docs"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              >
                <BookOpen className="h-4 w-4" /> Vue d'ensemble
              </Link>
              <Link
                href="/docs/legal"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              >
                <ShieldCheck className="h-4 w-4" /> Centre légal & RGPD
              </Link>
            </div>

            {nav.map((group) => (
              <div key={group.name} className="space-y-2">
                <h3 className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.name}
                </h3>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = item.slug === currentPath;
                    return (
                      <li key={item.slug}>
                        <Link
                          href={`/docs/${item.slug}`}
                          className={`block rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? "bg-primary/10 text-primary font-semibold"
                              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                          }`}
                        >
                          {item.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {/* Center Article Content */}
        <main className="min-w-0 py-2">
          {/* Breadcrumb */}
          <nav className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/docs" className="hover:text-foreground">Docs</Link>
            <ChevronRight className="h-3 w-3" />
            <span>{doc.meta.group}</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">{doc.meta.title}</span>
          </nav>

          {/* Article Header */}
          <div className="space-y-2 border-b pb-6">
            <div className="inline-block rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {doc.meta.group}
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {doc.meta.title}
            </h1>
            {doc.meta.description && (
              <p className="text-base text-muted-foreground">
                {doc.meta.description}
              </p>
            )}
          </div>

          {/* Body Content */}
          <div className="mt-8 prose prose-neutral dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed">
            <div className="whitespace-pre-wrap font-sans">
              {doc.content}
            </div>
          </div>

          {/* Footer navigation */}
          <div className="mt-12 border-t pt-6 flex items-center justify-between text-xs text-muted-foreground">
            <Link href="/docs" className="inline-flex items-center gap-1 hover:text-foreground font-medium">
              <ArrowLeft className="h-3.5 w-3.5" /> Retour à l'index
            </Link>
            <span>© 2026 {BRAND_LEGAL_NAME}</span>
          </div>
        </main>

        {/* Right Sidebar: Table of Contents */}
        <aside className="hidden xl:block">
          <div className="sticky top-24 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sur cette page
            </h4>
            {doc.toc.length === 0 ? (
              <p className="text-xs text-muted-foreground">Section générale</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {doc.toc.map((heading) => (
                  <li
                    key={heading.id}
                    className={heading.level === 3 ? "pl-3 text-muted-foreground/80" : "text-muted-foreground"}
                  >
                    <a
                      href={`#${heading.id}`}
                      className="hover:text-foreground transition-colors block line-clamp-1"
                    >
                      {heading.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <ScrollTop />
    </div>
  );
}
