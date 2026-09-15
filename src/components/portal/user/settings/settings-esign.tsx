"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileSignature, Plus, ShieldCheck, Clock, Download, Ban, Trash2, Save, RefreshCw, Award, Zap,
} from "lucide-react";
import { apiGet } from "@/lib/client";
import { ConfirmDialog, CopyableCode, ErrorState, StatusBadge, fmtDate, cn } from "@/components/portal/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettingsAct, ToggleRow } from "./settings-shared";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FILENAME_TOKENS, FILENAME_PRESETS, TSA_PRESETS, ESIGN_LEVELS, previewFilename, validateFilenameFormat } from "@/lib/esign";

type EsignData = {
  certificates: {
    id: string; commonName: string; organization: string | null; email: string | null;
    serialNumber: string; shortThumbprint: string; issuer: string;
    keyAlgorithm: string; signatureAlgorithm: string;
    notBefore: string; notAfter: string; status: string; purpose: string; validityDays: number;
    revokedAt: string | null; createdAt: string; createdBy: string; hasBundle: boolean;
  }[];
  tsa: {
    url: string; hashAlgorithm: string; authType: string; username: string | null; enabled: boolean;
    lastTestAt: string | null; lastTestStatus: string | null; lastTestLatencyMs: number | null;
  };
  prefs: {
    allowMultipleSignatures: boolean; flattenFormFields: boolean; filenameFormat: string;
    sealOnCompletion: boolean; requireReauth: boolean; signatureLevel: string;
    part11Mode: boolean; consentText: string | null; consentVersion: string;
  };
};

export function EsignTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["workspace", "settings-esign"],
    queryFn: () => apiGet<EsignData>("/api/workspace/settings-esign"),
  });

  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4" aria-busy>
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
        <div className="h-56 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CertificatesCard certs={data.certificates} />
      <TsaCard tsa={data.tsa} />
      <PreferencesCard prefs={data.prefs} />
    </div>
  );
}

// ── Signing certificates (X.509 / PKCS#12) - one-click provisioning ──────────

function CertificatesCard({ certs }: { certs: EsignData["certificates"] }) {
  const act = useSettingsAct(["settings-esign"]);
  const [create, setCreate] = useState(false);
  const [provision, setProvision] = useState<{ id: string; name: string } | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Award className="h-4 w-4 text-muted-foreground" aria-hidden /> Signing certificates - X.509 / PKCS#12
          </CardTitle>
          <CardDescription>
            Real RSA-2048 certificates issued by OpenSSL in one click, exactly like the DNS flow: request → provision → activate → download the encrypted .p12.
          </CardDescription>
        </div>
        <Button size="sm" className="h-10" onClick={() => setCreate(true)}>
          <Plus className="h-4 w-4" aria-hidden /> New certificate
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {certs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <FileSignature className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              No signing certificates yet - create one and provision it in a single click. Signatures sealed without a workspace certificate use the platform certificate.
            </p>
          </div>
        ) : (
          certs.map((c) => (
            <div key={c.id} className={cn("rounded-xl border p-4", c.status === "ACTIVE" && "border-primary/60 bg-primary-soft/20")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{c.commonName}</p>
                    <StatusBadge status={c.status} />
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{c.purpose}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.keyAlgorithm} · {c.signatureAlgorithm} · valid {fmtDate(c.notBefore)} → {fmtDate(c.notAfter)}
                    {c.organization ? ` · ${c.organization}` : ""} · created by {c.createdBy}
                  </p>
                  {c.status !== "PENDING" && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <CopyableCode value={c.serialNumber} max={22} />
                      <CopyableCode value={c.shortThumbprint} max={22} />
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {c.status === "PENDING" && (
                    <Button size="sm" className="h-10" onClick={() => setProvision({ id: c.id, name: c.commonName })}>
                      <Zap className="h-4 w-4" aria-hidden /> Provision now
                    </Button>
                  )}
                  {c.status === "ISSUED" && (
                    <>
                      <a href={`/api/workspace/certificate/${c.id}/download`}>
                        <Button size="sm" variant="outline" className="h-10"><Download className="h-4 w-4" aria-hidden /> .p12</Button>
                      </a>
                      <Button size="sm" className="h-10" onClick={() => act.mutate({ op: "cert.activate", id: c.id })}>
                        <ShieldCheck className="h-4 w-4" aria-hidden /> Activate
                      </Button>
                    </>
                  )}
                  {c.status === "ACTIVE" && (
                    <a href={`/api/workspace/certificate/${c.id}/download`}>
                      <Button size="sm" variant="outline" className="h-10"><Download className="h-4 w-4" aria-hidden /> .p12</Button>
                    </a>
                  )}
                  {["ISSUED", "ACTIVE"].includes(c.status) && (
                    <ConfirmDialog
                      trigger={<Button size="sm" variant="outline" className="h-10 text-destructive hover:text-destructive"><Ban className="h-4 w-4" aria-hidden /> Revoke</Button>}
                      title={`Revoke “${c.commonName}”?`}
                      description="New signatures stop using this certificate immediately. Completed documents and their evidence stay valid."
                      confirmLabel="Revoke certificate"
                      onConfirm={() => act.mutateAsync({ op: "cert.revoke", id: c.id })}
                    />
                  )}
                  {["PENDING", "REVOKED", "EXPIRED"].includes(c.status) && (
                    <ConfirmDialog
                      trigger={<Button variant="ghost" size="icon" className="h-10 w-10 text-destructive" aria-label={`Delete ${c.commonName}`}><Trash2 className="h-4 w-4" aria-hidden /></Button>}
                      title={`Delete “${c.commonName}”?`}
                      description="The certificate record and any stored bundle are removed."
                      confirmLabel="Delete"
                      onConfirm={() => act.mutateAsync({ op: "cert.delete", id: c.id })}
                    />
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <p className="text-xs text-muted-foreground">
          The PKCS#12 bundle is encrypted with your passphrase - Docurama stores the encrypted blob only, never the passphrase itself.
        </p>
      </CardContent>

      <CreateCertDialog open={create} onOpenChange={setCreate} act={act} />
      <ProvisionDialog target={provision} onClose={() => setProvision(null)} act={act} />
    </Card>
  );
}

function CreateCertDialog({
  open, onOpenChange, act,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  act: ReturnType<typeof useSettingsAct>;
}) {
  const [form, setForm] = useState({
    commonName: "", organization: "", email: "", purpose: "signing", days: 365,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request a signing certificate</DialogTitle>
          <DialogDescription>
            Fill in the certificate identity - provisioning happens in one click right after, exactly like domain DNS verification.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cn">Certificate name (CN) <span className="text-destructive" aria-hidden>*</span></Label>
            <Input id="cn" value={form.commonName} onChange={(e) => setForm({ ...form, commonName: e.target.value })} placeholder="StålFe Signing 2026" className="h-11" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="org">Organization (O)</Label>
              <Input id="org" value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} placeholder="StålFe AB" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cemail">Email</Label>
              <Input id="cemail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="legal@company.com" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purpose">Purpose</Label>
              <Select value={form.purpose} onValueChange={(v) => setForm({ ...form, purpose: v })}>
                <SelectTrigger id="purpose" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="signing">Signing (signers)</SelectItem>
                  <SelectItem value="sealing">Sealing (document seals)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="days">Validity (days)</Label>
              <Input id="days" type="number" min={30} max={1095} value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} className="h-11" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={form.commonName.trim().length < 3 || act.isPending}
            onClick={async () => {
              await act.mutateAsync({ op: "cert.create", data: form }).catch(() => undefined);
              onOpenChange(false);
              setForm({ commonName: "", organization: "", email: "", purpose: "signing", days: 365 });
            }}
          >
            Request certificate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProvisionDialog({
  target, onClose, act,
}: {
  target: { id: string; name: string } | null;
  onClose: () => void;
  act: ReturnType<typeof useSettingsAct>;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  return (
    <Dialog open={Boolean(target)} onOpenChange={(v) => { if (!v) { onClose(); setPassphrase(""); setConfirmPw(""); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Provision “{target?.name}”</DialogTitle>
          <DialogDescription>
            OpenSSL generates a real RSA-2048 key pair and issues the certificate. Choose an encryption passphrase for the .p12 - it is never stored, so keep it safe.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pp">PKCS#12 passphrase <span className="text-destructive" aria-hidden>*</span></Label>
            <Input id="pp" type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp2">Confirm passphrase</Label>
            <Input id="pp2" type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="h-11" />
            {passphrase.length > 0 && passphrase.length < 8 && (
              <p className="text-xs text-destructive">At least 8 characters.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={passphrase.length < 8 || passphrase !== confirmPw || act.isPending}
            onClick={async () => {
              if (!target) return;
              await act.mutateAsync({ op: "cert.provision", id: target.id, data: { passphrase } }).catch(() => undefined);
              onClose();
              setPassphrase("");
              setConfirmPw("");
            }}
          >
            <Zap className="h-4 w-4" aria-hidden /> {act.isPending ? "Issuing…" : "Provision in one click"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── RFC 3161 Timestamp Authority ─────────────────────────────────────────────

function TsaCard({ tsa }: { tsa: EsignData["tsa"] }) {
  const act = useSettingsAct(["settings-esign"]);
  const [form, setForm] = useState({
    url: tsa.url, hashAlgorithm: tsa.hashAlgorithm, authType: tsa.authType, username: tsa.username ?? "", enabled: tsa.enabled,
  });
  const [testing, setTesting] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-muted-foreground" aria-hidden /> RFC 3161 Timestamp Authority (TSA)
        </CardTitle>
        <CardDescription>
          Trusted timestamps bound into every sealed document for long-term validation (PAdES B-LT / B-LTA). Presets point at public authorities.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tsa-preset">Quick presets</Label>
              <Select
                value={TSA_PRESETS.find((p) => p.url === form.url)?.key ?? "custom"}
                onValueChange={(v) => {
                  const preset = TSA_PRESETS.find((p) => p.key === v);
                  if (preset) setForm({ ...form, url: preset.url });
                }}
              >
                <SelectTrigger id="tsa-preset" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TSA_PRESETS.map((p) => (
                    <SelectItem key={p.key} value={p.key}>{p.name} - {p.note}</SelectItem>
                  ))}
                  <SelectItem value="custom">Custom URL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tsa-url">TSA URL</Label>
              <Input id="tsa-url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="h-11 font-mono text-sm" placeholder="https://timestamp.digicert.com" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tsa-hash">Hash algorithm</Label>
                <Select value={form.hashAlgorithm} onValueChange={(v) => setForm({ ...form, hashAlgorithm: v })}>
                  <SelectTrigger id="tsa-hash" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SHA-256">SHA-256</SelectItem>
                    <SelectItem value="SHA-384">SHA-384</SelectItem>
                    <SelectItem value="SHA-512">SHA-512</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tsa-auth">Authentication</Label>
                <Select value={form.authType} onValueChange={(v) => setForm({ ...form, authType: v })}>
                  <SelectTrigger id="tsa-auth" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (public TSA)</SelectItem>
                    <SelectItem value="basic">Basic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.authType === "basic" && (
              <div className="space-y-1.5">
                <Label htmlFor="tsa-user">Username</Label>
                <Input id="tsa-user" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="h-11" />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <ToggleRow
              checked={form.enabled}
              onCheckedChange={(v) => setForm({ ...form, enabled: v })}
              label="Timestamp every sealed document"
              desc="Required for PAdES B-LTA conformance and eIDAS qualified workflows"
            />
            <div className="rounded-lg border p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Last test</p>
              {tsa.lastTestAt ? (
                <p className="mt-1">
                  <StatusBadge status={tsa.lastTestStatus === "OK" ? "ACTIVE" : "FAILED"} />{" "}
                  {tsa.lastTestStatus} {tsa.lastTestLatencyMs != null ? `· ${tsa.lastTestLatencyMs} ms` : ""} · {fmtDate(tsa.lastTestAt)}
                </p>
              ) : (
                <p className="mt-1">Never tested - run a reachability check before enabling.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline" className="h-11"
                disabled={testing}
                onClick={async () => {
                  setTesting(true);
                  await act.mutateAsync({ op: "tsa.test" }).catch(() => undefined);
                  setTesting(false);
                }}
              >
                <RefreshCw className={cn("h-4 w-4", testing && "animate-spin")} aria-hidden />
                {testing ? "Testing…" : "Test reachability"}
              </Button>
              <Button className="h-11" disabled={act.isPending} onClick={() => act.mutate({ op: "tsa.save", data: form })}>
                <Save className="h-4 w-4" aria-hidden /> Save TSA
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sealing preferences ──────────────────────────────────────────────────────

function PreferencesCard({ prefs }: { prefs: EsignData["prefs"] }) {
  const act = useSettingsAct(["settings-esign", "settings-account"]);
  const [form, setForm] = useState({
    allowMultipleSignatures: prefs.allowMultipleSignatures,
    flattenFormFields: prefs.flattenFormFields,
    sealOnCompletion: prefs.sealOnCompletion,
    filenameFormat: prefs.filenameFormat,
    signatureLevel: prefs.signatureLevel,
  });
  const formatCheck = validateFilenameFormat(form.filenameFormat);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSignature className="h-4 w-4 text-muted-foreground" aria-hidden /> Sealing preferences
        </CardTitle>
        <CardDescription>
          How documents are sealed and named. The filename format applies to every participant&apos;s download with live preview.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 lg:grid-cols-2">
          <ToggleRow
            checked={form.allowMultipleSignatures}
            onCheckedChange={(v) => setForm({ ...form, allowMultipleSignatures: v })}
            label="Multiple digital signatures"
            desc="Allow several signers to cryptographically sign the same document (parallel or ordered)"
          />
          <ToggleRow
            checked={form.flattenFormFields}
            onCheckedChange={(v) => setForm({ ...form, flattenFormFields: v })}
            label="Flatten form fields"
            desc="Convert interactive form fields into permanent content after signing - nothing editable remains"
          />
          <ToggleRow
            checked={form.sealOnCompletion}
            onCheckedChange={(v) => setForm({ ...form, sealOnCompletion: v })}
            label="Seal on completion"
            desc="Apply the cryptographic seal and evidence PDF as soon as the last signer finishes"
          />
          <div className="space-y-1.5">
            <Label htmlFor="sig-level">eIDAS signature level</Label>
            <Select value={form.signatureLevel} onValueChange={(v) => setForm({ ...form, signatureLevel: v })}>
              <SelectTrigger id="sig-level" className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ESIGN_LEVELS.map((l) => (
                  <SelectItem key={l.key} value={l.key}>{l.label} - {l.description}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Document download filename format</Label>
          <div className="flex flex-wrap gap-2">
            {FILENAME_PRESETS.map((p) => (
              <button
                key={p.format}
                type="button"
                onClick={() => setForm({ ...form, filenameFormat: p.format })}
                aria-pressed={form.filenameFormat === p.format}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs transition-colors",
                  form.filenameFormat === p.format ? "border-primary bg-primary-soft/40 font-medium" : "hover:bg-muted/60",
                )}
              >
                {p.label}
                <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{p.format}</span>
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fname">Custom pattern</Label>
            <Input
              id="fname" value={form.filenameFormat}
              onChange={(e) => setForm({ ...form, filenameFormat: e.target.value })}
              className="h-11 font-mono text-sm" aria-invalid={!formatCheck.ok}
              aria-describedby="fname-preview"
            />
            {!formatCheck.ok && <p className="text-xs text-destructive">{formatCheck.error}</p>}
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Preview</p>
              <p id="fname-preview" className="mt-1 font-mono text-sm">{previewFilename(form.filenameFormat)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILENAME_TOKENS.map((t) => (
              <button
                key={t.token}
                type="button"
                title={`${t.description} - e.g. ${t.example}`}
                onClick={() => setForm({ ...form, filenameFormat: `${form.filenameFormat}${t.token}` })}
                className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {t.token}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {prefs.part11Mode ? "21 CFR Part 11 mode is ON (Settings → Account) - re-authentication and consent apply." : "Part 11 mode is off - enable it in Settings → Account for life-sciences workflows."}
          </p>
          <Button
            className="h-11"
            disabled={!formatCheck.ok || act.isPending}
            onClick={() => act.mutate({ op: "esign.save", data: form })}
          >
            <Save className="h-4 w-4" aria-hidden /> Save preferences
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
