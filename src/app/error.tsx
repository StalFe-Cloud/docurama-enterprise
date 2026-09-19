"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

/** Recover a failed route without exposing server exception details. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-4xl items-center px-4 sm:px-6">
          <Link href="/" aria-label="Docurama home"><BrandLogo tagline size="sm" /></Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-20 sm:px-6" role="alert">
        <h1 className="text-3xl font-semibold tracking-tight">This page could not load</h1>
        <p className="mt-4 max-w-lg text-muted-foreground">
          Try again. If the problem continues, contact your administrator or support@docurama.eu
          {error.digest ? " and include the reference below." : "."}
        </p>
        {error.digest && <p className="mt-3 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>}
        <div className="mt-8 flex flex-wrap gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => window.location.assign("/")}>Go to home</Button>
        </div>
      </main>
    </div>
  );
}
