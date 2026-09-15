"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Mail, Save, RefreshCw, CalendarClock, AlarmClock, Zap, Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { apiGet } from "@/lib/client";
import { ErrorState, StatusBadge, fmtDate, cn } from "@/components/portal/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettingsAct, ToggleRow } from "./settings-shared";

type NotifData = {
  settings: {
    smtpHost: string | null; smtpPort: number; smtpUser: string | null;
    smtpPasswordMasked: string | null; smtpHasPassword: boolean;
    smtpFrom: string; smtpSecure: boolean;
    smtpLastTestAt: string | null; smtpLastTestStatus: string | null;
    alertOnSent: boolean; alertOnViewed: boolean; alertOnSigned: boolean;
    alertOnCompleted: boolean; alertOnDeclined: boolean;
    dailyDigest: boolean; digestTime: string;
    reminderMode: string; reminderIntervalDays: number; reminderMaxCount: number;
    quietHoursStart: string; quietHoursEnd: string; skipWeekends: boolean;
    escalateToSms: boolean; escalateAfterDays: number;
    reminderJobLastRunAt: string | null;
  };
};

const REMINDER_MODES = [
  {
    key: "manual",
    label: "Manual reminders",
    desc: "You press “Remind” per document (rate-limited). Full control, zero automation.",
    icon: AlarmClock,
  },
  {
    key: "user_job",
    label: "Per-envelope jobs (user enabled)",
    desc: "Enable auto-remind on individual documents; each envelope runs its own schedule using the policy below.",
    icon: Zap,
  },
  {
    key: "platform_job",
    label: "Platform scheduled job",
    desc: "Docurama scans every active envelope of this workspace on the policy below - set it once, forget it.",
    icon: CalendarClock,
  },
] as const;

export function NotificationsTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["workspace", "settings-notifications"],
    queryFn: () => apiGet<NotifData>("/api/workspace/settings-notifications"),
  });

  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4" aria-busy>
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SmtpCard s={data.settings} />
      <AlertsCard s={data.settings} />
      <RemindersCard s={data.settings} />
    </div>
  );
}

// ── Email delivery (SMTP) ────────────────────────────────────────────────────

function SmtpCard({ s }: { s: NotifData["settings"] }) {
  const act = useSettingsAct(["settings-notifications"]);
  const [form, setForm] = useState({
    smtpHost: s.smtpHost ?? "",
    smtpPort: s.smtpPort,
    smtpUser: s.smtpUser ?? "",
    smtpPassword: "",
    smtpFrom: s.smtpFrom,
    smtpSecure: s.smtpSecure,
  });
  const [testing, setTesting] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-muted-foreground" aria-hidden /> Email delivery (SMTP)
        </CardTitle>
        <CardDescription>
          Per-organization relay override. Leave the host empty to send through the platform relay (Docurama Sign &lt;notifications@docurama.eu&gt;) - the verified, authenticated route.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="smtp-host">SMTP host <span className="text-xs text-muted-foreground">(empty = platform relay)</span></Label>
            <Input id="smtp-host" value={form.smtpHost} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} className="h-11 font-mono text-sm" placeholder="smtp.yourcompany.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-port">Port</Label>
            <Input id="smtp-port" type="number" min={1} max={65535} value={form.smtpPort} onChange={(e) => setForm({ ...form, smtpPort: Number(e.target.value) })} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-user">Username</Label>
            <Input id="smtp-user" value={form.smtpUser} onChange={(e) => setForm({ ...form, smtpUser: e.target.value })} className="h-11" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-pass">Password {s.smtpHasPassword && <span className="text-xs text-muted-foreground">(saved: {s.smtpPasswordMasked})</span>}</Label>
            <Input id="smtp-pass" type="password" value={form.smtpPassword} onChange={(e) => setForm({ ...form, smtpPassword: e.target.value })} className="h-11" autoComplete="new-password" placeholder={s.smtpHasPassword ? "Leave empty to keep" : ""} />
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="smtp-from">From address</Label>
            <Input id="smtp-from" value={form.smtpFrom} onChange={(e) => setForm({ ...form, smtpFrom: e.target.value })} className="h-11" placeholder="Contracts <contracts@yourcompany.com>" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {s.smtpLastTestAt && (
              <>Last test: <StatusBadge status={s.smtpLastTestStatus === "OK" ? "ACTIVE" : "FAILED"} /> {fmtDate(s.smtpLastTestAt)}</>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline" className="h-11"
              disabled={testing}
              onClick={async () => { setTesting(true); await act.mutateAsync({ op: "smtp.test" }).catch(() => undefined); setTesting(false); }}
            >
              <RefreshCw className={cn("h-4 w-4", testing && "animate-spin")} aria-hidden />
              {testing ? "Testing…" : "Test connection"}
            </Button>
            <Button className="h-11" disabled={act.isPending} onClick={() => act.mutate({ op: "notifications.save", data: form })}>
              <Save className="h-4 w-4" aria-hidden /> Save SMTP
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Signer completion alerts ─────────────────────────────────────────────────

function AlertsCard({ s }: { s: NotifData["settings"] }) {
  const act = useSettingsAct(["settings-notifications"]);
  const [form, setForm] = useState({
    alertOnSent: s.alertOnSent, alertOnViewed: s.alertOnViewed, alertOnSigned: s.alertOnSigned,
    alertOnCompleted: s.alertOnCompleted, alertOnDeclined: s.alertOnDeclined,
    dailyDigest: s.dailyDigest, digestTime: s.digestTime,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4 text-muted-foreground" aria-hidden /> Signer &amp; completion alerts
        </CardTitle>
        <CardDescription>Stay informed as each envelope moves - per-event emails plus an optional daily digest.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-2">
          <ToggleRow checked={form.alertOnSent} onCheckedChange={(v) => setForm({ ...form, alertOnSent: v })} label="Document sent" desc="Confirmation after dispatching each envelope" />
          <ToggleRow checked={form.alertOnViewed} onCheckedChange={(v) => setForm({ ...form, alertOnViewed: v })} label="Signer viewed" desc="The moment a signer opens the document" />
          <ToggleRow checked={form.alertOnSigned} onCheckedChange={(v) => setForm({ ...form, alertOnSigned: v })} label="Each signature" desc="Progress notification as each party signs" />
          <ToggleRow checked={form.alertOnCompleted} onCheckedChange={(v) => setForm({ ...form, alertOnCompleted: v })} label="Document completed" desc="Final sealed document and evidence PDF" />
          <ToggleRow checked={form.alertOnDeclined} onCheckedChange={(v) => setForm({ ...form, alertOnDeclined: v })} label="Signer declined" desc="Immediate notice with the decline reason" />
          <div className="flex min-h-14 items-center justify-between gap-4 rounded-lg border p-3">
            <span className="text-sm">
              Daily digest
              <span className="block text-xs font-normal text-muted-foreground">One summary email of pending &amp; completed documents</span>
            </span>
            <div className="flex items-center gap-2">
              <Input
                type="time" value={form.digestTime} aria-label="Digest time"
                onChange={(e) => setForm({ ...form, digestTime: e.target.value })}
                className="h-9 w-28 text-xs" disabled={!form.dailyDigest}
              />
              <Switch checked={form.dailyDigest} onCheckedChange={(v) => setForm({ ...form, dailyDigest: v })} aria-label="Daily digest" />
            </div>
          </div>
        </div>
        <Button className="h-11" disabled={act.isPending} onClick={() => act.mutate({ op: "notifications.save", data: { ...s, ...form } })}>
          <Save className="h-4 w-4" aria-hidden /> Save alerts
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Sign request reminders (manual / user job / platform job) ────────────────

function RemindersCard({ s }: { s: NotifData["settings"] }) {
  const act = useSettingsAct(["settings-notifications"]);
  const [form, setForm] = useState({
    reminderMode: s.reminderMode,
    reminderIntervalDays: s.reminderIntervalDays,
    reminderMaxCount: s.reminderMaxCount,
    quietHoursStart: s.quietHoursStart,
    quietHoursEnd: s.quietHoursEnd,
    skipWeekends: s.skipWeekends,
    escalateToSms: s.escalateToSms,
    escalateAfterDays: s.escalateAfterDays,
  });
  const [dryRun, setDryRun] = useState<{ due: { code: string; title: string; ageDays: number; reminders: number; reason: string }[]; stats: Record<string, number> } | null>(null);
  const [running, setRunning] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden /> Sign request email reminders
        </CardTitle>
        <CardDescription>
          Three ways to nudge signers - manual, per-envelope jobs you enable per document, or a platform-wide scheduled job. Quiet hours and weekend skips keep reminders polite.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 lg:grid-cols-3" role="radiogroup" aria-label="Reminder mode">
          {REMINDER_MODES.map((m) => {
            const Icon = m.icon;
            const selected = form.reminderMode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setForm({ ...form, reminderMode: m.key })}
                className={cn(
                  "flex min-h-28 flex-col gap-1 rounded-xl border p-4 text-left transition-colors",
                  selected ? "border-primary bg-primary-soft/30" : "hover:bg-muted/60",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden /> {m.label}
                </span>
                <span className="text-xs text-muted-foreground">{m.desc}</span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="rem-int">Interval (days)</Label>
            <Input id="rem-int" type="number" min={1} max={30} value={form.reminderIntervalDays} onChange={(e) => setForm({ ...form, reminderIntervalDays: Number(e.target.value) })} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rem-max">Max reminders / envelope</Label>
            <Input id="rem-max" type="number" min={0} max={20} value={form.reminderMaxCount} onChange={(e) => setForm({ ...form, reminderMaxCount: Number(e.target.value) })} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rem-qs">Quiet hours start</Label>
            <Input id="rem-qs" type="time" value={form.quietHoursStart} onChange={(e) => setForm({ ...form, quietHoursStart: e.target.value })} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rem-qe">Quiet hours end</Label>
            <Input id="rem-qe" type="time" value={form.quietHoursEnd} onChange={(e) => setForm({ ...form, quietHoursEnd: e.target.value })} className="h-11" />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <ToggleRow checked={form.skipWeekends} onCheckedChange={(v) => setForm({ ...form, skipWeekends: v })} label="Skip weekends" desc="No reminders sent on Saturday and Sunday (Europe/Paris)" />
          <ToggleRow
            checked={form.escalateToSms}
            onCheckedChange={(v) => setForm({ ...form, escalateToSms: v })}
            label="Escalate to SMS after N days"
            desc={`Switch to SMS/WhatsApp via the gateway from Settings → SMS after ${form.escalateAfterDays} days idle`}
          />
        </div>
        {form.escalateToSms && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="esc-days">Escalate after (days idle)</Label>
              <Input id="esc-days" type="number" min={1} max={60} value={form.escalateAfterDays} onChange={(e) => setForm({ ...form, escalateAfterDays: Number(e.target.value) })} className="h-11" />
            </div>
            <div className="flex items-end">
              <p className="text-xs text-muted-foreground">Escalation uses the SMS/WhatsApp gateway configured in Settings → SMS. Standard message rates apply.</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {s.reminderJobLastRunAt ? <>Last job run: {fmtDate(s.reminderJobLastRunAt)}</> : "The reminder job has not run yet."}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline" className="h-11"
              disabled={running}
              onClick={async () => {
                setRunning(true);
                try {
                  const res = await fetch("/api/workspace/settings", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ op: "reminders.run" }),
                  }).then((r) => r.json());
                  if (res?.due) setDryRun({ due: res.due, stats: res.stats ?? {} });
                  else throw new Error(res?.error ?? "Dry run failed");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Dry run failed");
                } finally {
                  setRunning(false);
                }
              }}
            >
              <Info className="h-4 w-4" aria-hidden /> {running ? "Scanning…" : "Run job now (dry run)"}
            </Button>
            <Button className="h-11" disabled={act.isPending} onClick={() => act.mutate({ op: "notifications.save", data: { ...s, ...form } })}>
              <Save className="h-4 w-4" aria-hidden /> Save reminder policy
            </Button>
          </div>
        </div>

        {dryRun && (
          <div className="rounded-xl border bg-muted/40 p-4">
            <p className="text-sm font-medium">Dry-run results - what the job would send right now</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {dryRun.stats.active ?? 0} active envelopes scanned · {dryRun.due.length} due ·
              {" "}{dryRun.stats.skippedThrottle ?? 0} throttled · {dryRun.stats.skippedMax ?? 0} at max ·
              {" "}{dryRun.stats.manualOnly ?? 0} manual-only
              {dryRun.stats.inQuietHours ? " · currently inside quiet hours" : ""}
              {dryRun.stats.weekend ? " · weekend skip active" : ""}
            </p>
            {dryRun.due.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {dryRun.due.slice(0, 8).map((d) => (
                  <li key={d.code} className="flex items-center justify-between gap-2 rounded-lg bg-card p-2 text-xs">
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-muted-foreground">{d.code}</span> {d.title}
                    </span>
                    <span className="shrink-0 text-muted-foreground">{d.ageDays}d old · {d.reminders} sent · {d.reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Nothing due - every signer has been reminded recently or completed.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

