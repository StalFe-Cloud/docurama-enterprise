"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Save, Copy, Plug } from "lucide-react";
import { apiGet } from "@/lib/client";
import { ErrorState, StatusBadge, fmtDate, cn } from "@/components/portal/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useSettingsAct, ToggleRow } from "./settings-shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type McpData = {
  config: { enabled: boolean; transport: string; allowedTools: string[]; rateLimitPerMin: number; updatedAt: string };
  tools: { name: string; description: string; scope: string }[];
  defaultTools: string[];
};

export function McpTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["workspace", "settings-mcp"],
    queryFn: () => apiGet<McpData>("/api/workspace/settings-mcp"),
  });

  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4" aria-busy>
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  // Cards mount client-side after the query resolves - window is available.
  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.docurama.eu";

  return (
    <div className="space-y-6">
      <McpConfigCard data={data} origin={origin} />
      <McpConnectCard enabled={data.config.enabled} origin={origin} />
      <McpToolsCard data={data} />
    </div>
  );
}

function McpConfigCard({ data }: { data: McpData; origin: string }) {
  const act = useSettingsAct(["settings-mcp"]);
  const [form, setForm] = useState({
    enabled: data.config.enabled,
    transport: data.config.transport,
    allowedTools: data.config.allowedTools,
    rateLimitPerMin: data.config.rateLimitPerMin,
  });
  const dirty =
    form.enabled !== data.config.enabled ||
    form.transport !== data.config.transport ||
    form.rateLimitPerMin !== data.config.rateLimitPerMin ||
    form.allowedTools.join(",") !== data.config.allowedTools.join(",");

  const toggleTool = (name: string, checked: boolean) => {
    setForm((f) => ({
      ...f,
      allowedTools: checked ? [...f.allowedTools, name] : f.allowedTools.filter((t) => t !== name),
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4 text-muted-foreground" aria-hidden /> MCP server - Model Context Protocol
        </CardTitle>
        <CardDescription>
          Expose this workspace to AI assistants (Claude Desktop, Cursor, custom agents) over JSON-RPC 2.0. Authenticated with an API key from Settings → API.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ToggleRow
              checked={form.enabled}
              onCheckedChange={(v) => setForm({ ...form, enabled: v })}
              label="Enable the MCP server"
              desc={`Endpoint: ${origin}/api/mcp - JSON-RPC 2.0 over HTTP (initialize, tools/list, tools/call)`}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-transport">Transport</Label>
            <Select value={form.transport} onValueChange={(v) => setForm({ ...form, transport: v })}>
              <SelectTrigger id="mcp-transport" className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="streamable-http">Streamable HTTP</SelectItem>
                <SelectItem value="sse">HTTP + SSE</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Exposed tools ({form.allowedTools.length})</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.tools.map((t) => (
              <label
                key={t.name}
                className={cn(
                  "flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors",
                  form.allowedTools.includes(t.name) ? "border-primary bg-primary-soft/20" : "hover:bg-muted/50",
                )}
              >
                <Checkbox
                  checked={form.allowedTools.includes(t.name)}
                  onCheckedChange={(v) => toggleTool(t.name, v === true)}
                  aria-label={`Expose ${t.name}`}
                />
                <span>
                  <span className="font-mono text-xs font-medium">{t.name}</span>
                  <span className="block text-xs text-muted-foreground">{t.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mcp-rate">Rate limit (requests / minute / key)</Label>
            <Input
              id="mcp-rate" type="number" min={10} max={600} value={form.rateLimitPerMin}
              onChange={(e) => setForm({ ...form, rateLimitPerMin: Number(e.target.value) })}
              className="h-11"
            />
          </div>
          <div className="flex items-end justify-between gap-3">
            <p className="text-xs text-muted-foreground">Last updated {fmtDate(data.config.updatedAt)}</p>
            <Button
              className="h-11"
              disabled={!dirty || act.isPending || (form.enabled && form.allowedTools.length === 0)}
              onClick={() => act.mutate({ op: "mcp.save", data: { ...form, allowedTools: form.allowedTools } })}
            >
              <Save className="h-4 w-4" aria-hidden /> Save MCP server
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function McpConnectCard({ enabled, origin }: { enabled: boolean; origin: string }) {
  const snippet = JSON.stringify(
    {
      mcpServers: {
        docurama: {
          type: "http",
          url: `${origin}/api/mcp`,
          headers: { "X-API-Key": "dk_live_xxxxxxxxxxxxxxxx" },
        },
      },
    },
    null,
    2,
  );
  const testSnippet = `curl -s ${origin}/api/mcp \\
  -H "X-API-Key: dk_live_xxxxxxxxxxxxxxxx" \\
  -H "content-type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="h-4 w-4 text-muted-foreground" aria-hidden /> Connect an assistant
        </CardTitle>
        <CardDescription>
          Add this block to <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">claude_desktop_config.json</code> (or your client&apos;s MCP settings), with a real API key.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge status={enabled ? "ACTIVE" : "OFF"} />
          <span className="text-xs text-muted-foreground">{enabled ? "Server responds at /api/mcp" : "Enable the server above to accept requests"}</span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Client configuration (Claude Desktop &amp; compatible)</Label>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => navigator.clipboard?.writeText(snippet).catch(() => undefined)}>
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
            </Button>
          </div>
          <pre className="docurama-scroll overflow-x-auto rounded-xl bg-nautical p-4 text-xs leading-relaxed text-white/90"><code>{snippet}</code></pre>
        </div>
        <div className="space-y-1.5">
          <Label>Test with curl</Label>
          <pre className="docurama-scroll overflow-x-auto rounded-xl bg-muted/60 p-4 text-xs leading-relaxed"><code>{testSnippet}</code></pre>
        </div>
      </CardContent>
    </Card>
  );
}

function McpToolsCard({ data }: { data: McpData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4 text-muted-foreground" aria-hidden /> Tool catalogue
        </CardTitle>
        <CardDescription>Each tool executes real queries against this workspace, scoped by the API key used.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border">
          {data.tools.map((t) => (
            <li key={t.name} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="font-mono text-xs font-medium">{t.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">min scope: {t.scope}</span>
                {data.config.allowedTools.includes(t.name) && <StatusBadge status="ACTIVE" />}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
