"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Save, Send, ExternalLink, Wallet, BadgePercent, ShieldCheck } from "lucide-react";
import { apiGet } from "@/lib/client";
import { ErrorState, StatusBadge, fmtDate, cn } from "@/components/portal/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettingsAct, ToggleRow, TIER_BADGE } from "./settings-shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SMS_PROVIDERS, RECOMMENDED_PROVIDERS, providerByKey } from "@/lib/sms-providers";

type SmsData = {
  gateway: {
    provider: string;
    apiKeyMasked: string | null; hasApiKey: boolean;
    apiSecretMasked: string | null; hasApiSecret: boolean;
    senderId: string; lowCostMode: boolean;
    whatsappEnabled: boolean; whatsappProvider: string | null;
    whatsappApiKeyMasked: string | null; hasWhatsappApiKey: boolean;
    status: string;
    lastTestAt: string | null; lastTestStatus: string | null; lastTestTo: string | null;
  };
};

const sortedProviders = [
  ...SMS_PROVIDERS.filter((p) => RECOMMENDED_PROVIDERS.includes(p.key)),
  ...SMS_PROVIDERS.filter((p) => !RECOMMENDED_PROVIDERS.includes(p.key)),
];

export function SmsTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["workspace", "settings-sms"],
    queryFn: () => apiGet<SmsData>("/api/workspace/settings-sms"),
  });

  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4" aria-busy>
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
        <div className="h-96 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <GatewayCard g={data.gateway} />
      <ProviderCatalogCard lowCost={data.gateway.lowCostMode} current={data.gateway.provider} />
    </div>
  );
}

// ── Gateway configuration ────────────────────────────────────────────────────

function GatewayCard({ g }: { g: SmsData["gateway"] }) {
  const act = useSettingsAct(["settings-sms"]);
  const [form, setForm] = useState({
    provider: g.provider,
    apiKey: "",
    apiSecret: "",
    senderId: g.senderId,
    lowCostMode: g.lowCostMode,
    whatsappEnabled: g.whatsappEnabled,
    whatsappProvider: g.whatsappProvider ?? "whatsapp-cloud",
    whatsappApiKey: "",
  });
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const meta = providerByKey(form.provider);

  const fieldDefs = meta?.fields.filter((f) => f.key !== "whatsappApiKey") ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden /> SMS delivery gateway
        </CardTitle>
        <CardDescription>
          Send one-time codes and reminders by SMS. 14 researched providers - including genuinely free tiers (WhatsApp Cloud API) and EU low-cost routes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="prov">Provider</Label>
              <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v, apiKey: "", apiSecret: "" })}>
                <SelectTrigger id="prov" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sortedProviders.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.name} {p.tier === "free" ? "· free tier" : p.tier === "trial" ? "· trial credit" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {meta && (
                <p className="text-xs text-muted-foreground">
                  {meta.freeTier} · {meta.priceHint} ·{" "}
                  <a href={meta.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2">
                    API docs <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </p>
              )}
            </div>

            {fieldDefs.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`f-${f.key}`}>
                  {f.label}
                  {(f.key === "apiKey" || f.key === "apiSecret") && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {f.key === "apiKey" ? (g.hasApiKey && g.provider === form.provider ? `(saved: ${g.apiKeyMasked})` : "") : (g.hasApiSecret && g.provider === form.provider ? `(saved: ${g.apiSecretMasked})` : "")}
                    </span>
                  )}
                </Label>
                <Input
                  id={`f-${f.key}`}
                  type={f.key === "apiSecret" ? "password" : "text"}
                  value={f.key === "apiKey" ? form.apiKey : form.apiSecret}
                  onChange={(e) => setForm(f.key === "apiKey" ? { ...form, apiKey: e.target.value } : { ...form, apiSecret: e.target.value })}
                  className="h-11 font-mono text-sm"
                  autoComplete="off"
                  placeholder={f.hint}
                />
              </div>
            ))}

            <div className="space-y-1.5">
              <Label htmlFor="sender">Sender ID</Label>
              <Input id="sender" value={form.senderId} onChange={(e) => setForm({ ...form, senderId: e.target.value.toUpperCase().slice(0, 11) })} className="h-11 font-mono text-sm" maxLength={11} />
              <p className="text-xs text-muted-foreground">Up to 11 characters. Alphanumeric sender IDs are not available on all routes.</p>
            </div>

            <ToggleRow
              checked={form.lowCostMode}
              onCheckedChange={(v) => setForm({ ...form, lowCostMode: v })}
              label="Low-cost routing preference"
              desc="Prefer the cheapest capable route per destination (may trade a little latency)"
            />
          </div>

          <div className="space-y-4">
            <div className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden /> Optional WhatsApp channel
                </p>
                <Select value={form.whatsappProvider} onValueChange={(v) => setForm({ ...form, whatsappProvider: v })} disabled={!form.whatsappEnabled}>
                  <SelectTrigger className="h-9 w-44 text-xs" aria-label="WhatsApp provider"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp-cloud">Meta WhatsApp Cloud API</SelectItem>
                    <SelectItem value="twilio">Twilio WhatsApp</SelectItem>
                    <SelectItem value="360dialog">360dialog</SelectItem>
                    <SelectItem value="messagebird">Bird</SelectItem>
                    <SelectItem value="infobip">Infobip</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <ToggleRow
                checked={form.whatsappEnabled}
                onCheckedChange={(v) => setForm({ ...form, whatsappEnabled: v })}
                label="Enable WhatsApp delivery"
                desc="1,000 free user-initiated conversations/month on the Cloud API - the cheapest signer-verification channel"
              />
              {form.whatsappEnabled && (
                <div className="space-y-1.5">
                  <Label htmlFor="wa-key">
                    WhatsApp access token
                    <span className="ml-1 text-xs text-muted-foreground">{g.hasWhatsappApiKey ? `(saved: ${g.whatsappApiKeyMasked})` : ""}</span>
                  </Label>
                  <Input
                    id="wa-key" type="password" value={form.whatsappApiKey}
                    onChange={(e) => setForm({ ...form, whatsappApiKey: e.target.value })}
                    className="h-11 font-mono text-sm" autoComplete="off"
                    placeholder="Permanent token from Meta for Developers"
                  />
                  <p className="text-xs text-muted-foreground">
                    Cloud API tokens are validated live against Meta&apos;s servers when you test - no fake green lights.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-xl border p-4">
              <p className="text-sm font-medium">Test the gateway</p>
              <div className="flex gap-2">
                <Input
                  value={testTo} onChange={(e) => setTestTo(e.target.value)}
                  className="h-11 font-mono text-sm" placeholder="+33612345678"
                  aria-label="Test destination number"
                />
                <Button
                  variant="outline" className="h-11 shrink-0"
                  disabled={testing || !testTo}
                  onClick={async () => { setTesting(true); await act.mutateAsync({ op: "sms.test", data: { to: testTo } }).catch(() => undefined); setTesting(false); }}
                >
                  <Send className="h-4 w-4" aria-hidden /> {testing ? "Testing…" : "Validate"}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusBadge status={g.status === "tested" ? "ACTIVE" : g.status === "error" ? "FAILED" : g.status.toUpperCase().replaceAll("_", " ")} />
                {g.lastTestAt && <>last test {fmtDate(g.lastTestAt)}{g.lastTestTo ? ` → ${g.lastTestTo}` : ""}</>}
              </div>
              {g.lastTestStatus && <p className="text-xs text-muted-foreground">{g.lastTestStatus === "OK" ? "Configuration validated" : "Last validation failed - check the credentials"}</p>}
            </div>
          </div>
        </div>

        <Button className="h-11" disabled={act.isPending} onClick={() => act.mutate({ op: "sms.save", data: form })}>
          <Save className="h-4 w-4" aria-hidden /> Save gateway
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Researched provider catalogue ────────────────────────────────────────────

function ProviderCatalogCard({ lowCost, current }: { lowCost: boolean; current: string }) {
  const act = useSettingsAct(["settings-sms"]);
  const [onlyCheap, setOnlyCheap] = useState(lowCost);
  const list = onlyCheap ? sortedProviders.filter((p) => p.lowCost) : sortedProviders;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden /> SMS &amp; WhatsApp providers - free and low-cost research
          </CardTitle>
          <CardDescription>
            Fourteen gateways researched for a French/EU sender. Free tiers in green; “low-cost” picks are typically 40-70% below Twilio list prices.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" className="h-10" onClick={() => setOnlyCheap((v) => !v)} aria-pressed={onlyCheap}>
          <BadgePercent className="h-4 w-4" aria-hidden /> {onlyCheap ? "Showing low-cost only" : "Show low-cost only"}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">SMS and WhatsApp provider comparison</caption>
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="p-3 font-medium">Provider</th>
                <th scope="col" className="p-3 font-medium">Channels</th>
                <th scope="col" className="p-3 font-medium">Tier</th>
                <th scope="col" className="p-3 font-medium">Free allowance</th>
                <th scope="col" className="p-3 font-medium">Price hint</th>
                <th scope="col" className="p-3 font-medium">Regions</th>
                <th scope="col" className="p-3 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.key} className={cn("border-b last:border-0", p.key === current && "bg-primary-soft/20")}>
                  <td className="p-3">
                    <p className="font-medium">
                      {p.name}
                      {p.key === current && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">IN USE</span>}
                    </p>
                    {p.notes && <p className="mt-0.5 max-w-xs text-xs text-muted-foreground">{p.notes}</p>}
                  </td>
                  <td className="p-3 text-xs">
                    {p.channels.map((c) => (
                      <span key={c} className="mr-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase">{c}</span>
                    ))}
                  </td>
                  <td className="p-3">
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", TIER_BADGE[p.tier].className)}>
                      {TIER_BADGE[p.tier].label}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{p.freeTier}</td>
                  <td className="p-3 text-xs text-muted-foreground">{p.priceHint}</td>
                  <td className="p-3 text-xs text-muted-foreground">{p.regions}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a href={p.docsUrl} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`${p.name} documentation`}><ExternalLink className="h-4 w-4" aria-hidden /></Button>
                      </a>
                      {p.key !== current && (
                        <Button
                          variant="outline" size="sm" className="h-9"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ op: "sms.save", data: { provider: p.key, senderId: "DOCURAMA", lowCostMode: onlyCheap } })}
                        >
                          Use
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Optional by design: SMS/WhatsApp is an add-on channel - the workspace works fully with email-only flows, and the gateway stays “not configured” until you save credentials.
        </p>
      </CardContent>
    </Card>
  );
}
