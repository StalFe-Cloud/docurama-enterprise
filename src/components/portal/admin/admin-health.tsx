"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, TriangleAlert, XCircle } from "lucide-react";
import { apiGet } from "@/lib/client";
import { ErrorState, KpiCard, PageHeader, StatusBadge, fmtRelative, daysUntil, cn } from "@/components/portal/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type HealthData = {
  settings: {
    version: string; lastDeployAt: string; certExpiryAt: string; certFingerprint: string;
    signingConformance: string; queueDepth: number; apiReplicas: number; diskUsedPct: number;
    sweeperLastRunAt: string; smtpHost: string; tsaUrl: string;
  };
  weekStats: { date: string; envelopesCreated: number; envelopesSealed: number }[];
  lastAudit: { at: string; action: string; actor: string } | null;
  secLast24h: number;
  failingHooks: number;
  services: { name: string; status: string; detail: string }[];
};

const SERVICE_ICON: Record<string, typeof CheckCircle2> = {
  HEALTHY: CheckCircle2, DEGRADED: TriangleAlert, OUTAGE: XCircle,
};

export function AdminHealth() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "health"],
    queryFn: () => apiGet<HealthData>("/api/admin/health"),
    refetchInterval: 30_000,
  });

  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return <div className="space-y-6" aria-busy><PageHeader title="Ops health" /><div className="h-48 animate-pulse rounded-xl bg-muted" /></div>;
  }

  const certDays = daysUntil(data.settings.certExpiryAt);
  const weekCreated = data.weekStats.reduce((a, s) => a + s.envelopesCreated, 0);
  const weekSealed = data.weekStats.reduce((a, s) => a + s.envelopesSealed, 0);
  const sealRate = weekCreated ? Math.round((weekSealed / weekCreated) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ops health"
        description="Live service status, signing readiness and operational telemetry. Refreshes automatically every 30 seconds."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Signing queue" value={data.settings.queueDepth} icon={Activity} tone={data.settings.queueDepth < 10 ? "success" : "warning"} sub={`apiReplicas ${data.settings.apiReplicas} replicas`} />
        <KpiCard label="Seal rate (7d)" value={`${sealRate}%`} tone={sealRate > 85 ? "success" : "warning"} sub={`${weekSealed} sealed of ${weekCreated} created`} />
        <KpiCard label="Security events (24h)" value={data.secLast24h} tone={data.secLast24h > 15 ? "warning" : "default"} sub="Includes blocked attempts" />
        <KpiCard label="Certificate renewal" value={`${certDays} days`} tone={certDays > 30 ? "success" : certDays > 7 ? "warning" : "destructive"} sub="Platform signing certificate" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Services</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.services.map((s) => {
              const Icon = SERVICE_ICON[s.status] ?? Activity;
              return (
                <div key={s.name} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Icon
                      className={cn(
                        "h-5 w-5 shrink-0",
                        s.status === "HEALTHY" && "text-success",
                        s.status === "DEGRADED" && "text-warning",
                        s.status === "OUTAGE" && "text-destructive",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.detail}</p>
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capacity &amp; maintenance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Envelope storage</span>
                <span className="tabular-nums">{data.settings.diskUsedPct}% used</span>
              </div>
              <Progress value={data.settings.diskUsedPct} aria-label="Storage utilisation" />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Version</p>
                <p className="mt-1 font-medium">v{data.settings.version}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Last deploy</p>
                <p className="mt-1 font-medium">{fmtRelative(data.settings.lastDeployAt)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Sweeper</p>
                <p className="mt-1 font-medium">{fmtRelative(data.settings.sweeperLastRunAt)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Failing webhooks</p>
                <p className={cn("mt-1 font-medium", data.failingHooks > 0 && "text-warning")}>{data.failingHooks}</p>
              </div>
            </div>
            {data.lastAudit && (
              <p className="text-xs text-muted-foreground">
                Latest audited event: <span className="font-mono text-foreground">{data.lastAudit.action}</span> by {data.lastAudit.actor} · {fmtRelative(data.lastAudit.at)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
