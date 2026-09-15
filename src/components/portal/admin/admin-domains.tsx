"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Globe, Check, X, RefreshCw } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/client";
import { CopyableCode, EmptyState, ErrorState, PageHeader, StatusBadge, fmtDate } from "@/components/portal/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DomainRow = {
  id: string; tenantName: string; domain: string; method: string; status: string;
  token: string; verifiedAt: string | null; requestedAt: string;
};

export function AdminDomains() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "domains"],
    queryFn: () => apiGet<{ rows: DomainRow[]; joins: DomainRow[] }>("/api/admin/domains"),
  });

  const act = useMutation({
    mutationFn: (vars: { op: string; id: string }) =>
      apiPost<{ ok: boolean; message: string }>("/api/admin/domains", vars),
    onSuccess: (res) => {
      const failed = /failed/i.test(res.message);
      if (failed) toast.warning(res.message);
      else toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ["admin", "domains"] });
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  const loading = isLoading;
  const rows = data?.rows ?? [];
  const joins = data?.joins ?? [];

  const methodHint: Record<string, string> = {
    TXT: "TXT record _docurama-verify",
    CNAME: "CNAME pointer subdomain",
    HTTP: "HTTP /.well-known/docurama.txt",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Domains"
        description="Corporate DNS domain attestation. Verified domains unlock branded sender identity and a public trust surface for counterparties."
        actions={<Button variant="outline" size="sm" className="h-11" onClick={() => refetch()}>Refresh</Button>}
      />

      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : (
        <>
          {/* Join requests */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Join requests ({joins.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2" aria-busy>
                  {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}
                </div>
              ) : joins.length === 0 ? (
                <EmptyState icon={Globe} title="No pending join requests" description="Workspaces requesting to join an existing verified domain will appear here." />
              ) : (
                <ul className="space-y-2">
                  {joins.map((j) => (
                    <li key={j.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{j.domain}</p>
                        <p className="text-xs text-muted-foreground">
                          Requested by {j.tenantName} · {fmtDate(j.requestedAt)} · {methodHint[j.method]}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" className="h-11" onClick={() => act.mutate({ op: "approve-join", id: j.id })}>
                          <Check className="h-4 w-4" aria-hidden /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-11 text-destructive hover:text-destructive" onClick={() => act.mutate({ op: "reject-join", id: j.id })}>
                          <X className="h-4 w-4" aria-hidden /> Reject
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* All domains */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attested domains ({rows.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-6" aria-busy>
                  {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}
                </div>
              ) : rows.length === 0 ? (
                <EmptyState icon={Globe} title="No domains registered" description="Tenants register domains from their workspace settings to claim a corporate identity." />
              ) : (
                <ul className="divide-y">
                  {rows.map((d) => (
                    <li key={d.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Globe className="h-5 w-5 text-muted-foreground" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{d.domain}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {d.tenantName} · {methodHint[d.method]}
                            {d.verifiedAt ? ` · verified ${fmtDate(d.verifiedAt)}` : ""}
                          </p>
                          <div className="mt-1 flex items-center gap-1">
                            <span className="text-[11px] text-muted-foreground">token:</span>
                            <CopyableCode value={d.token} max={24} />
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge status={d.status} />
                        {d.status !== "VERIFIED" && d.status !== "JOIN_REQUESTED" && (
                          <Button
                            size="sm" variant="outline" className="h-11"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ op: "verify", id: d.id })}
                          >
                            <RefreshCw className="h-4 w-4" aria-hidden /> Run verification
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
