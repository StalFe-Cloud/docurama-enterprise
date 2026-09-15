"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, Timer, Flag, Send, Save, Lock } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/client";
import { ConfirmDialog, CopyableCode, ErrorState, PageHeader, daysUntil } from "@/components/portal/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

type PlatformSettings = {
  smtpHost: string; smtpPort: number; smtpUser: string; smtpFrom: string; smtpTls: boolean;
  tsaUrl: string; tsaReachable: boolean; certFingerprint: string; certExpiryAt: string;
  signingConformance: string; trialLengthDays: number; maintenanceMode: boolean;
  featureFlags: string; sweeperLastRunAt: string; version: string;
  auditChainBlockHeight: number; auditChainSealedAt: string;
};

type FeatureFlags = { smsDelivery: boolean; bulkSend: boolean; webhooks: boolean; passkeys: boolean; aiFieldDetect: boolean; euResidencyOnly: boolean };
const FLAG_META: { key: keyof FeatureFlags; label: string; desc: string }[] = [
  { key: "smsDelivery", label: "SMS delivery", desc: "SMS OTP for signer authentication (EU regions)" },
  { key: "bulkSend", label: "Bulk send", desc: "Send one envelope to up to 100 recipients" },
  { key: "webhooks", label: "Webhooks", desc: "Outbound event delivery to tenant endpoints" },
  { key: "passkeys", label: "Passkey sign-in", desc: "FIDO2 passkeys for workspace members" },
  { key: "aiFieldDetect", label: "AI field detection", desc: "Automatic signature field detection in Builder" },
  { key: "euResidencyOnly", label: "EU residency only", desc: "Reject tenants with non-EU billing countries" },
];

type Act = ReturnType<typeof useAct>;

function useAct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { op: string; data?: Record<string, unknown> }) =>
      apiPost<{ ok: boolean; message: string }>("/api/admin/settings", vars),
    onSuccess: (res) => {
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
    onError: (err: ApiError) => toast.error(err.message),
  });
}

/** Form body - mounted once data is available so every field starts from saved server state. */
function SettingsBody({ settings, act }: { settings: PlatformSettings; act: Act }) {
  const [smtp, setSmtp] = useState({
    smtpHost: settings.smtpHost, smtpPort: settings.smtpPort,
    smtpUser: settings.smtpUser, smtpFrom: settings.smtpFrom, smtpTls: settings.smtpTls,
  });
  const [tsaUrl, setTsaUrl] = useState(settings.tsaUrl);
  const [trialDays, setTrialDays] = useState(settings.trialLengthDays);
  const [maintenance, setMaintenance] = useState(settings.maintenanceMode);
  const [flags, setFlags] = useState<FeatureFlags>(() => {
    try { return JSON.parse(settings.featureFlags); } catch { return {} as FeatureFlags; }
  });

  const certDays = daysUntil(settings.certExpiryAt);

  return (
    <>
      {/* SMTP */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-muted-foreground" aria-hidden /> Email delivery (SMTP)
          </CardTitle>
          <CardDescription>
            Used for signing invitations, reminders and completion notices. Audit events record the real delivery outcome.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-host">Host</Label>
              <Input id="smtp-host" value={smtp.smtpHost} onChange={(e) => setSmtp({ ...smtp, smtpHost: e.target.value })} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-port">Port</Label>
              <Input id="smtp-port" type="number" value={smtp.smtpPort} onChange={(e) => setSmtp({ ...smtp, smtpPort: Number(e.target.value) })} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-user">Username</Label>
              <Input id="smtp-user" value={smtp.smtpUser} onChange={(e) => setSmtp({ ...smtp, smtpUser: e.target.value })} className="h-11" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp-from">Sender identity</Label>
              <Input id="smtp-from" value={smtp.smtpFrom} onChange={(e) => setSmtp({ ...smtp, smtpFrom: e.target.value })} className="h-11" />
              <p className="text-xs text-muted-foreground">
                Recommended: <span className="font-mono">Docurama Sign &lt;notifications@docurama.eu&gt;</span> - provisioned under Email &amp; DNS.
              </p>
            </div>
          </div>
          <label className="flex min-h-11 items-center justify-between gap-4 rounded-lg border p-3">
            <span className="text-sm">
              Use TLS
              <span className="block text-xs text-muted-foreground">STARTTLS on submission</span>
            </span>
            <Switch checked={smtp.smtpTls} onCheckedChange={(v) => setSmtp({ ...smtp, smtpTls: v })} aria-label="Use TLS for SMTP" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button className="h-11" onClick={() => act.mutate({ op: "save-smtp", data: smtp })} disabled={act.isPending}>
              <Save className="h-4 w-4" aria-hidden /> Save SMTP
            </Button>
            <Button variant="outline" className="h-11" onClick={() => act.mutate({ op: "test-smtp" })} disabled={act.isPending}>
              <Send className="h-4 w-4" aria-hidden /> Send test email
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Signing infrastructure */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Timer className="h-4 w-4 text-muted-foreground" aria-hidden /> Signing infrastructure
          </CardTitle>
          <CardDescription>Timestamp authority and platform sealing certificate.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tsa-url">RFC 3161 timestamp authority URL</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="tsa-url" value={tsaUrl} onChange={(e) => setTsaUrl(e.target.value)} className="h-11" />
              <Button className="h-11 shrink-0" onClick={() => act.mutate({ op: "save-tsa", data: { tsaUrl } })} disabled={act.isPending}>
                Save TSA
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Current status: {settings.tsaReachable ? "reachable - timestamps applied to every seal" : "unreachable - seals fall back to B-B conformance"}
            </p>
          </div>
          <Separator />
          <div className="space-y-2">
            <p className="text-sm font-medium">Sealing certificate</p>
            <div className="space-y-1.5 rounded-lg border p-3 text-sm">
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">Fingerprint</span>
                <CopyableCode value={settings.certFingerprint} max={28} />
              </p>
              <p className="flex justify-between">
                <span className="text-muted-foreground">Expires</span>
                <span className={certDays > 30 ? "" : "font-medium text-warning"}>
                  {new Date(settings.certExpiryAt).toLocaleDateString("en-GB")} · {certDays} days
                </span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted-foreground">Conformance</span>
                <span>PAdES {settings.signingConformance}</span>
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              The achieved level is always re-read from the sealed file and recorded per envelope - never claimed from configuration alone.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Feature flags */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Flag className="h-4 w-4 text-muted-foreground" aria-hidden /> Feature flags &amp; trials
          </CardTitle>
          <CardDescription>Toggle platform capabilities per deployment. Changes apply to every tenant.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="trial-days">Default trial length (days)</Label>
            <Input
              id="trial-days" type="number" min={1} max={90} value={trialDays}
              onChange={(e) => setTrialDays(Number(e.target.value))} className="h-11 max-w-40"
            />
          </div>
          <ul className="space-y-2">
            {FLAG_META.map((f) => (
              <li key={f.key}>
                <label className="flex min-h-12 items-center justify-between gap-4 rounded-lg border p-3">
                  <span className="text-sm">
                    {f.label}
                    <span className="block text-xs font-normal text-muted-foreground">{f.desc}</span>
                  </span>
                  <Switch
                    checked={flags[f.key] ?? false}
                    onCheckedChange={(v) => setFlags({ ...flags, [f.key]: v })}
                    aria-label={`${f.label} feature flag`}
                  />
                </label>
              </li>
            ))}
          </ul>
          <label className="flex min-h-12 items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <span className="text-sm">
              Maintenance mode
              <span className="block text-xs font-normal text-muted-foreground">Show a maintenance banner on all tenant portals; signing is paused.</span>
            </span>
            <Switch checked={maintenance} onCheckedChange={setMaintenance} aria-label="Maintenance mode" />
          </label>
          <Button
            className="h-11"
            onClick={() => act.mutate({ op: "save-flags", data: { trialLengthDays: trialDays, maintenanceMode: maintenance, featureFlags: JSON.stringify(flags) } })}
            disabled={act.isPending}
          >
            <Save className="h-4 w-4" aria-hidden /> Save configuration
          </Button>
        </CardContent>
      </Card>

      {/* Audit chain */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden /> Audit chain
          </CardTitle>
          <CardDescription>Append-only hash chain over the platform audit log. Sealing commits a new block.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Current block height <span className="font-semibold text-foreground tabular-nums">{settings.auditChainBlockHeight}</span>
            {" "}· last sealed {new Date(settings.auditChainSealedAt).toLocaleString("en-GB")}
          </p>
          <ConfirmDialog
            trigger={<Button size="sm" className="h-11"><Lock className="h-4 w-4" aria-hidden /> Seal audit chain</Button>}
            title="Seal the audit chain?"
            description="A new block is committed covering all events since the last seal. This is a one-way operation recorded on-chain."
            confirmLabel="Seal chain"
            destructive={false}
            onConfirm={() => act.mutateAsync({ op: "seal-audit" })}
          />
        </CardContent>
      </Card>
    </>
  );
}

export function AdminSettings() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => apiGet<{ settings: PlatformSettings }>("/api/admin/settings"),
  });
  const act = useAct();

  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return <div className="space-y-6" aria-busy><PageHeader title="Platform settings" /><div className="h-64 animate-pulse rounded-xl bg-muted" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform settings"
        description="Global configuration for delivery, timestamping, sealing and feature availability."
      />
      <SettingsBody settings={data.settings} act={act} />
    </div>
  );
}
