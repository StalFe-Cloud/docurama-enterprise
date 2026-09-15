"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Plus, ShieldCheck, Globe, KeyRound, LogOut, Trash2, Check, RefreshCw, Landmark, Save,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/client";
import { ConfirmDialog, CopyableCode, ErrorState, StatusBadge, fmtDate, cn } from "@/components/portal/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSettingsAct, ToggleRow, deviceFromUserAgent } from "./settings-shared";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { SIGNATURE_MANIFESTATION_FIELDS, DEFAULT_CONSENT_TEXT } from "@/lib/esign";

type BaseData = {
  profile: { firstName: string; lastName: string; email: string; totpEnabled: boolean; passwordChangedAt: string | null };
  org: { name: string; slug: string; planCode: string; billingEmail: string | null; createdAt: string };
  orgs: { id: string; name: string; slug: string; role: string; planCode: string }[];
  activeTenantId: string | null;
  isAdmin: boolean;
};

type AccountData = {
  sessions: { id: string; ip: string | null; userAgent: string | null; createdAt: string; lastSeenAt: string; expiresAt: string; current: boolean }[];
  securityEvents: { id: string; at: string; type: string; severity: string; actor: string; detail: string | null }[];
  auditTrail: { id: string; at: string; action: string; resource: string; detail: string | null }[];
  enforceTwoFactor: boolean;
  domains: { id: string; domain: string; status: string; token: string; verifiedAt: string | null; lastCheckedAt: string | null; lastCheckNote: string | null }[];
  part11: { part11Mode: boolean; requireReauth: boolean; signatureLevel: string; consentVersion: string };
  isAdmin: boolean;
};

export function AccountTab() {
  const base = useQuery({
    queryKey: ["workspace", "settings"],
    queryFn: () => apiGet<BaseData>("/api/workspace/settings"),
  });
  const account = useQuery({
    queryKey: ["workspace", "settings-account"],
    queryFn: () => apiGet<AccountData>("/api/workspace/settings-account"),
  });
  // Consent text lives on the shared EsignPreferences row (edited on the eSign tab too).
  const esign = useQuery({
    queryKey: ["workspace", "settings-esign"],
    queryFn: () => apiGet<{ prefs: { consentText: string | null } }>("/api/workspace/settings-esign"),
  });

  if (base.error || account.error || esign.error) {
    return <ErrorState message={((base.error ?? account.error ?? esign.error) as Error).message} onRetry={() => { base.refetch(); account.refetch(); esign.refetch(); }} />;
  }
  if (base.isLoading || account.isLoading || esign.isLoading || !base.data || !account.data || !esign.data) {
    return (
      <div className="space-y-4" aria-busy>
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <div className="h-52 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OrganizationsCard base={base.data} />
      <DomainVerificationCard data={account.data} />
      <AccessSecurityCard base={base.data} account={account.data} />
      <Part11Card part11={account.data.part11} consentText={esign.data.prefs.consentText ?? DEFAULT_CONSENT_TEXT} />
    </div>
  );
}

// ── Organizations & multiple companies ───────────────────────────────────────

function OrganizationsCard({ base }: { base: BaseData }) {
  const act = useSettingsAct(["settings", "settings-account"]);
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [name, setName] = useState("");

  const switchOrg = async (tenantId: string, orgName: string) => {
    try {
      await apiPost("/api/workspace/settings", { op: "org.switch", data: { tenantId } });
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
      window.scrollTo({ top: 0 });
      void orgName;
    } catch {
      // The mutation toast already reported the failure.
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden /> Organizations &amp; multiple companies
          </CardTitle>
          <CardDescription>
            One login, many workspaces. Switch the active organization any time - documents, templates, keys and settings follow.
          </CardDescription>
        </div>
        <Button size="sm" className="h-10" onClick={() => setDialog(true)}>
          <Plus className="h-4 w-4" aria-hidden /> New organization
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border">
          {base.orgs.map((org) => {
            const active = org.id === base.activeTenantId;
            return (
              <li key={org.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {org.name}
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {org.planCode}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {org.slug} · your role: {org.role.toLowerCase()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {active ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-success"><Check className="h-3.5 w-3.5" aria-hidden /> Active</span>
                  ) : (
                    <Button variant="outline" size="sm" className="h-10" onClick={() => switchOrg(org.id, org.name)}>
                      Switch
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Creating an organization starts a 14-day trial on the Starter plan. Invite your team from Settings → Users after switching.
        </p>
      </CardContent>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new organization</DialogTitle>
            <DialogDescription>You become the owner of the new workspace. Your current organization is untouched.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="org-name">Organization name</Label>
              <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vela Consulting SAS" className="h-11" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
            <Button
              disabled={name.trim().length < 2 || act.isPending}
              onClick={async () => {
                await act.mutateAsync({ op: "org.create", data: { name: name.trim() } }).catch(() => undefined);
                setDialog(false);
                setName("");
                await queryClient.invalidateQueries({ queryKey: ["session"] });
                await queryClient.invalidateQueries({ queryKey: ["workspace"] });
              }}
            >
              Create organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Enterprise DNS domain verification & authentication ──────────────────────

function DomainVerificationCard({ data }: { data: AccountData }) {
  const act = useSettingsAct(["settings", "settings-account"]);
  const [dialog, setDialog] = useState(false);
  const [domain, setDomain] = useState("");
  const [verifying, setVerifying] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4 text-muted-foreground" aria-hidden /> Enterprise DNS domain verification &amp; authentication
          </CardTitle>
          <CardDescription>
            Authenticate your sending domain so sign requests and completion emails come from <span className="font-medium">your</span> domain, not ours. Verified live over DNS-over-HTTPS.
          </CardDescription>
        </div>
        <Button size="sm" className="h-10" onClick={() => setDialog(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Add domain
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.domains.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No sending domains yet - add one to unlock branded, authenticated email delivery.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.domains.map((d) => (
              <li key={d.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm font-medium">{d.domain}</p>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="flex items-center gap-2">
                    {d.status !== "VERIFIED" && (
                      <Button
                        size="sm" variant="outline" className="h-10"
                        disabled={verifying === d.id}
                        onClick={async () => {
                          setVerifying(d.id);
                          await act.mutateAsync({ op: "domain.verify", id: d.id }).catch(() => undefined);
                          setVerifying(null);
                        }}
                      >
                        <RefreshCw className={cn("h-4 w-4", verifying === d.id && "animate-spin")} aria-hidden />
                        {verifying === d.id ? "Checking DNS…" : "Verify DNS"}
                      </Button>
                    )}
                    <ConfirmDialog
                      trigger={<Button variant="ghost" size="icon" className="h-10 w-10 text-destructive" aria-label={`Remove ${d.domain}`}><Trash2 className="h-4 w-4" aria-hidden /></Button>}
                      title={`Remove ${d.domain}?`}
                      description="Emails for this workspace will fall back to the platform sending domain."
                      confirmLabel="Remove domain"
                      onConfirm={() => act.mutateAsync({ op: "domain.delete", id: d.id })}
                    />
                  </div>
                </div>
                {d.status !== "VERIFIED" && (
                  <div className="mt-3 space-y-2 rounded-lg bg-muted/60 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Publish this TXT record</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div><p className="text-[11px] text-muted-foreground">Host</p><CopyableCode value={`_docurama.${d.domain}`} max={28} /></div>
                      <div><p className="text-[11px] text-muted-foreground">Value</p><CopyableCode value={`docurama-verify=${d.token}`} max={28} /></div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Type TXT · TTL 3600 · propagation up to 24 h. Recommended for full deliverability: SPF include and DKIM are provisioned automatically after verification.</p>
                  </div>
                )}
                {d.lastCheckNote && <p className="mt-2 text-xs text-muted-foreground">{d.lastCheckNote}</p>}
                {d.verifiedAt && <p className="mt-2 text-xs text-success">Verified {fmtDate(d.verifiedAt)} - authenticated sending enabled.</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a sending domain</DialogTitle>
            <DialogDescription>You must control the domain&apos;s DNS. A TXT record will be generated for ownership verification.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dom">Domain</Label>
              <Input id="dom" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="mail.yourcompany.com" className="h-11" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
            <Button
              disabled={!domain.includes(".") || act.isPending}
              onClick={async () => {
                await act.mutateAsync({ op: "domain.add", data: { domain: domain.trim() } }).catch(() => undefined);
                setDialog(false);
                setDomain("");
              }}
            >
              Add domain
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Authentication & access security ─────────────────────────────────────────

function AccessSecurityCard({ base, account }: { base: BaseData; account: AccountData }) {
  const act = useSettingsAct(["settings", "settings-account", "settings-profile"]);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden /> Authentication &amp; access security
        </CardTitle>
        <CardDescription>
          Password, two-factor policy and every active session for this account. Changing your password signs out all other devices.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <p className="text-sm font-medium">Change password</p>
            <div className="space-y-1.5">
              <Label htmlFor="cur-pw">Current password</Label>
              <Input id="cur-pw" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">New password</Label>
              <Input id="new-pw" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className="h-11" />
              <p className="text-xs text-muted-foreground">Minimum 8 characters. {base.profile.passwordChangedAt ? `Last changed ${fmtDate(base.profile.passwordChangedAt)}.` : ""}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conf-pw">Confirm new password</Label>
              <Input id="conf-pw" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className="h-11" />
            </div>
            <Button
              className="h-11"
              disabled={!pw.current || pw.next.length < 8 || pw.next !== pw.confirm || act.isPending}
              onClick={async () => {
                await act.mutateAsync({ op: "password.change", data: { current: pw.current, next: pw.next } }).catch(() => undefined);
                setPw({ current: "", next: "", confirm: "" });
              }}
            >
              <Save className="h-4 w-4" aria-hidden /> Update password
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Two-factor authentication</p>
              <StatusBadge status={base.profile.totpEnabled ? "ACTIVE" : "OFF"} />
            </div>
            <p className="text-xs text-muted-foreground">
              {base.profile.totpEnabled
                ? "Enabled - codes from your authenticator app are required at sign-in (manage it in Settings → Profile)."
                : "Not enabled for your account. Enrol an authenticator app from Settings → Profile."}
            </p>
            <div className="rounded-lg border p-3">
              <ToggleRow
                checked={account.enforceTwoFactor}
                disabled={!account.isAdmin || act.isPending}
                onCheckedChange={(v) => act.mutate({ op: "enforce-2fa", data: { enabled: v } })}
                label="Require 2FA for all members"
                desc={account.isAdmin ? "Workspace policy - members must enrol TOTP at next sign-in" : "Only workspace owners and admins can change this policy"}
              />
            </div>
            <p className="text-xs text-muted-foreground">Recent sign-in activity:</p>
            <ul className="space-y-1.5">
              {account.securityEvents.slice(0, 5).map((ev) => (
                <li key={ev.id} className="flex items-start justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{ev.type.replaceAll("_", " ")}</span>
                    {ev.detail ? ` - ${ev.detail}` : ""}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{fmtDate(ev.at)}</span>
                </li>
              ))}
              {account.securityEvents.length === 0 && <li className="text-xs text-muted-foreground">No security events recorded yet.</li>}
            </ul>
          </div>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Active sessions ({account.sessions.length})</p>
            {account.sessions.length > 1 && (
              <ConfirmDialog
                trigger={<Button variant="outline" size="sm" className="h-10"><LogOut className="h-4 w-4" aria-hidden /> Sign out everywhere else</Button>}
                title="Sign out all other sessions?"
                description="Every other device and API client using this account will be disconnected immediately."
                confirmLabel="Sign out others"
                onConfirm={() => act.mutateAsync({ op: "session.revoke-others" })}
              />
            )}
          </div>
          <ul className="divide-y rounded-lg border">
            {account.sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {deviceFromUserAgent(s.userAgent)}
                    {s.current && <span className="ml-2 rounded bg-success/15 px-1.5 py-0.5 text-[11px] font-medium text-success">THIS DEVICE</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.ip ?? "unknown IP"} · signed in {fmtDate(s.createdAt)} · last active {fmtDate(s.lastSeenAt)}
                  </p>
                </div>
                {!s.current && (
                  <Button variant="ghost" size="sm" className="h-10 text-destructive hover:text-destructive" onClick={() => act.mutate({ op: "session.revoke", id: s.id })}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Regulatory compliance & 21 CFR Part 11 ───────────────────────────────────

function Part11Card({ part11, consentText }: { part11: AccountData["part11"]; consentText: string }) {
  const act = useSettingsAct(["settings", "settings-account", "settings-esign"]);
  const [state, setState] = useState({
    part11Mode: part11.part11Mode,
    requireReauth: part11.requireReauth,
    consentText,
  });

  const dirty =
    state.part11Mode !== part11.part11Mode ||
    state.requireReauth !== part11.requireReauth ||
    state.consentText !== consentText;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="h-4 w-4 text-muted-foreground" aria-hidden /> Regulatory compliance &amp; 21 CFR Part 11
        </CardTitle>
        <CardDescription>
          Life-sciences mode: signature manifestations, signer consent capture, re-authentication before signing and computer-generated audit trails.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 lg:grid-cols-2">
          <ToggleRow
            checked={state.part11Mode}
            onCheckedChange={(v) => setState({ ...state, part11Mode: v })}
            label="21 CFR Part 11 mode"
            desc="Enforce §11.10 controls: validated signature manifestations, consent agreement and tamper-evident audit records"
          />
          <ToggleRow
            checked={state.requireReauth}
            onCheckedChange={(v) => setState({ ...state, requireReauth: v })}
            label="Re-authenticate before signing"
            desc="Signers re-enter credentials (or OTP) at the moment of signature - §11.100(c) signature uniqueness"
            disabled={!state.part11Mode}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="consent">Signature agreement shown before signing ({part11.consentVersion})</Label>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setState({ ...state, consentText: DEFAULT_CONSENT_TEXT })}>
              Reset to default
            </Button>
          </div>
          <Textarea
            id="consent"
            value={state.consentText}
            onChange={(e) => setState({ ...state, consentText: e.target.value })}
            rows={4}
            className="text-sm"
            aria-describedby="consent-hint"
          />
          <p id="consent-hint" className="text-xs text-muted-foreground">
            Every signer&apos;s acceptance is recorded with timestamp and IP. Versioned - changing the text requires signers to re-consent.
          </p>
        </div>

        <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Signature manifestation - what gets affixed to every signed document</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {SIGNATURE_MANIFESTATION_FIELDS.map((f) => (
              <li key={f.field} className="rounded-lg bg-card p-2.5 text-xs">
                <p className="font-medium">{f.field} <span className="ml-1 font-mono text-[10px] text-muted-foreground">{f.regulation}</span></p>
                <p className="mt-0.5 text-muted-foreground">{f.example}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
            Also in scope: eIDAS level is set in Settings → eSign; audit trails are exportable from Admin → Audit Log; retention policies from Admin → Compliance.
          </p>
          <Button
            className="h-11"
            disabled={!dirty || act.isPending || (state.part11Mode && state.consentText.trim().length < 40)}
            onClick={() => act.mutate({
              op: "part11.save",
              data: { part11Mode: state.part11Mode, requireReauth: state.requireReauth, consentText: state.consentText },
            })}
          >
            <Save className="h-4 w-4" aria-hidden /> Save compliance settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
