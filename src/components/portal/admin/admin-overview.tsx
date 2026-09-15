"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Building2, Users, FileSignature, ShieldCheck, Euro, TriangleAlert, Scale,
  Activity, Cpu, Timer, Lock, Ban, BadgeCheck,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip as ChartTooltip, XAxis, YAxis,
} from "recharts";
import { apiGet } from "@/lib/client";
import {
  CardsSkeleton, ErrorState, KpiCard, PageHeader, StatusBadge, fmtRelative, daysUntil, cn,
} from "@/components/portal/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AdminSectionKey } from "@/components/portal/admin-shell";

type OverviewData = {
  kpis: { tenants: number; users: number; envelopes: number; sealed: number; mrr: number; dsarOpen: number; dmcaOpen: number; incidentsOpen: number };
  stats: { date: string; envelopesCreated: number; envelopesSealed: number; signersActive: number; activeTenants: number }[];
  planDist: { planCode: string; _count: number }[];
  securityEvents: { id: string; at: string; type: string; severity: string; actor: string; blocked: boolean; detail: string | null }[];
  auditEvents: { id: string; at: string; actor: string; action: string; resource: string; severity: string; tenantName: string | null }[];
  health: { certExpiryAt: string; tsaReachable: boolean; tsaUrl: string; signingConformance: string; queueDepth: number; sweeperLastRunAt: string; maintenanceMode: boolean; version: string };
};

const SEV_ICON: Record<string, typeof Lock> = { CRITICAL: Ban, HIGH: TriangleAlert, MEDIUM: Activity, LOW: Lock, INFO: BadgeCheck };

export function AdminOverview({ onNavigate }: { onNavigate: (k: AdminSectionKey) => void }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => apiGet<OverviewData>("/api/admin/overview"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Platform overview" description="Live KPIs across every Docurama tenant." />
        <CardsSkeleton cards={8} />
      </div>
    );
  }
  if (error || !data) {
    return <ErrorState message={(error as Error)?.message ?? "Failed to load overview"} onRetry={() => refetch()} />;
  }

  const chartData = data.stats.map((s) => ({
    ...s,
    day: new Date(s.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
  }));
  const pieData = data.planDist.map((p) => ({ name: p.planCode, value: p._count }));
  const PIE_COLORS: Record<string, string> = { STARTER: "#a4a097", BUSINESS: "#0f7a5a", ENTERPRISE: "#1a1a1a" };
  const certDays = daysUntil(data.health.certExpiryAt);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform overview"
        description="Live KPIs, signing pipeline health and security posture across every Docurama tenant."
        actions={<Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>}
      />

      {/* System health strip */}
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-center gap-3">
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", data.health.tsaReachable ? "bg-success-soft" : "bg-destructive/10")}>
            <Timer className={cn("h-5 w-5", data.health.tsaReachable ? "text-success" : "text-destructive")} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Timestamp authority</p>
            <p className="truncate text-sm font-medium">{data.health.tsaReachable ? "Reachable" : "Outage"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", certDays > 30 ? "bg-success-soft" : certDays > 7 ? "bg-warning-soft" : "bg-destructive/10")}>
            <Cpu className={cn("h-5 w-5", certDays > 30 ? "text-success" : certDays > 7 ? "text-warning" : "text-destructive")} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Signing certificate</p>
            <p className="text-sm font-medium">{certDays} days to renewal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Sealing conformance</p>
            <p className="text-sm font-medium">PAdES {data.health.signingConformance}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", data.health.queueDepth < 10 ? "bg-success-soft" : "bg-warning-soft")}>
            <Activity className={cn("h-5 w-5", data.health.queueDepth < 10 ? "text-success" : "text-warning")} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Signing queue</p>
            <p className="text-sm font-medium">{data.health.queueDepth} pending · sweeper {fmtRelative(data.health.sweeperLastRunAt)}</p>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active tenants" value={data.kpis.tenants} icon={Building2} sub="Across all plan tiers" />
        <KpiCard label="Platform users" value={data.kpis.users} icon={Users} sub="Members + administrators" />
        <KpiCard label="Envelopes (30d)" value={data.kpis.envelopes} icon={FileSignature} sub={`${data.kpis.sealed} sealed & completed`} />
        <KpiCard label="MRR" value={`€${data.kpis.mrr.toLocaleString()}`} icon={Euro} tone="primary" sub="Active subscriptions" />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Envelope volume - last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64" role="img" aria-label="Area chart of envelopes created versus sealed per day over the last 30 days">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="created" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0f7a5a" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0f7a5a" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="sealed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1a7f37" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#1a7f37" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                  <ChartTooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                    formatter={(value: number, name: string) => [value, name === "envelopesCreated" ? "Created" : "Sealed"]}
                  />
                  <Area type="monotone" dataKey="envelopesCreated" stroke="#0f7a5a" strokeWidth={2} fill="url(#created)" />
                  <Area type="monotone" dataKey="envelopesSealed" stroke="#1a7f37" strokeWidth={2} fill="url(#sealed)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tenants by plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64" role="img" aria-label="Donut chart of tenant count per plan tier">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} strokeWidth={0}>
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={PIE_COLORS[entry.name] ?? "#a4a097"} />
                    ))}
                  </Pie>
                  <ChartTooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                    formatter={(value: number, name: string) => [`${value} tenants`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs">
              {pieData.map((p) => (
                <li key={p.name} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[p.name] }} aria-hidden />
                  <StatusBadge status={p.name} /> · {p.value}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Open work + activity feeds */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Open incidents", value: data.kpis.incidentsOpen, icon: TriangleAlert, section: "compliance" as AdminSectionKey, tone: "text-warning" },
              { label: "DSAR requests due", value: data.kpis.dsarOpen, icon: Scale, section: "legal" as AdminSectionKey, tone: "text-info" },
              { label: "DMCA notices", value: data.kpis.dmcaOpen, icon: Ban, section: "legal" as AdminSectionKey, tone: "text-destructive" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onNavigate(item.section)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="flex items-center gap-2.5 text-sm">
                    <Icon className={cn("h-4 w-4", item.tone)} aria-hidden />
                    {item.label}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{item.value}</span>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Security events</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("audit")}>View audit log</Button>
          </CardHeader>
          <CardContent>
            <ul className="docurama-scroll max-h-72 space-y-1 overflow-y-auto">
              {data.securityEvents.map((ev) => {
                const Icon = SEV_ICON[ev.severity] ?? Activity;
                return (
                  <li key={ev.id} className="flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted/60">
                    <span className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                      ev.severity === "CRITICAL" || ev.severity === "HIGH" ? "bg-destructive/10" : ev.severity === "MEDIUM" ? "bg-warning-soft" : "bg-muted",
                    )}>
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{ev.type.replace(/_/g, " ")}</p>
                      <p className="truncate text-xs text-muted-foreground">{ev.detail ?? ev.actor} · {ev.actor}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusBadge status={ev.severity} />
                      <p className="mt-1 text-[11px] text-muted-foreground">{fmtRelative(ev.at)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent platform audit trail</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {data.auditEvents.map((ev) => (
              <li key={ev.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{ev.action}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {ev.resource}{ev.tenantName ? ` · ${ev.tenantName}` : ""}
                </span>
                <StatusBadge status={ev.severity} />
                <span className="text-xs text-muted-foreground">{ev.actor} · {fmtRelative(ev.at)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
