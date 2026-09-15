"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Check, Gavel, Play, X, Scale, FileDown } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/client";
import { EmptyState, ErrorState, PageHeader, StatusBadge, fmtDate, daysUntil } from "@/components/portal/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Dmca = {
  id: string; complainant: string; targetUrl: string; works: string; status: string;
  severity: string; receivedAt: string; slaDueAt: string; resolvedAt: string | null; resolutionNote: string | null;
};
type Dsar = {
  id: string; tenantName: string; type: string; subjectEmail: string; status: string;
  notes: string | null; requestedAt: string; dueAt: string; completedAt: string | null;
};
type Hold = {
  id: string; tenantName: string; reason: string; scope: string; status: string;
  issuedBy: string; issuedAt: string; releasedAt: string | null;
};

export function AdminLegal() {
  const queryClient = useQueryClient();
  const [resolveFor, setResolveFor] = useState<Dmca | null>(null);
  const [note, setNote] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "legal"],
    queryFn: () => apiGet<{ dmca: Dmca[]; dsar: Dsar[]; holds: Hold[] }>("/api/admin/legal"),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "legal"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
  };

  const act = useMutation({
    mutationFn: (vars: { op: string; id: string; data?: Record<string, unknown> }) =>
      apiPost<{ ok: boolean; message: string }>("/api/admin/legal", vars),
    onSuccess: (res) => { toast.success(res.message); invalidate(); },
    onError: (err: ApiError) => toast.error(err.message),
  });

  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  const dmcaOpen = (data?.dmca ?? []).filter((n) => n.status === "OPEN");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Legal & DSAR"
        description="DMCA intake with SLA tracking and data-subject rights workflows. Every resolution note is recorded verbatim in the audit chain - no ad-hoc prompts."
      />

      {/* DMCA queue */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gavel className="h-4 w-4 text-muted-foreground" aria-hidden /> DMCA notices - {dmcaOpen.length} open
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6" aria-busy>{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />)}</div>
          ) : (data?.dmca ?? []).length === 0 ? (
            <EmptyState icon={Gavel} title="No DMCA notices" description="Takedown notices submitted through the public intake form will appear here." />
          ) : (
            <ul className="divide-y">
              {(data?.dmca ?? []).map((n) => {
                const due = daysUntil(n.slaDueAt);
                const slaBreached = n.status === "OPEN" && due < 0;
                const slaSoon = n.status === "OPEN" && due >= 0 && due <= 2;
                return (
                  <li key={n.id} className="space-y-3 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{n.complainant}</p>
                        <p className="break-all text-xs text-muted-foreground">{n.targetUrl}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{n.works}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge status={n.severity} />
                        <StatusBadge status={n.status} />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        Received {fmtDate(n.receivedAt)}
                        <span aria-hidden>·</span>
                        <span className={cn(slaBreached && "font-semibold text-destructive", slaSoon && "font-semibold text-warning")}>
                          {n.status === "OPEN"
                            ? slaBreached ? `SLA breached by ${Math.abs(due)} day(s)` : `SLA due in ${due} day(s)`
                            : `Resolved ${fmtDate(n.resolvedAt)}`}
                        </span>
                      </p>
                      {n.status === "OPEN" && (
                        <Button
                          size="sm" className="h-11"
                          onClick={() => { setResolveFor(n); setNote(""); }}
                        >
                          <Check className="h-4 w-4" aria-hidden /> Resolve
                        </Button>
                      )}
                    </div>
                    {n.resolutionNote && (
                      <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Resolution note: </span>{n.resolutionNote}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* DSAR */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-muted-foreground" aria-hidden /> Data subject requests - GDPR Art. 15-20
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6" aria-busy>{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div>
          ) : (data?.dsar ?? []).length === 0 ? (
            <EmptyState icon={Scale} title="No DSAR requests" description="Requests submitted through the privacy portal will appear here." />
          ) : (
            <ul className="divide-y">
              {(data?.dsar ?? []).map((r) => {
                const due = daysUntil(r.dueAt);
                return (
                  <li key={r.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {r.subjectEmail}
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{r.type}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.tenantName} · requested {fmtDate(r.requestedAt)}
                        {r.status === "COMPLETED" ? ` · completed ${fmtDate(r.completedAt)}` : r.status === "CANCELED" ? " · cancelled" : ` · due in ${due} day(s)`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={r.status} />
                      {r.status === "OPEN" && (
                        <Button size="sm" variant="outline" className="h-11" onClick={() => act.mutate({ op: "run-dsar", id: r.id })}>
                          <Play className="h-4 w-4" aria-hidden /> Run collection
                        </Button>
                      )}
                      {r.status === "RUNNING" && (
                        <>
                          <Button
                            size="sm" variant="outline" className="h-11"
                            onClick={() => {
                              window.open(`/api/admin/dsar-export?id=${r.id}`, "_blank");
                              refetch();
                            }}
                          >
                            <FileDown className="h-4 w-4" aria-hidden /> Download archive
                          </Button>
                          <Button size="sm" variant="outline" className="h-11 text-destructive hover:text-destructive" onClick={() => act.mutate({ op: "cancel-dsar", id: r.id })}>
                            <X className="h-4 w-4" aria-hidden /> Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Legal holds */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ban className="h-4 w-4 text-muted-foreground" aria-hidden /> Legal holds
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6" aria-busy>{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div>
          ) : (data?.holds ?? []).length === 0 ? (
            <EmptyState title="No legal holds" description="Retention is suspended for tenants under hold." />
          ) : (
            <ul className="divide-y">
              {(data?.holds ?? []).map((h) => (
                <li key={h.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{h.reason}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{h.scope}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {h.tenantName} · issued by {h.issuedBy} · {fmtDate(h.issuedAt)}
                      {h.releasedAt ? ` · released ${fmtDate(h.releasedAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={h.status} />
                    {h.status === "ACTIVE" && (
                      <Button size="sm" variant="outline" className="h-11" onClick={() => act.mutate({ op: "release-hold", id: h.id })}>
                        Release hold
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Resolve DMCA dialog - structured, recorded verbatim (replaces window.prompt) */}
      <Dialog open={!!resolveFor} onOpenChange={(v) => !v && setResolveFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve DMCA notice</DialogTitle>
            <DialogDescription>
              {resolveFor?.complainant} - the resolution note is stored verbatim and appears in the audit chain. Reference the action taken and any counter-notices.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="resolution-note">Resolution note <span className="text-destructive" aria-hidden>*</span></Label>
            <Textarea
              id="resolution-note" rows={4} value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Document disabled, signer and tenant notified, repeat-infringer flag applied to workspace."
              aria-required="true"
            />
            <p className="text-xs text-muted-foreground">{note.length}/500 characters</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveFor(null)}>Cancel</Button>
            <Button
              disabled={!note.trim() || note.length > 500 || act.isPending}
              onClick={() => act.mutateAsync({ op: "resolve-dmca", id: resolveFor!.id, data: { note: note.trim() } }).then(() => setResolveFor(null))}
            >
              {act.isPending ? "Resolving…" : "Resolve notice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
