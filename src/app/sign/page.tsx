import type { Metadata } from "next";
import Link from "next/link";
import { Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Sign a document · Docurama",
  description: "Open your personal signing link from your invitation email to review and sign a document.",
  robots: { index: false, follow: false },
};

/**
 * /sign (no token) — the landing for sign.docurama.eu root visits. Signing
 * links always carry a recipient-specific token (/sign/{token}); without one
 * there is nothing to sign, so guide the visitor back to their email.
 */
export default function SignLandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <BrandLogo />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <Card className="w-full max-w-md text-center">
          <CardContent className="space-y-4 p-8">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft">
              <Mail className="h-6 w-6 text-primary" aria-hidden />
            </span>
            <h1 className="text-xl font-semibold">Your signing link is in your email</h1>
            <p className="text-sm text-muted-foreground">
              Every Docurama signing invitation carries a personal, unique link. Open the invitation
              from your inbox and use the link inside — it signs as you, so never forward it.
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Links are unique per signer and audit-trailed
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/verify">Verify a completed document instead</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
