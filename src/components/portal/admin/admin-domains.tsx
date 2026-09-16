"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Globe, Check, X, RefreshCw, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/client";
import { CopyableCode, EmptyState, ErrorState, PageHeader, StatusBadge, fmtDate } from "@/components/portal/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type DomainRow = {
  id: string;
  tenantName: string;
  domain: string;
  method: string;
  status: string;
  token: string;
  verifiedAt: string | null;
  requestedAt: string;
  autoJoin?: boolean;
};

type TenantOption = {
  id: string;
  name: string;
  slug: string;
  planCode?: string;
};

export function AdminDomains() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [targetTenantId, setTargetTenantId] = useState("");
  const [autoJoin, setAutoJoin] = useState(true);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "domains"],
    queryFn: () =>
      apiGet<{ rows: DomainRow[]; joins: DomainRow[]; allTenants?: TenantOption[] }>("/api/admin/domains"),
  });

  const act = useMutation({
    mutationFn: (vars: { op: string; id?: string; data?: Record<string, unknown> }) =>
      apiPost<{ ok: boolean; message: string }>("/api/admin/domains", vars),
    onSuccess: (res) => {
      const failed = /failed/i.test(res.message);
      if (failed) toast.warning(res.message);
      else toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ["admin", "domains"] });
      setAddOpen(false);
      setNewDomain("");
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  const loading = isLoading;
  const rows = data?.rows ?? [];
  const joins = data?.joins ?? [];
  const allTenants = data?.allTenants ?? [];

  const methodHint: Record<string, string> = {
    TXT: "TXT record _docurama-verify",
    CNAME: "CNAME pointer subdomain",
    HTTP: "HTTP /.well-known/docurama.txt",
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newDomain.trim().toLowerCase().replace(/^@+/, "");
    if (!clean || !clean.includes(".")) {
      toast.error("Please enter a valid domain name (e.g. singa.fr)");
      return;
    }
    const tenantId = targetTenantId || allTenants[0]?.id;
    if (!tenantId) {
      toast.error("Please select a target company workspace");
      return;
    }
    act.mutate({
      op: "add",
      data: {
        domain: clean,
        tenantId,
        autoJoin,
      },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Domains & Corporate Access"
        description="Corporate domain attestation and automated company enrollment. Approved domains allow employees to create an account at /welcome and join their shared workspace without individual billing."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-11" onClick={() => refetch()}>
              Refresh
            </Button>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-11">
                  <Plus className="mr-1.5 h-4 w-4" /> Add Company Domain
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <form onSubmit={handleAddSubmit}>
                  <DialogHeader>
                    <DialogTitle>Add Approved Company Domain</DialogTitle>
                    <DialogDescription>
                      Grant automatic workspace enrollment to users registering with a specific corporate domain (e.g. singa.fr).
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="domain-input">Corporate email domain</Label>
                      <Input
                        id="domain-input"
                        placeholder="singa.fr"
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value)}
                        required
                        className="h-11"
                        autoFocus
                      />
                      <p className="text-xs text-muted-foreground">
                        Users registering with @{newDomain.replace(/^@/, '') || "company.com"} will automatically join the workspace.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="workspace-select">Target Company Workspace</Label>
                      <select
                        id="workspace-select"
                        value={targetTenantId || (allTenants[0]?.id ?? "")}
                        onChange={(e) => setTargetTenantId(e.target.value)}
                        className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        required
                      >
                        {allTenants.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.slug})
                          </option>
                        ))}
                      </select>
                    </div>

                    <label className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoJoin}
                        onChange={(e) => setAutoJoin(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-primary"
                      />
                      <span className="text-xs leading-relaxed text-muted-foreground">
                        <strong className="block text-foreground font-medium">Bypass billing & auto-join</strong>
                        Users signing up with this email domain at /welcome automatically join this shared workspace with active membership. No individual invoice or credit card required.
                      </span>
                    </label>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={act.isPending || !newDomain.trim()}>
                      {act.isPending ? "Adding…" : "Approve Domain"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : (
        <>
          {/* Join requests */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pending Join Requests ({joins.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2" aria-busy>
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
                  ))}
                </div>
              ) : joins.length === 0 ? (
                <EmptyState
                  icon={Globe}
                  title="No pending join requests"
                  description="Workspaces requesting to claim an existing verified domain will appear here."
                />
              ) : (
                <ul className="space-y-2">
                  {joins.map((j) => (
                    <li
                      key={j.id}
                      className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-11 text-destructive hover:text-destructive"
                          onClick={() => act.mutate({ op: "reject-join", id: j.id })}
                        >
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
              <CardTitle className="text-base">Attested & Approved Company Domains ({rows.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-6" aria-busy>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <EmptyState
                  icon={Globe}
                  title="No domains registered"
                  description="Click 'Add Company Domain' above to approve corporate domains for your tenant workspaces."
                />
              ) : (
                <ul className="divide-y">
                  {rows.map((d) => (
                    <li key={d.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Globe className="h-5 w-5 text-muted-foreground" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">{d.domain}</p>
                            {d.autoJoin && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 border border-emerald-500/20">
                                <ShieldCheck className="h-3 w-3" /> Auto-Join Workspace
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground mt-0.5">
                            Workspace: <strong className="text-foreground">{d.tenantName}</strong> · {methodHint[d.method]}
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
                            size="sm"
                            variant="outline"
                            className="h-11"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ op: "verify", id: d.id })}
                          >
                            <RefreshCw className="h-4 w-4" aria-hidden /> Run verification
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 text-xs"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ op: "toggle-autojoin", id: d.id })}
                        >
                          {d.autoJoin ? "Disable Auto-Join" : "Enable Auto-Join"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
                          disabled={act.isPending}
                          onClick={() => {
                            if (window.confirm(`Delete domain @${d.domain} from ${d.tenantName}?`)) {
                              act.mutate({ op: "delete", id: d.id });
                            }
                          }}
                          title="Delete domain"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
