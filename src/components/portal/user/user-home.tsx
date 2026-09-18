"use client";

import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell, CheckCircle2, Clock, FileSignature, Files, PenLine, ArrowRight, LayoutTemplate,
  PlayCircle, Sparkles, X,
} from "lucide-react";
import { apiGet } from "@/lib/client";
import { CardsSkeleton, ErrorState, KpiCard, PageHeader, StatusBadge, fmtRelative } from "@/components/portal/shared";
import { planDef, planGuide } from "@/lib/plans";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionUser } from "@/lib/auth";
import type { UserSectionKey } from "@/components/portal/user-shell";

type OverviewData = {
  plan: { name: string; code: string; envelopeLimit: number } | null;
  tenant: { name: string };
  // Allowance incl. rollover (src/lib/billing.ts currentAllowance).
  quota: { used: number; limit: number; carriedForward: number; total: number; remaining: number };
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

  const quotaPct = data.quota.total ? Math.min(100, Math.round((data.quota.used / data.quota.total) * 100)) : 0;
  const quotaTotal = data.quota.total ?? data.quota.limit;

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

      {/* Per-plan guide: guided first steps + demos, dismissable */}
      <PlanGuideCard planCode={data.plan?.code ?? "STARTER"} />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Sent this period" value={data.kpis.sentThisMonth} icon={Files} sub={`of ${quotaTotal} envelopes${data.quota.carriedForward > 0 ? ` (incl. ${data.quota.carriedForward} rolled over)` : ""}`} />
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
              <span className="tabular-nums font-medium">{data.quota.used}/{quotaTotal}</span>
            </div>
            <Progress value={quotaPct} aria-label={`${data.quota.used} of ${quotaTotal} envelopes used this period`} />
            <p className="text-xs text-muted-foreground">
              {quotaPct >= 100
                ? "Quota reached — unused envelopes roll over on renewal, or upgrade to continue sending."
                : `${Math.max(0, quotaTotal - data.quota.used)} envelopes remaining this period.`}
            </p>
            {data.quota.carriedForward > 0 && (
              <p className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
                +{data.quota.carriedForward} carried over from last period — they roll forward on renewal, up to one monthly allowance.
              </p>
            )}
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

// ─── Per-plan guide card ──────────────────────────────────────────────────────
//
// Guided instructions + demos matched to the workspace's plan (cycle 10).
// Dismissable via localStorage (one click, per plan — reappears only if the
// plan changes), so it teaches without nagging.

// localStorage read via useSyncExternalStore (no setState-in-effect): the
// server snapshot renders the card, the client snapshot hides it once the
// flag is set — React re-renders automatically after hydration.
const GUIDE_DISMISS_EVENT = "docurama:guide-dismissed";

function subscribeGuideDismiss(cb: () => void) {
  window.addEventListener(GUIDE_DISMISS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(GUIDE_DISMISS_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function useGuideDismissed(storageKey: string): boolean {
  return useSyncExternalStore(
    subscribeGuideDismiss,
    () => {
      try { return window.localStorage.getItem(storageKey) === "1"; } catch { return false; }
    },
    () => false, // server: card visible (progressive enhancement)
  );
}

function PlanGuideCard({ planCode }: { planCode: string }) {
  const storageKey = `docurama.guide.dismissed.${planCode}`;
  const dismissed = useGuideDismissed(storageKey);

  if (dismissed) return null;

  const plan = planDef(planCode);
  const guide = planGuide(planCode);
  const dismiss = () => {
    try { window.localStorage.setItem(storageKey, "1"); } catch { /* private mode */ }
    window.dispatchEvent(new Event(GUIDE_DISMISS_EVENT));
  };

  return (
    <Card className="border-primary/30 bg-primary-soft/20">
      <CardHeader className="flex-row items-start justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden /> Getting started with {plan.name}
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={dismiss} aria-label="Dismiss the plan guide" title="Dismiss — you can reopen it from Settings">
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guided first steps</p>
          <ol className="mt-2 space-y-2">
            {guide.steps.map((s, i) => (
              <li key={s.label} className="flex items-start gap-2 text-sm leading-relaxed">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{i + 1}</span>
                <a className="underline-offset-2 hover:underline" href={s.href}>{s.label}</a>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">See it in action</p>
          <ul className="mt-2 space-y-2.5">
            {guide.demos.map((d) => (
              <li key={d.label} className="text-sm leading-relaxed">
                <a className="flex items-start gap-2 font-medium underline-offset-2 hover:underline" href={d.href}>
                  <PlayCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /> {d.label}
                </a>
                <p className="ml-6 text-xs text-muted-foreground">{d.desc}</p>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
