"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Plus, Terminal, BookOpen, Webhook, Copy } from "lucide-react";
import { apiGet } from "@/lib/client";
import { ConfirmDialog, CopyableCode, ErrorState, StatusBadge, fmtDate, cn } from "@/components/portal/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettingsAct } from "./settings-shared";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_REFERENCE, WEBHOOK_EVENTS, quickstartSnippets, type ApiEndpoint } from "@/lib/api-reference";

type KeysData = {
  apiKeys: { id: string; name: string; prefix: string; scope: string; status: string; lastUsedAt: string | null; createdAt: string }[];
};

const SNIPPET_TABS = ["curl", "javascript", "python"] as const;

export function ApiTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["workspace", "settings"],
    queryFn: () => apiGet<KeysData>("/api/workspace/settings"),
  });
  const [snippet, setSnippet] = useState<(typeof SNIPPET_TABS)[number]>("curl");

  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4" aria-busy>
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  // Base URL derived client-side (these cards mount only after the query
  // resolves - post-hydration - so window is always available here).
  const base = typeof window !== "undefined" ? window.location.origin : "https://app.docurama.eu";
  const snippets = quickstartSnippets(base);

  return (
    <div className="space-y-6">
      <KeysCard keys={data.apiKeys} />
      <QuickstartCard snippet={snippet} onSnippet={setSnippet} snippets={snippets} />
      <ReferenceCard />
      <WebhooksCard />
    </div>
  );
}

// ── API keys ─────────────────────────────────────────────────────────────────

function KeysCard({ keys }: { keys: KeysData["apiKeys"] }) {
  const act = useSettingsAct(["settings"]);
  const [dialog, setDialog] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", scope: "READONLY" });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden /> API authentication keys
          </CardTitle>
          <CardDescription>
            Scoped credentials for server-to-server access to <span className="font-mono text-xs">/api/v1</span> and <span className="font-mono text-xs">/api/mcp</span>. The full key is shown once; only its SHA-256 hash is stored.
          </CardDescription>
        </div>
        <Button size="sm" className="h-10" onClick={() => setDialog(true)}>
          <Plus className="h-4 w-4" aria-hidden /> New key
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {keys.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No API keys - create one to use the Docurama REST API and MCP server.</p>
        ) : (
          <ul className="divide-y">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{k.name}</p>
                  <p className="text-xs text-muted-foreground">created {fmtDate(k.createdAt)} · last used {k.lastUsedAt ? fmtDate(k.lastUsedAt) : "never"}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <CopyableCode value={k.prefix} max={14} />
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k.scope}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={k.status} />
                  {k.status === "ACTIVE" && (
                    <ConfirmDialog
                      trigger={<Button variant="outline" size="sm" className="h-11 text-destructive hover:text-destructive">Revoke</Button>}
                      title={`Revoke ${k.prefix}?`}
                      description="Requests using this key are rejected immediately. Your other keys keep working."
                      confirmLabel="Revoke key"
                      onConfirm={() => act.mutateAsync({ op: "revoke-key", id: k.id })}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>The full secret is displayed once - store it securely.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wkey-name">Key name</Label>
              <Input id="wkey-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. CRM integration" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wkey-scope">Scope</Label>
              <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v })}>
                <SelectTrigger id="wkey-scope" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="READONLY">Read-only - envelopes + verification</SelectItem>
                  <SelectItem value="ENVELOPES">Envelopes - full envelope access</SelectItem>
                  <SelectItem value="TEMPLATES">Templates - template catalogue</SelectItem>
                  <SelectItem value="FULL">Full access - everything incl. MCP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
            <Button
              disabled={!form.name.trim() || act.isPending}
              onClick={async () => {
                const res = await act.mutateAsync({ op: "create-key", data: form }).catch(() => undefined);
                setDialog(false);
                setForm({ name: "", scope: "READONLY" });
                if (res && typeof (res as { key?: unknown }).key === "string") {
                  setCreated((res as { key?: unknown }).key as string);
                }
              }}
            >
              Create key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full secret - shown exactly once */}
      <Dialog open={Boolean(created)} onOpenChange={(v) => { if (!v) setCreated(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Copy your API key now</DialogTitle>
            <DialogDescription>
              This is the only time the full key is displayed. Docurama stores a SHA-256 hash - it cannot be recovered.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <code className="min-w-0 break-all font-mono text-sm">{created}</code>
              <Button
                variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                aria-label="Copy key"
                onClick={() => navigator.clipboard?.writeText(created ?? "").catch(() => undefined)}
              >
                <Copy className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>I stored it safely</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Integration quickstart ───────────────────────────────────────────────────

function QuickstartCard({
  snippet, onSnippet, snippets,
}: {
  snippet: string;
  onSnippet: (s: (typeof SNIPPET_TABS)[number]) => void;
  snippets: { lang: string; code: string }[];
}) {
  const current = snippets.find((s) => s.lang === snippet) ?? snippets[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Terminal className="h-4 w-4 text-muted-foreground" aria-hidden /> Integration quickstart
        </CardTitle>
        <CardDescription>
          Copy-paste working examples against this deployment. Replace the key placeholder with a key created above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1" role="tablist" aria-label="Snippet language">
            {SNIPPET_TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={snippet === t}
                onClick={() => onSnippet(t)}
                className={cn(
                  "min-h-9 rounded-lg px-3 text-xs font-medium transition-colors",
                  snippet === t ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-accent",
                )}
              >
                {t === "javascript" ? "JavaScript" : t === "python" ? "Python" : "cURL"}
              </button>
            ))}
          </div>
          <Button
            variant="outline" size="sm" className="h-9"
            onClick={() => navigator.clipboard?.writeText(current.code).catch(() => undefined)}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
          </Button>
        </div>
        <pre className="docurama-scroll overflow-x-auto rounded-xl bg-nautical p-4 text-xs leading-relaxed text-white/90">
          <code>{current.code}</code>
        </pre>
        <p className="text-xs text-muted-foreground">
          Errors are uniform JSON: <code className="rounded bg-muted px-1 py-0.5">{`{ "error": "message" }`}</code> with honest HTTP codes (401 bad key, 403 scope, 404 missing, 429 rate-limited).
        </p>
      </CardContent>
    </Card>
  );
}

// ── Complete reference & schemas ─────────────────────────────────────────────

function ReferenceCard() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden /> Complete API reference &amp; schemas
        </CardTitle>
        <CardDescription>
          Every endpoint below is live on this deployment. Authentication: session (portal) or <span className="font-mono text-xs">X-API-Key</span> (integrations).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {API_REFERENCE.map((group) => (
          <div key={group.name} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.name}</p>
            <p className="text-xs text-muted-foreground">{group.description}</p>
            <ul className="space-y-2">
              {group.endpoints.map((ep: ApiEndpoint) => {
                const key = `${ep.method} ${ep.path}`;
                const expanded = open === key;
                return (
                  <li key={key} className="rounded-lg border">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : key)}
                      className="flex w-full flex-wrap items-center gap-2 p-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className={cn(
                        "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold",
                        ep.method === "GET" ? "bg-success/15 text-success" : "bg-info/15 text-info",
                      )}>
                        {ep.method}
                      </span>
                      <code className="font-mono text-xs">{ep.path}</code>
                      <span className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                        ep.auth === "api-key" ? "bg-primary/15 text-primary" : ep.auth === "session" ? "bg-muted text-muted-foreground" : "bg-success/15 text-success",
                      )}>
                        {ep.auth === "api-key" ? "API key" : ep.auth}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{ep.summary}</span>
                    </button>
                    {expanded && (
                      <div className="space-y-3 border-t p-3">
                        {ep.params && (
                          <div>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Parameters</p>
                            <ul className="space-y-1">
                              {ep.params.map((p) => (
                                <li key={p.name} className="text-xs">
                                  <code className="rounded bg-muted px-1 py-0.5 font-mono">{p.name}</code>
                                  <span className="ml-1.5 text-muted-foreground">({p.type}) - {p.description}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="grid gap-3 lg:grid-cols-2">
                          {ep.request && (
                            <div>
                              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Request</p>
                              <pre className="docurama-scroll overflow-x-auto rounded-lg bg-muted/60 p-3 text-[11px] leading-relaxed"><code>{ep.request}</code></pre>
                            </div>
                          )}
                          <div>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Response</p>
                            <pre className="docurama-scroll overflow-x-auto rounded-lg bg-muted/60 p-3 text-[11px] leading-relaxed"><code>{ep.response}</code></pre>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Webhook events ───────────────────────────────────────────────────────────

type WebhooksData = {
  endpoints: { id: string; url: string; events: string; status: string; secretMasked: string; successRate: number; lastDeliveryAt: string | null; createdAt: string }[];
  deliveries: { id: string; event: string; statusCode: number; success: boolean; attempts: number; at: string; url: string }[];
};

function WebhooksCard() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["workspace", "settings-webhooks"],
    queryFn: () => apiGet<WebhooksData>("/api/workspace/settings-webhooks"),
  });
  const act = useSettingsAct(["settings-webhooks"]);
  const [dialog, setDialog] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [form, setForm] = useState({ url: "", events: ["envelope.sent", "envelope.completed"] as string[] });

  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  const endpoints = data?.endpoints ?? [];
  const deliveries = data?.deliveries ?? [];

  const toggleEvent = (event: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter((e) => e !== event) : [...f.events, event],
    }));
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Webhook className="h-4 w-4 text-muted-foreground" aria-hidden /> Webhook endpoints
          </CardTitle>
          <CardDescription>
            Signed <span className="font-mono text-xs">POST</span> notifications when envelope events happen. Every delivery carries an <span className="font-mono text-xs">X-Docurama-Signature</span> HMAC-SHA256 header and is retried with exponential backoff.
          </CardDescription>
        </div>
        <Button size="sm" className="h-10" onClick={() => setDialog(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Add endpoint
        </Button>
      </CardHeader>
      <CardContent className="p-0" aria-busy={isLoading}>
        {endpoints.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No endpoints registered - add one to receive envelope events on your server.</p>
        ) : (
          <ul className="divide-y">
            {endpoints.map((h) => (
              <li key={h.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-medium">{h.url}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {h.successRate}% success · last delivery {h.lastDeliveryAt ? fmtDate(h.lastDeliveryAt) : "never"} · secret {h.secretMasked}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {h.events.split("|").map((ev) => (
                      <span key={ev} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{ev}</span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={h.status} />
                  <Button
                    variant="outline" size="sm" className="h-11"
                    onClick={() => act.mutateAsync({ op: "webhook.toggle", id: h.id })}
                  >
                    {h.status === "PAUSED" ? "Resume" : "Pause"}
                  </Button>
                  <ConfirmDialog
                    trigger={<Button variant="outline" size="sm" className="h-11 text-destructive hover:text-destructive">Delete</Button>}
                    title="Delete this endpoint?"
                    description="Your server stops receiving events immediately. Delivery history for this endpoint is removed."
                    confirmLabel="Delete endpoint"
                    onConfirm={() => act.mutateAsync({ op: "webhook.delete", id: h.id })}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {deliveries.length > 0 && (
          <div className="border-t p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent deliveries</p>
            <ul className="space-y-1">
              {deliveries.slice(0, 5).map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", d.success ? "bg-success" : "bg-destructive")} aria-hidden />
                  <code className="font-mono">{d.event}</code>
                  <span className="truncate">{d.url}</span>
                  <span className="ml-auto shrink-0">{d.success ? d.statusCode : `${d.statusCode || "network error"} · attempt ${d.attempts}`}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add webhook endpoint</DialogTitle>
            <DialogDescription>
              https URLs only (http for localhost). Verify the <span className="font-mono text-xs">X-Docurama-Signature</span> header on your side with the signing secret.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wh-url">Endpoint URL</Label>
              <Input
                id="wh-url" value={form.url} className="h-11"
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://api.yourcompany.com/docurama/hooks"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Events</Label>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {WEBHOOK_EVENTS.map((e) => (
                  <label key={e.event} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors hover:bg-muted/50">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={form.events.includes(e.event)}
                      onChange={() => toggleEvent(e.event)}
                    />
                    <span className="min-w-0">
                      <code className="font-mono">{e.event}</code>
                      <span className="block text-muted-foreground">{e.when}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
            <Button
              disabled={!form.url.trim() || form.events.length === 0 || act.isPending}
              onClick={async () => {
                const res = await act.mutateAsync({ op: "webhook.create", data: form }).catch(() => undefined);
                setDialog(false);
                setForm({ url: "", events: ["envelope.sent", "envelope.completed"] });
                if (res && typeof (res as { secret?: unknown }).secret === "string") {
                  setCreated((res as { secret?: unknown }).secret as string);
                }
              }}
            >
              Register endpoint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signing secret - shown exactly once at creation */}
      <Dialog open={Boolean(created)} onOpenChange={(v) => { if (!v) setCreated(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Copy your signing secret now</DialogTitle>
            <DialogDescription>
              Verify deliveries with <span className="font-mono text-xs">HMAC-SHA256(secret, raw body)</span> against the <span className="font-mono text-xs">X-Docurama-Signature</span> header. This is the only time the secret is displayed.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <code className="min-w-0 break-all font-mono text-sm">{created}</code>
              <Button
                variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                aria-label="Copy signing secret"
                onClick={() => navigator.clipboard?.writeText(created ?? "").catch(() => undefined)}
              >
                <Copy className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>I stored it safely</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
