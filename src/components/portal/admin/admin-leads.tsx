"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Handshake, Search, Sparkles } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/client";
import { ErrorState, KpiCard, PageHeader, StatusBadge, fmtDate } from "@/components/portal/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Lead = {
  id: string; company: string; contactName: string; email: string; phone: string | null;
  seats: number; monthlyEnvelopes: number; requirements: string;
  status: string; notes: string; createdAt: string; updatedAt: string;
};

type LeadsData = {
  total: number;
  leads: Lead[];
  kpis: { newCount: number; wonCount: number };
};

const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"];

/**
 * Enterprise pipeline console (cycle 10): leads submitted from the public
 * /enterprise onboarding page. Triage statuses + notes; every change is
 * audited server-side.
 */
export function AdminLeads() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "leads", search, statusFilter],
    queryFn: () =>
      apiGet<LeadsData>(`/api/admin/leads?q=${encodeURIComponent(search)}&status=${statusFilter}&perPage=50`),
  });

  const act = useMutation({
    mutationFn: (vars: { op: string; id: string; data?: Record<string, unknown> }) =>
      apiPost<{ ok: boolean; message: string }>("/api/admin/leads", vars),
    onSuccess: (res) => {
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ["admin", "leads"] });
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-6" aria-busy>
        <PageHeader title="Enterprise leads" description="Enterprise pipeline from the /enterprise page." />
        <div className="grid gap-4 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Enterprise leads"
        description="Prospects from the /enterprise onboarding page. Triage them through the guided-onboarding pipeline: contact → pilot → security review → rollout."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="New, waiting for first reply" value={data.kpis.newCount} icon={Sparkles} sub="Reply within one business day (the page promises it)" />
        <KpiCard label="In the pipeline" value={data.total} icon={Handshake} sub="All statuses except LOST" />
        <KpiCard label="Won rollouts" value={data.kpis.wonCount} icon={Handshake} sub="Enterprise customers onboarded" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline</CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company, contact or email"
                className="pl-9"
                aria-label="Search leads"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="sm:w-44" aria-label="Filter by status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {data.leads.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No leads yet. The public /enterprise page feeds this pipeline; sales@ gets an outbox copy of every submission.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {data.leads.map((l) => (
                <li key={l.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{l.company}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.contactName} · <a className="underline underline-offset-2" href={`mailto:${l.email}`}>{l.email}</a>
                        {l.phone && <> · {l.phone}</>} · {fmtDate(l.createdAt)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {l.seats > 0 ? `${l.seats} seats` : "seats not specified"}
                        {" · "}
                        {l.monthlyEnvelopes > 0 ? `${l.monthlyEnvelopes.toLocaleString("en-GB")} envelopes/month` : "volume not specified"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={l.status}
                        onValueChange={(v) => act.mutate({ op: "lead.status", id: l.id, data: { status: v } })}
                      >
                        <SelectTrigger className="h-9 w-36 text-xs" aria-label={`Status for ${l.company}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline" size="sm" className="h-9"
                        onClick={() => { setOpenId(openId === l.id ? null : l.id); setNoteDraft({ ...noteDraft, [l.id]: l.notes }); }}
                        aria-expanded={openId === l.id}
                      >
                        {openId === l.id ? "Hide notes" : "Notes"}
                      </Button>
                    </div>
                  </div>

                  {l.requirements && (
                    <p className="mt-2 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                      {l.requirements}
                    </p>
                  )}

                  {openId === l.id && (
                    <div className="mt-3 space-y-2 rounded-lg border p-3">
                      <Label htmlFor={`note-${l.id}`}>Triage notes (next step, pilot status, who replied…)</Label>
                      <Textarea
                        id={`note-${l.id}`} rows={3} maxLength={2000}
                        value={noteDraft[l.id] ?? l.notes}
                        onChange={(e) => setNoteDraft({ ...noteDraft, [l.id]: e.target.value })}
                      />
                      <Button
                        size="sm" disabled={act.isPending}
                        onClick={() => act.mutate({ op: "lead.note", id: l.id, data: { notes: noteDraft[l.id] ?? l.notes } })}
                      >
                        Save note
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
