"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  User as UserIcon, PenTool, KeyRound, ShieldCheck, Save, Trash2, Star, Upload, Eraser, Plus,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/client";
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

type ProfileData = {
  profile: { firstName: string; lastName: string; email: string; totpEnabled: boolean; signatureName: string; signatureStyle: string; passwordChangedAt: string | null };
  signatures: { id: string; kind: string; method: string; value: string; font: string | null; isDefault: boolean; createdAt: string }[];
};

const SIGNATURE_FONTS = [
  { key: "signature-font-caveat", label: "Caveat" },
  { key: "signature-font-dancing", label: "Dancing Script" },
  { key: "signature-font-greatvibes", label: "Great Vibes" },
];

export function ProfileTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["workspace", "settings"],
    queryFn: () => apiGet<ProfileData>("/api/workspace/settings"),
  });

  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4" aria-busy>
        <div className="h-52 animate-pulse rounded-xl bg-muted" />
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProfileFormCard profile={data.profile} />
      <SavedSignaturesCard signatures={data.signatures} profile={data.profile} />
      <TwoFactorCard enabled={data.profile.totpEnabled} />
    </div>
  );
}

// ── Basic profile ────────────────────────────────────────────────────────────

function ProfileFormCard({ profile }: { profile: ProfileData["profile"] }) {
  const act = useSettingsAct(["settings"]);
  const [form, setForm] = useState({ firstName: profile.firstName, lastName: profile.lastName });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserIcon className="h-4 w-4 text-muted-foreground" aria-hidden /> Your profile
        </CardTitle>
        <CardDescription>
          Name, email and password state. Both name fields are persisted - and shown again on your next visit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="p-first">First name</Label>
            <Input id="p-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-last">Last name</Label>
            <Input id="p-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-email">Email</Label>
            <Input id="p-email" value={profile.email} disabled className="h-11" />
            <p className="text-xs text-muted-foreground">Contact Docurama support to change your sign-in email.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <p className="flex h-11 items-center text-sm text-muted-foreground">
              {profile.passwordChangedAt ? `Changed ${fmtDate(profile.passwordChangedAt)}` : "Never changed"}
              <span className="ml-2 text-xs">- change it in Settings → Account</span>
            </p>
          </div>
        </div>
        <Button
          className="h-11"
          disabled={!form.firstName.trim() || !form.lastName.trim() || act.isPending}
          onClick={() => act.mutate({ op: "save-profile", data: form })}
        >
          <Save className="h-4 w-4" aria-hidden /> Save profile
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Pre-saved signature & initials ───────────────────────────────────────────

function SavedSignaturesCard({ signatures, profile }: { signatures: ProfileData["signatures"]; profile: ProfileData["profile"] }) {
  const act = useSettingsAct(["settings"]);
  const [dialog, setDialog] = useState(false);

  const sigs = signatures.filter((s) => s.kind === "signature");
  const inits = signatures.filter((s) => s.kind === "initial");

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <PenTool className="h-4 w-4 text-muted-foreground" aria-hidden /> Pre-saved signature &amp; initials
          </CardTitle>
          <CardDescription>
            Draw, type or upload the stamps applied when you sign. The default is affixed automatically; initials stamp every page of long documents.
          </CardDescription>
        </div>
        <Button size="sm" className="h-10" onClick={() => setDialog(true)}>
          <Plus className="h-4 w-4" aria-hidden /> New stamp
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {(["signature", "initial"] as const).map((kind) => {
          const list = kind === "signature" ? sigs : inits;
          return (
            <div key={kind} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {kind === "signature" ? "Signatures" : "Initials"} ({list.length})
              </p>
              {list.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No saved {kind === "signature" ? "signature" : "initials"} yet.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((s) => (
                    <div key={s.id} className={cn("rounded-xl border p-3", s.isDefault && "border-primary bg-primary-soft/30")}>
                      <div className="flex h-16 items-center justify-center border-b border-dashed pb-2">
                        {s.method === "type" ? (
                          <span className={cn("text-3xl leading-none", s.font ?? "signature-font-caveat")}>{s.value}</span>
                        ) : (
                          <img src={s.value} alt={`Saved ${s.kind}`} className="max-h-14 max-w-full object-contain" />
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          {s.method === "draw" ? "Drawn" : s.method === "type" ? "Typed" : "Uploaded"}
                          {s.isDefault && <span className="ml-1.5 font-medium text-primary">· default</span>}
                        </div>
                        <div className="flex items-center gap-0.5">
                          {!s.isDefault && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Set as default" title="Set as default" onClick={() => act.mutate({ op: "signature.default", id: s.id })}>
                              <Star className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          )}
                          <ConfirmDialog
                            trigger={<Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label="Delete stamp"><Trash2 className="h-3.5 w-3.5" aria-hidden /></Button>}
                            title="Delete this stamp?"
                            description="Documents already signed with it are unaffected - the audit trail keeps the original image."
                            confirmLabel="Delete"
                            onConfirm={() => act.mutateAsync({ op: "signature.delete", id: s.id })}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">
          Signing name: <span className="font-medium text-foreground">{profile.signatureName}</span> - rendered with the same bundled font used at seal time.
        </p>
      </CardContent>

      <SignatureDialog open={dialog} onOpenChange={setDialog} act={act} defaultName={profile.signatureName} />
    </Card>
  );
}

/** Create-a-stamp dialog: draw (canvas), type (font) or upload (image). */
function SignatureDialog({
  open, onOpenChange, act, defaultName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  act: ReturnType<typeof useSettingsAct>;
  defaultName: string;
}) {
  const [kind, setKind] = useState<"signature" | "initial">("signature");
  const [method, setMethod] = useState<"draw" | "type" | "upload">("draw");
  const [typed, setTyped] = useState(defaultName);
  const [font, setFont] = useState(SIGNATURE_FONTS[0].key);
  const [uploadData, setUploadData] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width, y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    lastPoint.current = pos(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx || !lastPoint.current) return;
    const p = pos(e);
    ctx.strokeStyle = "#0a1530";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPoint.current = p;
    setHasDrawn(true);
  };
  const end = () => { drawing.current = false; lastPoint.current = null; };

  const clear = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasDrawn(false);
  };

  // Note: the canvas contents are read only inside the save handler - never
  // during render (react-hooks/refs).
  const hasValue = method === "draw" ? hasDrawn : method === "type" ? Boolean(typed.trim()) : Boolean(uploadData);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { clear(); setUploadData(null); setHasDrawn(false); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New {kind === "signature" ? "signature" : "initials"} stamp</DialogTitle>
          <DialogDescription>Draw with your mouse or finger, type your name in a handwriting font, or upload an image.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Stamp type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as "signature" | "initial")}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="signature">Signature</SelectItem>
                  <SelectItem value="initial">Initials</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as "draw" | "type" | "upload")}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draw">Draw</SelectItem>
                  <SelectItem value="type">Type</SelectItem>
                  <SelectItem value="upload">Upload</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {method === "draw" && (
            <div className="space-y-2">
              <canvas
                ref={canvasRef}
                width={560}
                height={180}
                onPointerDown={start}
                onPointerMove={move}
                onPointerUp={end}
                onPointerLeave={end}
                className="h-40 w-full touch-none rounded-lg border bg-white"
                aria-label="Signature drawing area"
              />
              <Button variant="outline" size="sm" className="h-9" onClick={clear}>
                <Eraser className="h-3.5 w-3.5" aria-hidden /> Clear
              </Button>
            </div>
          )}

          {method === "type" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="typed-sig">Text</Label>
                <Input id="typed-sig" value={typed} onChange={(e) => setTyped(e.target.value)} className="h-11" maxLength={60} />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {SIGNATURE_FONTS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFont(f.key)}
                    aria-pressed={font === f.key}
                    className={cn(
                      "flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-lg border p-2 transition-colors",
                      font === f.key ? "border-primary bg-primary-soft/40" : "hover:bg-muted/60",
                    )}
                  >
                    <span className={cn("text-xl leading-none", f.key)}>{typed || "Your name"}</span>
                    <span className="text-[10px] text-muted-foreground">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {method === "upload" && (
            <div className="space-y-2">
              <Label htmlFor="sig-upload">PNG, JPG or SVG - max ~300 KB</Label>
              <Input
                id="sig-upload" type="file" accept="image/png,image/jpeg,image/svg+xml"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) { setUploadData(null); return; }
                  if (file.size > 300_000) return; // guarded again server-side
                  const reader = new FileReader();
                  reader.onload = () => setUploadData(String(reader.result));
                  reader.readAsDataURL(file);
                }}
                className="h-11"
              />
              {uploadData && (
                <img src={uploadData} alt="Uploaded stamp preview" className="max-h-24 rounded-lg border bg-white p-2" />
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!hasValue || act.isPending}
            onClick={async () => {
              const value = method === "draw"
                ? canvasRef.current?.toDataURL("image/png")
                : method === "type" ? typed.trim()
                : uploadData;
              if (!value) return;
              await act.mutateAsync({
                op: "signature.add",
                data: { kind, method, value, font: method === "type" ? font : undefined, isDefault: true },
              }).catch(() => undefined);
              onOpenChange(false);
              clear();
              setUploadData(null);
            }}
          >
            Save stamp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Two-factor authentication (TOTP) ─────────────────────────────────────────

function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const act = useSettingsAct(["settings", "settings-account"]);
  const [enrol, setEnrol] = useState<{ open: boolean; qrSvg?: string; secret?: string; uri?: string; code: string }>({ open: false, code: "" });
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [disable, setDisable] = useState({ open: false, password: "", code: "" });

  const startEnrolment = async () => {
    try {
      const res = await apiPost<{ ok: boolean; qrSvg: string; secret: string; uri: string }>("/api/workspace/settings", { op: "2fa.start" });
      setEnrol({ open: true, qrSvg: res.qrSvg, secret: res.secret, uri: res.uri, code: "" });
    } catch {
      // act toast already surfaced the error
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden /> Two-factor authentication (TOTP)
        </CardTitle>
        <CardDescription>
          RFC 6238 authenticator apps (Google Authenticator, 1Password, Authy…). Codes are required at every sign-in; ten one-time recovery codes are issued at enrolment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <StatusBadge status={enabled ? "ACTIVE" : "OFF"} />
            <p className="text-sm">
              {enabled ? "Enabled - your account requires a verification code at sign-in." : "Not enabled - your account is protected by password only."}
            </p>
          </div>
          {enabled ? (
            <Button variant="outline" className="h-11" onClick={() => setDisable({ open: true, password: "", code: "" })}>
              Disable 2FA
            </Button>
          ) : (
            <Button className="h-11" onClick={startEnrolment}>
              <ShieldCheck className="h-4 w-4" aria-hidden /> Enable 2FA
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Workspace owners can require 2FA for every member from Settings → Account → Access security.
        </p>
      </CardContent>

      {/* Enrolment: QR → verify → recovery codes (shown once) */}
      <Dialog open={enrol.open} onOpenChange={(v) => { setEnrol((s) => ({ ...s, open: v })); if (!v) setRecovery(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{recovery ? "Save your recovery codes" : "Scan with your authenticator app"}</DialogTitle>
            <DialogDescription>
              {recovery
                ? "These ten codes are shown once. Each can replace a lost authenticator code a single time - store them somewhere safe."
                : "Scan the QR code, or enter the secret manually. Then confirm with a 6-digit code."}
            </DialogDescription>
          </DialogHeader>
          {recovery ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1.5 rounded-lg border bg-muted/40 p-3 font-mono text-sm">
                {recovery.map((c) => <span key={c} className="rounded bg-card px-2 py-1 text-center">{c}</span>)}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline" className="h-10 flex-1"
                  onClick={() => navigator.clipboard?.writeText(recovery.join("\n")).catch(() => undefined)}
                >
                  Copy all codes
                </Button>
                <Button className="h-10 flex-1" onClick={() => { setEnrol((s) => ({ ...s, open: false })); setRecovery(null); }}>
                  I saved them - done
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {enrol.qrSvg && (
                <div
                  className="mx-auto w-fit rounded-xl border bg-white p-3"
                  // SVG generated locally by the server for this secret - no external source
                  dangerouslySetInnerHTML={{ __html: enrol.qrSvg }}
                />
              )}
              {enrol.secret && <CopyableCode value={enrol.secret} max={40} />}
              <div className="space-y-1.5">
                <Label htmlFor="totp-code">Verification code</Label>
                <Input
                  id="totp-code" inputMode="numeric" maxLength={6} value={enrol.code}
                  onChange={(e) => setEnrol((s) => ({ ...s, code: e.target.value }))}
                  className="h-12 text-center font-mono text-lg tracking-[0.3em]"
                  placeholder="123456"
                />
              </div>
              <Button
                className="w-full"
                disabled={enrol.code.length !== 6 || act.isPending}
                onClick={async () => {
                  const res = await act.mutateAsync({ op: "2fa.enable", data: { code: enrol.code } }).catch(() => undefined);
                  const codes = res ? (res as { recoveryCodes?: unknown }).recoveryCodes : undefined;
                  if (Array.isArray(codes) && codes.every((c) => typeof c === "string")) {
                    setRecovery(codes as string[]);
                  }
                }}
              >
                Verify and enable
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Disable: password + current code */}
      <Dialog open={disable.open} onOpenChange={(v) => setDisable((s) => ({ ...s, open: v }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Disable two-factor authentication</DialogTitle>
            <DialogDescription>Confirm with your password and a current verification code.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="d-pw">Password</Label>
              <Input id="d-pw" type="password" value={disable.password} onChange={(e) => setDisable({ ...disable, password: e.target.value })} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-code">Verification code</Label>
              <Input
                id="d-code" inputMode="numeric" maxLength={6} value={disable.code}
                onChange={(e) => setDisable({ ...disable, code: e.target.value })}
                className="h-11 text-center font-mono tracking-[0.3em]" placeholder="123456"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisable({ open: false, password: "", code: "" })}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={disable.code.length !== 6 || !disable.password || act.isPending}
              onClick={async () => {
                await act.mutateAsync({ op: "2fa.disable", data: { password: disable.password, code: disable.code } }).catch(() => undefined);
                setDisable({ open: false, password: "", code: "" });
              }}
            >
              Disable 2FA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
