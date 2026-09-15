"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, ShieldX, FileQuestion, Search, ShieldCheck, Clock } from "lucide-react";
import { apiGet } from "@/lib/client";
import { CopyableCode, PageHeader, StatusBadge, fmtDate } from "@/components/portal/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

export function UserVerify() {
  const [code, setCode] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["workspace", "verify", submitted],
    queryFn: () => apiGet<VerifyResult>(`/api/workspace/verify?code=${encodeURIComponent(submitted)}`),
    enabled: !!submitted,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitted(code.trim().toUpperCase());
    refetch();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Verify a document"
        description="Enter a verification code from a certificate of completion. Results state exactly what the evidence shows - nothing more."
      />

      <div className="mx-auto w-full max-w-2xl space-y-6">
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="verify-code">Verification code</Label>
            <Input
              id="verify-code" value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="DOC-XXXXXXXX" className="h-12 font-mono text-base uppercase"
              aria-describedby="verify-hint"
            />
            <p id="verify-hint" className="text-xs text-muted-foreground">
              Printed on every certificate and confirmation email.
            </p>
          </div>
          <Button type="submit" className="h-12 px-6" disabled={!code.trim() || isFetching}>
            {isFetching ? "Checking…" : <><Search className="h-4 w-4" aria-hidden /> Verify</>}
          </Button>
        </form>

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="flex items-start gap-3 p-5">
              <ShieldX className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-destructive">Lookup failed</p>
                <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            {/* VERIFIED */}
            {data.result === "VERIFIED" && (
              <Card className="border-success/40">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-success-soft">
                      <BadgeCheck className="h-6 w-6 text-success" aria-hidden />
                    </span>
                    <div>
                      <p className="text-base font-semibold text-success">Signature verified</p>
                      <p className="text-xs text-muted-foreground">Checked against the sealed file - {data.code}</p>
                    </div>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Document</dt><dd className="text-right font-medium">{data.envelope.title}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Workspace</dt><dd>{data.envelope.tenantName}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Sealed</dt><dd>{fmtDate(data.envelope.sealedAt, true)}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Conformance</dt><dd>PAdES {data.envelope.conformance}</dd></div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt className="text-muted-foreground">SHA-256 digest</dt>
                      <dd><CopyableCode value={data.envelope.sha256} max={26} /></dd>
                    </div>
                  </dl>
                  <div>
                    <p className="mb-2 text-sm font-medium">Signers</p>
                    <ul className="space-y-1.5">
                      {data.envelope.signers.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 p-3 text-sm">
                          <span className="min-w-0 truncate">{s.name} <span className="text-xs text-muted-foreground">{s.email}</span></span>
                          <span className="shrink-0 text-xs text-success">signed {fmtDate(s.signedAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="flex items-start gap-2 rounded-lg bg-success-soft/50 p-3 text-xs text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                    Every claim above is derived from an inspection of the sealed file and its embedded certificate - including the RFC 3161 timestamp.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* NOT SEALED */}
            {data.result === "NOT_SEALED" && (
              <Card className="border-warning/40">
                <CardContent className="flex items-start gap-3 p-6">
                  <Clock className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold text-warning">Document found - not yet sealed</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      “{data.title}” exists but is still <StatusBadge status={data.status} className="mx-1" />.
                      A verification certificate becomes available only when all parties have signed and the document is sealed.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* VOIDED */}
            {data.result === "VOIDED" && (
              <Card className="border-destructive/40">
                <CardContent className="flex items-start gap-3 p-6">
                  <ShieldX className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold text-destructive">This envelope was voided</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Voided {fmtDate(data.voidedAt)}{data.voidReason ? ` - ${data.voidReason}` : ""}. It carries no valid signature.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* NOT FOUND */}
            {data.result === "NOT_FOUND" && (
              <Card>
                <CardContent className="flex items-start gap-3 p-6">
                  <FileQuestion className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold">No envelope with this code</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      We could not find <span className="font-mono">{data.code}</span>. Check the code and try again -
                      an unknown code is reported as unknown, never as “unsigned”.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <div className={cn("rounded-xl border bg-card p-4 text-xs text-muted-foreground")}>
          <p className="mb-1 font-medium text-foreground">Try these demo codes</p>
          <ul className="space-y-1">
            <li><button type="button" className="font-mono text-primary hover:underline" onClick={() => { setCode(""); setSubmitted(""); }}>Enter any sealed document's code from Documents →</button></li>
            <li>Open <strong>Documents</strong>, copy a completed envelope's code (green status) and paste it here.</li>
            <li>An unknown code such as <span className="font-mono">DOC-DOESNOTEXIST</span> shows the honest “not found” state.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
