"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bell, CheckCircle2, Clock, FileSignature, Files, PenLine, ArrowRight, LayoutTemplate,
} from "lucide-react";
import { apiGet } from "@/lib/client";
import { CardsSkeleton, ErrorState, KpiCard, PageHeader, StatusBadge, fmtRelative } from "@/components/portal/shared";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionUser } from "@/lib/auth";
import type { UserSectionKey } from "@/components/portal/user-shell";

type OverviewData = {
  plan: { name: string; code: string; envelopeLimit: number } | null;
  tenant: { name: string };
  quota: { used: number; limit: number };
  kpis: { sentThisMonth: number; completed: number; pending: number; awaitingMe: number };
  recent: { id: string; publicCode: string; title: string; status: string; createdAt: string; recipients: { name: string; status: string }[] }[];
  mySignQueue: { id: string; publicCode: string; title: string; tenantName: string; createdAt: string; recipients: { name: string; status: string }[] }[];
  team: { id: string; role: string; name: string; email: string; status: string; totpEnabled: boolean }[];
};

export function UserHome({ user, onNavigate }: { user: SessionUser; onNavigate: (k: UserSectionKey) => void }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["workspace", "overview"],
    queryFn: () => apiGet<OverviewData>("/api/workspace/overview"),
  });

  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-6" aria-busy>
        <PageHeader title={`Welcome back, ${user.firstName}`} />
        <CardsSkeleton cards={4} />
      </div>
    );
  }

  const quotaPct = data.quota.limit ? Math.min(100, Math.round((data.quota.used / data.quota.limit) * 100)) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user.firstName}`}
        description={`${data.tenant.name} · ${data.plan?.name ?? "custom"} plan. Here is what needs your attention today.`}
        actions={
          <Button className="h-11" onClick={() => onNavigate("documents")}>
            <PenLine className="h-4 w-4" aria-hidden /> New document
          </Button>
        }
      />

      {/* Action required */}
      {data.mySignQueue.length > 0 && (
        <Card className="border-warning/40 bg-warning-soft/30">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-warning" aria-hidden /> Action required - {data.mySignQueue.length} document{data.mySignQueue.length > 1 ? "s" : ""} waiting for your signature
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.mySignQueue.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onNavigate("documents")}
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border bg-card p-3.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.title}</p>
                  <p className="font-mono text-xs text-muted-foreground">{e.publicCode} · from {e.tenantName} · sent {fmtRelative(e.createdAt)}</p>
                </div>
                <span className="flex shrink-0 items-center gap-2 text-sm font-medium text-primary">
                  Review &amp; sign <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Sent this month" value={data.kpis.sentThisMonth} icon={Files} sub={`of ${data.quota.limit} plan envelopes`} />
        <KpiCard label="Awaiting others" value={data.kpis.pending} icon={Clock} tone={data.kpis.pending ? "warning" : "default"} sub="Out for signature" />
        <KpiCard label="Completed" value={data.kpis.completed} icon={CheckCircle2} tone="success" sub="Sealed with certificate" />
        <KpiCard label="Awaiting me" value={data.kpis.awaitingMe} icon={PenLine} tone={data.kpis.awaitingMe ? "primary" : "default"} sub="Documents to sign" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Quota */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Envelope quota</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{data.plan?.name} plan</span>
              <span className="tabular-nums font-medium">{data.quota.used}/{data.quota.limit}</span>
            </div>
            <Progress value={quotaPct} aria-label={`${data.quota.used} of ${data.quota.limit} envelopes used this month`} />
            <p className="text-xs text-muted-foreground">
              {quotaPct >= 100
                ? "Monthly quota reached - upgrade to continue sending."
                : `${data.quota.limit - data.quota.used} envelopes remaining this billing period.`}
            </p>
            <Button variant="outline" size="sm" className="h-11 w-full" onClick={() => onNavigate("settings")}>
              View plan &amp; billing
            </Button>
          </CardContent>
        </Card>

        {/* Recent */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Recent documents</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("documents")}>View all</Button>
          </CardHeader>
          <CardContent className="p-0">
            {data.recent.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No documents yet - create your first envelope from a template.
              </div>
            ) : (
              <ul className="divide-y">
                {data.recent.map((e) => {
                  const signers = e.recipients.filter((r) => r.status);
                  const signed = signers.filter((r) => r.status === "SIGNED").length;
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-3 p-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <FileSignature className="h-4 w-4 text-muted-foreground" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{e.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {e.publicCode} · {signed}/{signers.length} signed · {fmtRelative(e.createdAt)}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={e.status} />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Templates shortcut + team */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <LayoutTemplate className="h-4 w-4 text-muted-foreground" aria-hidden /> Start from a template
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("templates")}>Browse</Button>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Reusable, pre-approved documents keep signature fields consistent across your organisation.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.team.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{m.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground capitalize">{m.role.toLowerCase()}</span>
                  </span>
                  <StatusBadge status={m.status} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
