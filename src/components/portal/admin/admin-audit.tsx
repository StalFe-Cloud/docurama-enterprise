"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, ShieldCheck, Blocks } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/client";
import { Column, ConfirmDialog, DataTable, PageHeader, StatusBadge, fmtDate, fmtRelative } from "@/components/portal/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AuditEvent = { id: string; at: string; actor: string; actorRole: string; action: string; resource: string; tenantName: string | null; severity: string; ip: string; detail: string | null };
type SecurityEvent = { id: string; at: string; type: string; severity: string; actor: string; ip: string; blocked: boolean; detail: string | null };

export function AdminAudit() {
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState("ALL");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"chain" | "security">("chain");
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "audit", page, severity, search],
    queryFn: () => apiGet<{
      events: AuditEvent[]; securityEvents: SecurityEvent[]; total: number; perPage: number;
      chain: { blockHeight: number; sealedAt: string; valid: boolean };
    }>(`/api/admin/audit?page=${page}&perPage=10&severity=${severity}&q=${encodeURIComponent(search)}`),
  });

  const seal = useMutation({
    mutationFn: () => apiPost<{ ok: boolean; message: string }>("/api/admin/settings", { op: "seal-audit" }),
    onSuccess: (res) => {
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  const auditColumns: Column<AuditEvent>[] = [
    { key: "at", header: "When", render: (e) => <span className="whitespace-nowrap text-sm text-muted-foreground">{fmtDate(e.at, true)}</span> },
    {
      key: "action", header: "Action",
      render: (e) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-medium">{e.action}</p>
          <p className="truncate text-xs text-muted-foreground">{e.resource}</p>
        </div>
      ),
    },
    {
      key: "actor", header: "Actor",
      render: (e) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{e.actor}</p>
          <p className="truncate text-xs text-muted-foreground">{e.actorRole} · {e.ip}</p>
        </div>
      ),
    },
    { key: "tenant", header: "Tenant", render: (e) => <span className="text-sm text-muted-foreground">{e.tenantName ?? "-"}</span> },
    { key: "severity", header: "Severity", render: (e) => <StatusBadge status={e.severity} /> },
  ];

  const secColumns: Column<SecurityEvent>[] = [
    { key: "at", header: "When", render: (e) => <span className="whitespace-nowrap text-sm text-muted-foreground">{fmtDate(e.at, true)}</span> },
    {
      key: "type", header: "Event",
      render: (e) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-medium">{e.type.replace(/_/g, " ")}</p>
          <p className="max-w-md truncate text-xs text-muted-foreground">{e.detail ?? e.actor}</p>
        </div>
      ),
    },
    { key: "actor", header: "Source", render: (e) => <div className="min-w-0"><p className="truncate text-sm">{e.actor}</p><p className="font-mono text-xs text-muted-foreground">{e.ip}</p></div> },
    { key: "severity", header: "Severity", render: (e) => <StatusBadge status={e.severity} /> },
    {
      key: "outcome", header: "Outcome",
      render: (e) => e.blocked
        ? <span className="text-sm font-medium text-success">Blocked</span>
        : <span className="text-sm font-medium text-warning">Logged</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Immutable, hash-chained record of every privileged action - alongside blocked and logged security events."
        actions={
          <ConfirmDialog
            trigger={<Button size="sm" className="h-11"><Lock className="h-4 w-4" aria-hidden /> Seal chain</Button>}
            title="Seal the audit chain?"
            description="A new block is committed covering all events since the last seal."
            confirmLabel="Seal chain"
            destructive={false}
            onConfirm={async () => { await seal.mutateAsync(); }}
          />
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft">
              <Blocks className="h-5 w-5 text-primary" aria-hidden />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Chain status</p>
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-success" aria-hidden /> Verified · block #{data?.chain.blockHeight ?? "-"}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Last sealed {data ? fmtRelative(data.chain.sealedAt) : "-"} · every seal is committed with an RFC 3161 timestamp
          </p>
        </CardContent>
      </Card>

      <Tabs value={view} onValueChange={(v) => setView(v as "chain" | "security")}>
        <TabsList className="h-11">
          <TabsTrigger value="chain" className="min-h-9">Audit chain events</TabsTrigger>
          <TabsTrigger value="security" className="min-h-9">Security events</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "chain" ? (
        <>
          <Tabs value={severity} onValueChange={(v) => { setSeverity(v); setPage(1); }}>
            <TabsList className="h-11">
              {["ALL", "INFO", "WARNING", "CRITICAL"].map((s) => (
                <TabsTrigger key={s} value={s} className="min-h-9">{s === "ALL" ? "All severities" : s}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <DataTable<AuditEvent>
            ariaLabel="Audit chain events"
            columns={auditColumns}
            rows={data?.events ?? []}
            total={data?.total}
            page={page}
            perPage={data?.perPage ?? 10}
            loading={isLoading}
            error={error ? (error as Error).message : null}
            onPageChange={setPage}
            onSearch={(q) => { setSearch(q); setPage(1); }}
            searchPlaceholder="Search by action…"
            onRetry={() => refetch()}
            emptyTitle="No audit events match"
          />
        </>
      ) : (
        <DataTable<SecurityEvent>
          ariaLabel="Security events"
          columns={secColumns}
          rows={data?.securityEvents ?? []}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          onRetry={() => refetch()}
          emptyTitle="No security events recorded"
        />
      )}
    </div>
  );
}
