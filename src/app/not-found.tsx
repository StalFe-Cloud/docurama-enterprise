import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { FileQuestion, Home, Search, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Page not found · Docurama",
  description: "This Docurama page does not exist. Verify a document, read the docs or head back to the workspace.",
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/marketing" aria-label="Docurama home">
            <BrandLogo size="sm" />
          </Link>
          <Link
            href="/verify"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Verify a document
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-lg text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <FileQuestion className="h-7 w-7 text-muted-foreground" aria-hidden />
          </span>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">This page does not exist</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The link may be outdated, or the page moved. If you followed a signing or verification
            link, check that it is complete - every Docurama signing link is personal and long.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild>
              <Link href="/marketing">
                <Home className="h-4 w-4" aria-hidden /> Back to the homepage
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/verify">
                <Search className="h-4 w-4" aria-hidden /> Verify a document
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/docs">
                <ShieldCheck className="h-4 w-4" aria-hidden /> Documentation
              </Link>
            </Button>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Think something is broken?{" "}
            <a className="underline underline-offset-2" href="mailto:support@docurama.eu">
              Tell support@docurama.eu
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
