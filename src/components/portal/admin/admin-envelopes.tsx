"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Clock, FileSignature } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/client";
import {
  Column, ConfirmDialog, CopyableCode, DataTable, PageHeader, StatusBadge, fmtDate, fmtRelative,
} from "@/components/portal/shared";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Recipient = { id: string; name: string; email: string; role: string; status: string; order: number; authMethod: string; signedAt: string | null };
type EnvelopeRow = {
  id: string; publicCode: string; title: string; status: string; tenantName: string;
  createdBy: string; createdAt: string; sealedAt: string | null; completedAt: string | null;
  conformanceLevel: string | null; sha256: string | null; pages: number;
  recipients: Recipient[];
};

const STATUS_TABS = ["ALL", "SENT", "PARTIALLY_SIGNED", "COMPLETED", "VOIDED", "DECLINED", "EXPIRED"];

export function AdminEnvelopes() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "envelopes", page, search, status],
    queryFn: () => apiGet<{ rows: EnvelopeRow[]; total: number; perPage: number }>(`/api/admin/envelopes?page=${page}&perPage=10&status=${status}&q=${encodeURIComponent(search)}`),
  });

  const voidIt = useMutation({
    mutationFn: (vars: { id: string; reason: string }) =>
      apiPost<{ ok: boolean; message: string }>("/api/admin/envelopes", { op: "void", id: vars.id, data: { reason: vars.reason } }),
    onSuccess: (res) => {
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ["admin", "envelopes"] });
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  const columns: Column<EnvelopeRow>[] = [
    {
      key: "title", header: "Envelope",
      render: (e) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{e.title}</p>
          <p className="font-mono text-xs text-muted-foreground">{e.publicCode}</p>
        </div>
      ),
    },
    { key: "tenant", header: "Tenant", render: (e) => <span className="text-sm">{e.tenantName}</span> },
    {
      key: "signers", header: "Signers",
      render: (e) => {
        const signers = e.recipients.filter((r) => r.role !== "CC");
        const signed = signers.filter((r) => r.status === "SIGNED").length;
        return (
          <div className="w-32 space-y-1">
            <p className="text-xs tabular-nums text-muted-foreground">{signed}/{signers.length} signed</p>
            <Progress value={signers.length ? (signed / signers.length) * 100 : 0} aria-label={`${signed} of ${signers.length} signers have signed`} />
          </div>
        );
      },
    },
    {
      key: "status", header: "Status",
      render: (e) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={e.status} />
          {e.conformanceLevel && <span className="text-[11px] text-muted-foreground">PAdES {e.conformanceLevel}</span>}
        </div>
      ),
    },
    { key: "created", header: "Sent", render: (e) => <span className="whitespace-nowrap text-sm text-muted-foreground">{fmtRelative(e.createdAt)}</span> },
    {
      key: "digest", header: "SHA-256 evidence",
      render: (e) => e.sha256
        ? <CopyableCode value={e.sha256} max={14} />
        : <span className="text-xs text-muted-foreground">not sealed</span>,
    },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, className: "w-20",
      render: (e) => (
        <div className="flex justify-end">
          {["SENT", "PARTIALLY_SIGNED", "DRAFT"].includes(e.status) && (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="icon" className="h-11 w-11 text-destructive" aria-label={`Void ${e.title}`} title="Void envelope">
                  <Ban className="h-4 w-4" aria-hidden />
                </Button>
              }
              title="Void this envelope?"
              description={`${e.title} - signers receive a void notification and the audit trail records the void with your reason.`}
              confirmLabel="Void envelope"
              requireReason
              onConfirm={(reason) => voidIt.mutateAsync({ id: e.id, reason })}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Envelopes"
        description="Every signing transaction across the platform, with signer progress and cryptographic evidence digests."
      />

      <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
        <TabsList className="h-11 flex-wrap">
          {STATUS_TABS.map((s) => (
            <TabsTrigger key={s} value={s} className="min-h-9">
              {s === "ALL" ? "All" : StatusLabel(s)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DataTable<EnvelopeRow>
        ariaLabel="Envelope monitor"
        columns={columns}
        rows={data?.rows ?? []}
        total={data?.total}
        page={page}
        perPage={data?.perPage ?? 10}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        onPageChange={setPage}
        onSearch={(q) => { setSearch(q); setPage(1); }}
        searchPlaceholder="Search by title or verification code…"
        onRetry={() => refetch()}
        emptyTitle={status === "ALL" ? "No envelopes yet" : `No ${StatusLabel(status).toLowerCase()} envelopes`}
        emptyDescription={status === "ALL" ? undefined : "Try a different status filter or clear the search."}
        emptyAction={
          status !== "ALL" ? (
            <Button variant="outline" size="sm" className="h-11" onClick={() => setStatus("ALL")}>
              <Clock className="h-4 w-4" aria-hidden /> Clear filter
            </Button>
          ) : undefined
        }
      />

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileSignature className="h-3.5 w-3.5" aria-hidden />
        Recipient signing tokens are never serialized to other parties - only names, statuses and timestamps.
      </p>
    </div>
  );
}

function StatusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
