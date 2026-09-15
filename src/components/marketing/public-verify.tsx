"use client";

/**
 * Public document verification - the anonymous face of verify.docurama.eu.
 *
 * Anyone with a verification code (from a certificate of completion) can
 * check what the evidence actually shows, without an account. Uses the
 * public /api/v1/verify/{code} endpoint (no API key, no session) and reports
 * the same honest states as the in-app tool: NOT_FOUND / NOT_SEALED /
 * VOIDED / VERIFIED - never dressing an unsigned document up as verified.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, ShieldX, FileQuestion, Search, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/brand/logo";
import { PortalProviders } from "@/components/portal/providers";
import { cn } from "@/lib/utils";

type VerifyResult =
  | { result: "NOT_FOUND"; code: string }
  | { result: "NOT_SEALED"; code: string; title: string; status: string }
  | { result: "VOIDED"; code: string; voidedAt: string | null; voidReason: string | null }
  | {
      result: "VERIFIED"; code: string;
      envelope: {
        title: string; status: string; sealedAt: string; completedAt: string | null;
        conformance: string | null; sha256: string; tenantName: string; pages: number;
        signers: { id: string; name: string; email: string; signedAt: string | null }[];
      };
    };

export function PublicVerify() {
  return (
    <PortalProviders>
      <VerifyInner />
    </PortalProviders>
  );
}

function VerifyInner() {
  const [code, setCode] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["public-verify", submitted],
    queryFn: async () => {
      const res = await fetch(`/api/v1/verify/${encodeURIComponent(submitted)}`, { credentials: "same-origin" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Verification failed (HTTP ${res.status})`);
      return body as VerifyResult;
    },
    enabled: !!submitted,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitted(code.trim().toUpperCase());
    refetch();
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <a href="/" aria-label="Docurama home"><BrandLogo tagline size="sm" /></a>
          <div className="flex items-center gap-2 text-sm">
            <a href="/welcome" className="font-medium text-primary underline-offset-4 hover:underline">Create a free account</a>
            <span className="text-muted-foreground/40" aria-hidden>·</span>
            <a href="/login" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Sign in</a>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
        <div className="mb-6 space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Verify a document</h1>
          <p className="text-sm text-muted-foreground">
            Enter the verification code from a Docurama certificate of completion. Results state
            exactly what the evidence shows - nothing more.
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="vcode">Verification code</Label>
                <div className="flex gap-2">
                  <Input
                    id="vcode" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="DOC-XXXXXXXX" className="h-11 font-mono" maxLength={20} autoFocus
                  />
                  <Button type="submit" className="h-11" disabled={!code.trim() || isFetching}>
                    <Search className="h-4 w-4" aria-hidden /> Verify
                  </Button>
                </div>
              </div>
            </form>

            {submitted && !isFetching && data && <ResultPanel result={data} />}
            {submitted && !isFetching && error && (
              <p role="alert" className="mt-4 text-sm text-destructive">{(error as Error).message}</p>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          Verification checks the cryptographic evidence recorded when the document was sealed:
          the SHA-256 digest, seal timestamp and signer roster. The document file itself is never
          exposed. Docurama SAS - 1 Rue Marguerin, 75014 Paris, France.
        </p>
      </main>
    </div>
  );
}

function ResultPanel({ result }: { result: VerifyResult }) {
  if (result.result === "NOT_FOUND") {
    return (
      <div className="mt-5 space-y-2 rounded-lg border bg-muted/50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><FileQuestion className="h-4 w-4 text-muted-foreground" aria-hidden /> No sealed document with this code</p>
        <p className="text-sm text-muted-foreground">Check the code on the certificate of completion - codes look like <span className="font-mono">DOC-XXXXXXXX</span>.</p>
      </div>
    );
  }
  if (result.result === "NOT_SEALED") {
    return (
      <div className="mt-5 space-y-2 rounded-lg border bg-muted/50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 text-muted-foreground" aria-hidden /> Not yet sealed</p>
        <p className="text-sm text-muted-foreground">
          “{result.title}” exists but its current status is <span className="font-mono">{result.status}</span> - it is not a completed, sealed document.
        </p>
      </div>
    );
  }
  if (result.result === "VOIDED") {
    return (
      <div className="mt-5 space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-destructive"><ShieldX className="h-4 w-4" aria-hidden /> Document voided</p>
        <p className="text-sm text-muted-foreground">This envelope was voided and carries no valid signature evidence.</p>
        {result.voidReason && <p className="text-xs text-muted-foreground">Reason: {result.voidReason}</p>}
      </div>
    );
  }

  const env = result.envelope;
  return (
    <div className="mt-5 space-y-4 rounded-lg border border-primary/40 bg-primary-soft/40 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-primary-deep">
        <BadgeCheck className="h-4 w-4" aria-hidden /> Verified - cryptographic evidence found
      </p>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Document</dt><dd className="font-medium">{env.title}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Organization</dt><dd className="font-medium">{env.tenantName}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Sealed at</dt><dd className="font-medium">{new Date(env.sealedAt).toLocaleString("en-GB")}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Conformance</dt><dd className="font-medium">{env.conformance ?? "-"}</dd></div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">SHA-256 digest</dt>
          <dd className="break-all font-mono text-xs">{env.sha256}</dd>
        </div>
      </dl>
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Signers on record</p>
        <ul className="space-y-1 text-sm">
          {env.signers.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 rounded border bg-card px-3 py-1.5">
              <span>{s.name} <span className="text-xs text-muted-foreground">({s.email})</span></span>
              <span className={cn("text-xs", s.signedAt ? "text-primary font-medium" : "text-muted-foreground")}>
                {s.signedAt ? `Signed ${new Date(s.signedAt).toLocaleDateString("en-GB")}` : "Pending"}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
        This confirms the recorded evidence only - it does not certify the document&apos;s legal meaning.
      </p>
    </div>
  );
}
