"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Ban, CreditCard, Loader2, RotateCcw, TrendingUp } from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from "recharts";
import { apiGet, apiPost, ApiError } from "@/lib/client";
import { ConfirmDialog, ErrorState, KpiCard, PageHeader, StatusBadge, fmtDate } from "@/components/portal/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type BillingData = {
  plans: { id: string; code: string; name: string; monthlyEur: number; seatLimit: number; envelopeLimit: number; storageGb: number; apiAccess: boolean; slaUptime: string; support: string; features: string }[];
  subscriptions: { id: string; tenantName: string; tenantSlug: string; tenantStatus: string; planCode: string; status: string; mrrEur: number; seats: number; renewalAt: string; paymentMethod: string; lastInvoiceAt: string | null; failedPayment: boolean }[];
  mrrTrend: { date: string; mrrEur: number }[];
  payments: {
    id: string; tenantName: string; tenantSlug: string; provider: string; kind: string; planCode: string;
    termMonths: number; amountCents: number; currency: string; status: string; reference: string | null;
    description: string; createdAt: string; paidAt: string | null; approverNote: string | null;
  }[];
  pendingPayments: number;
};

export function AdminBilling() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "billing"],
    queryFn: () => apiGet<BillingData>("/api/admin/billing"),
  });

  const act = useMutation({
    mutationFn: (vars: { op: string; id: string; data?: Record<string, unknown> }) =>
      apiPost<{ ok: boolean; message: string }>("/api/admin/billing", vars),
    onSuccess: (res) => {
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ["admin", "billing"] });
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-6" aria-busy>
        <PageHeader title="Billing" description="Plans, subscriptions and revenue." />
        <div className="grid gap-4 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />)}</div>
      </div>
    );
  }

  const activeMrr = data.subscriptions.filter((s) => s.status === "ACTIVE").reduce((a, s) => a + s.mrrEur, 0);
  const failed = data.subscriptions.filter((s) => s.failedPayment);
  const chartData = data.mrrTrend.map((m) => ({
    ...m,
    day: new Date(m.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    mrr: m.mrrEur,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Plan catalogue, subscription lifecycle and revenue trends. Plan changes flow through the tenant console."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active MRR" value={`€${activeMrr.toLocaleString()}`} icon={TrendingUp} tone="primary" sub="Monthly recurring revenue" />
        <KpiCard label="ARR (run-rate)" value={`€${(activeMrr * 12).toLocaleString()}`} sub="Projected annual" />
        <KpiCard label="Subscriptions" value={data.subscriptions.length} icon={CreditCard} sub={`${data.subscriptions.filter((s) => s.status === "ACTIVE").length} active`} />
        <KpiCard label="Pending transfers" value={data.pendingPayments} tone={data.pendingPayments ? "warning" : "success"} sub={data.pendingPayments ? "Bank transfers awaiting approval" : "Nothing awaiting approval"} />
      </div>

      {/* Manual payments awaiting approval (bank-transfer mode) */}
      {data.payments.some((p) => p.status === "PENDING") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bank transfers awaiting approval</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="docurama-scroll overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Plan / term</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.payments.filter((p) => p.status === "PENDING").map((p) => (
                    <TableRow key={p.id}>
                      <TableCell><code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{p.reference}</code></TableCell>
                      <TableCell className="max-w-[180px]"><p className="truncate font-medium">{p.tenantName}</p></TableCell>
                      <TableCell>{p.description}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">€{(p.amountCents / 100).toFixed(2)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(p.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <ConfirmDialog
                            trigger={
                              <Button variant="outline" size="sm" className="h-11" aria-label={`Approve payment ${p.reference} for ${p.tenantName}`}>
                                <BadgeCheck className="h-4 w-4" aria-hidden /> Approve
                              </Button>
                            }
                            title={`Approve ${p.reference}?`}
                            description={`Confirm the bank transfer of €${(p.amountCents / 100).toFixed(2)} for ${p.tenantName} has been received. The plan activates immediately for ${p.termMonths} month(s).`}
                            confirmLabel="Approve & activate"
                            requireReason
                            reasonLabel="Bank reference / receipt"
                            onConfirm={(note) => act.mutateAsync({ op: "payment.approve", id: p.id, data: { note } })}
                          />
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" size="sm" className="h-11 text-destructive hover:text-destructive" aria-label={`Cancel payment ${p.reference}`}>
                                Decline
                              </Button>
                            }
                            title={`Decline ${p.reference}?`}
                            description="The payment request is marked canceled. The tenant keeps its current plan and sees the cancellation in billing history."
                            confirmLabel="Decline request"
                            requireReason
                            onConfirm={(reason) => act.mutateAsync({ op: "payment.cancel", id: p.id, data: { note: reason } })}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">MRR trend - last 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56" role="img" aria-label="Area chart of monthly recurring revenue over the last 30 days">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f7a5a" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0f7a5a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} />
                <ChartTooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                  formatter={(value: number) => [`€${value.toLocaleString()}`, "MRR"]}
                />
                <Area type="monotone" dataKey="mrr" stroke="#0f7a5a" strokeWidth={2} fill="url(#mrrFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Subscriptions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscriptions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="docurama-scroll overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Seats</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead>Renews</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.subscriptions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="max-w-[200px]">
                      <p className="truncate font-medium">{s.tenantName}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.paymentMethod}</p>
                    </TableCell>
                    <TableCell><StatusBadge status={s.planCode} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={s.status} />
                        {s.failedPayment && <span className="text-xs text-destructive">payment failed</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.seats}</TableCell>
                    <TableCell className="text-right tabular-nums">€{s.mrrEur}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(s.renewalAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {s.failedPayment && (
                          <Button
                            variant="outline" size="sm" className="h-11"
                            onClick={() => act.mutate({ op: "retry-payment", id: s.id })}
                            aria-label={`Retry payment for ${s.tenantName}`}
                          >
                            <RotateCcw className="h-4 w-4" aria-hidden /> Retry
                          </Button>
                        )}
                        {s.status === "ACTIVE" && (
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" size="sm" className="h-11 text-destructive hover:text-destructive" aria-label={`Cancel subscription of ${s.tenantName}`}>
                                Cancel
                              </Button>
                            }
                            title={`Cancel ${s.tenantName}?`}
                            description="The subscription ends at the current period. The workspace drops to read-only when the period lapses."
                            confirmLabel="Cancel at period end"
                            requireReason
                            onConfirm={(reason) => act.mutateAsync({ op: "cancel-subscription", id: s.id, data: { reason } })}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Plans */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan catalogue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {data.plans.map((p) => (
              <div key={p.id} className="space-y-3 rounded-xl border bg-card p-5">
                <div className="flex items-center justify-between">
                  <StatusBadge status={p.code} />
                  <p className="text-lg font-semibold">€{p.monthlyEur}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
                </div>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li>{p.envelopeLimit.toLocaleString()} envelopes / month</li>
                  <li>{p.seatLimit} seats · {p.storageGb} GB storage</li>
                  <li>{p.apiAccess ? "API + webhooks" : "No API access"}</li>
                  <li>{p.slaUptime} SLA · {p.support}</li>
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
