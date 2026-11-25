"use client";

/**
 * /welcome - GitBook-style onboarding wizard.
 *
 * Unauthenticated visitors start at the signup step; the flow then continues
 * through email verification → organization → signature → team invites →
 * account security → done. Every step is skippable where policy allows and
 * the whole state is server-derived from /api/onboarding.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight, Building2, Check, CheckCircle2, Circle, Copy, Eraser, KeyRound,
  Loader2, Mail, MailCheck, PenTool, PlayCircle, ShieldCheck, Sparkles, UserPlus, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, apiGet, apiPost, setSessionToken } from "@/lib/client";
import { BrandLogo } from "@/components/brand/logo";
import { PortalProviders } from "@/components/portal/providers";
import { planDef, planGuide } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { TURNSTILE_ENABLED, TurnstileField } from "@/components/ui/turnstile-field";

// ─── Types ────────────────────────────────────────────────────────────────────

type OnboardingData = {
  authenticated: boolean;
  user: { id: string; email: string; name: string } | null;
  emailVerified: boolean;
  org: { id: string; name: string; slug: string; industry: string | null; companySize: string | null; planCode: string; enforceTwoFactor: boolean } | null;
  steps: { account: boolean; verify: boolean; org: boolean; signature: boolean; invites: boolean; security: boolean };
  flags: { skippedInvite?: boolean; skippedSecurity?: boolean; completedAt?: string };
  completed: boolean;
  pendingInvites: number;
  inviteList: { id: string; email: string; role: string; createdAt: string }[];
  seats: { used: number; limit: number; remaining: number; members: number; pendingInvites: number };
  smtpTransportConfigured: boolean;
};

type InviteInfo = {
  status: string;
  org: { name: string };
  email?: string;
  role?: string;
  invitedBy?: string;
};

type StepKey = "account" | "verify" | "org" | "signature" | "invites" | "security" | "done";

const SIGNATURE_FONTS = [
  { key: "signature-font-caveat", label: "Caveat" },
  { key: "signature-font-dancing", label: "Dancing Script" },
  { key: "signature-font-greatvibes", label: "Great Vibes" },
];

const INDUSTRIES = ["Logistics & Transport", "Legal & Notary", "Finance & Insurance", "Healthcare & Life Sciences", "Real Estate", "Technology & SaaS", "Manufacturing", "Retail & E-commerce", "Education", "Public Sector", "Other"];
const SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"];

const stepMeta: Record<Exclude<StepKey, "done">, { label: string; hint: string; icon: typeof Mail }> = {
  account: { label: "Create your account", hint: "Name, email and password", icon: UserPlus },
  verify: { label: "Confirm your email", hint: "Activate signing & API access", icon: Mail },
  org: { label: "Your organization", hint: "Name your workspace", icon: Building2 },
  signature: { label: "Your signature", hint: "Draw, type or upload a stamp", icon: PenTool },
  invites: { label: "Invite your team", hint: "Send invitations now or later", icon: Users },
  security: { label: "Secure your account", hint: "Two-factor authentication", icon: ShieldCheck },
};

// ─── Wizard shell ─────────────────────────────────────────────────────────────

/** Exported shell - wires React Query context around the wizard. */
export function WelcomeWizard() {
  return (
    <PortalProviders>
      <Wizard />
    </PortalProviders>
  );
}

function Wizard() {
  const qc = useQueryClient();
  const [manualStep, setManualStep] = useState<StepKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inviteTokenRef = useRef<string | null>(null);
  // ?plan=SOLO prefill from the pricing page CTA (cycle 10). Lives in a ref:
  // consumed once by the signup payload, no re-render needed.
  const planRef = useRef<string | null>(null);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);

  const stateQ = useQuery({
    queryKey: ["onboarding"],
    queryFn: () => apiGet<OnboardingData>("/api/onboarding"),
  });
  const state = stateQ.data;

  // One-time boot: consume ?verify=<token> from the email link and preload
  // ?invite=<token> for the signup step. Uses window.location so the page
  // stays prerenderable (no useSearchParams Suspense requirement). The invite
  // token lives in a ref (no re-render needed); the invitation info arrives
  // asynchronously so setState stays out of the effect body.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const params = new URLSearchParams(window.location.search);
    const verify = params.get("verify");
    const invite = params.get("invite");
    const plan = params.get("plan");
    if (plan && ["SOLO", "STARTER"].includes(plan.toUpperCase())) {
      planRef.current = plan.toUpperCase();
    }

    if (invite) {
      inviteTokenRef.current = invite;
      apiGet<InviteInfo>(`/api/invitations/${invite}`)
        .then(setInviteInfo)
        .catch(() => setInviteInfo({ status: "NOT_FOUND", org: { name: "Docurama" } }));
    }

    if (verify) {
      fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token: verify }),
      })
        .then(async (res) => {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setNotice(res.ok ? "Email address verified - thank you!" : body.error ?? "That verification link is no longer valid");
          qc.invalidateQueries({ queryKey: ["onboarding"] });
        })
        .catch(() => setNotice("Verification failed - please try again"));
      window.history.replaceState({}, "", "/welcome");
    }
  }, [qc]);

  // Derived: which steps apply, which is active.
  const authed = state?.authenticated ?? false;
  const steps: Exclude<StepKey, "done">[] = authed
    ? ["verify", "org", "signature", "invites", "security"]
    : ["account"];
  const doneOf = (k: Exclude<StepKey, "done">): boolean => {
    if (!state) return false;
    if (k === "account") return authed;
    return state.steps[k];
  };
  const allDone = authed && state !== undefined && steps.every(doneOf);
  const showDone = allDone || (state?.completed ?? false);
  const firstIncomplete = steps.find((k) => !doneOf(k));
  const active: StepKey = manualStep ?? (showDone ? "done" : firstIncomplete ?? "done");

  const goto = (k: StepKey) => setManualStep(k);
  const advance = (to?: StepKey) => {
    if (to) { setManualStep(to); return; }
    const idx = steps.findIndex((k) => k === active);
    if (idx >= 0 && idx < steps.length - 1) setManualStep(steps[idx + 1]);
    else setManualStep("done");
  };

  if (stateQ.isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted" role="status">
        <BrandLogo size="md" className="animate-pulse" />
        <p className="text-sm text-muted-foreground">Preparing your workspace…</p>
      </div>
    );
  }
  if (stateQ.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted px-6 text-center">
        <p className="text-sm font-semibold">Cannot reach Docurama</p>
        <p className="max-w-sm text-sm text-muted-foreground">{(stateQ.error as Error).message}</p>
        <Button onClick={() => stateQ.refetch()}>Try again</Button>
      </div>
    );
  }

  const completedCount = steps.filter(doneOf).length;
  const progress = showDone ? 100 : Math.round((completedCount / steps.length) * 100);

  return (
    <div className="min-h-screen bg-muted">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandLogo tagline size="sm" />
          <div className="flex items-center gap-3 text-sm">
            {authed && state?.user ? (
              <>
                <span className="hidden text-muted-foreground sm:inline">{state.user.email}</span>
                <Button variant="outline" size="sm" onClick={() => { window.location.assign("/"); }}>
                  Open workspace <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => { window.location.assign("/login"); }}>
                I already have an account
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="mb-6 max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Welcome to Docurama</h1>
          <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
            {authed
              ? "A few quick steps and your workspace is ready to send, sign and seal documents."
              : "Create your account - it takes about two minutes to set up a compliant eSignature workspace."}
          </p>
          {notice && (
            <p role="status" className="mt-3 rounded-lg border border-primary/30 bg-primary-soft/50 px-3 py-2 text-sm text-primary-deep">
              {notice}
            </p>
          )}
          {inviteInfo && !authed && (
            <div className="mt-3 rounded-lg border bg-card px-3 py-2.5 text-sm">
              {inviteInfo.status === "PENDING" ? (
                <>
                  <span className="font-medium">{inviteInfo.invitedBy}</span> invited{" "}
                  <span className="font-medium">{inviteInfo.email}</span> to join{" "}
                  <span className="font-medium">{inviteInfo.org.name}</span> on Docurama.
                </>
              ) : (
                <>This invitation is {inviteInfo.status.toLowerCase()} - you can still create an account and ask to be invited again.</>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Step rail */}
          <nav aria-label="Onboarding steps" className="space-y-4">
            <Card>
              <CardContent className="p-2">
                <ol className="space-y-1">
                  {steps.map((k, i) => {
                    const meta = stepMeta[k];
                    const done = doneOf(k);
                    const isActive = active === k;
                    const Icon = meta.icon;
                    return (
                      <li key={k}>
                        <button
                          type="button"
                          onClick={() => goto(k)}
                          aria-current={isActive ? "step" : undefined}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors",
                            isActive ? "bg-primary-soft/60" : "hover:bg-muted/70",
                          )}
                        >
                          <span className={cn(
                            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                            done ? "border-primary bg-primary text-primary-foreground" : isActive ? "border-primary text-primary" : "border-muted-foreground/30 text-muted-foreground",
                          )}>
                            {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
                          </span>
                          <span className="min-w-0">
                            <span className={cn("block text-sm font-medium", isActive && "text-primary-deep")}>{meta.label}</span>
                            <span className="block text-xs text-muted-foreground">{meta.hint}</span>
                          </span>
                          <Icon className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                  {showDone && (
                    <li>
                      <button
                        type="button"
                        onClick={() => goto("done")}
                        aria-current={active === "done" ? "step" : undefined}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors",
                          active === "done" ? "bg-primary-soft/60" : "hover:bg-muted/70",
                        )}
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary bg-primary text-primary-foreground text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        <span className="text-sm font-medium">You&apos;re all set</span>
                      </button>
                    </li>
                  )}
                </ol>
              </CardContent>
            </Card>
            <div className="px-1">
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span className="tabular-nums">{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted-foreground/15" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </nav>

          {/* Active step panel - after signup the flow always continues at email verification */}
          <div>
            {/* key: when the async invite lookup resolves, the account step
                remounts so the invited email pre-fills the form. */}
            {!authed && (
              <AccountStep
                key={inviteInfo?.email ?? "new"}
                invite={inviteInfo}
                inviteTokenRef={inviteTokenRef}
                planRef={planRef}
                onDone={() => advance("verify")}
              />
            )}
            {authed && active === "verify" && <VerifyStep state={state!} onDone={() => advance()} />}
            {authed && active === "org" && <OrgStep state={state!} onDone={() => advance()} />}
            {authed && active === "signature" && <SignatureStep state={state!} onDone={() => advance()} />}
            {authed && active === "invites" && <InvitesStep state={state!} onDone={() => advance()} />}
            {authed && active === "security" && <SecurityStep state={state!} onDone={() => advance()} />}
            {authed && active === "done" && <DoneStep state={state!} />}
          </div>
        </div>
      </main>

      <footer className="border-t bg-background py-6">
        <p className="mx-auto max-w-6xl px-4 text-xs text-muted-foreground sm:px-6">
          Docurama is a product of VOIRIA (VOIRIA SASU) - 1 Rue Marguerin, 75014 Paris, France · EU data residency ·
          Questions during setup? <a className="underline underline-offset-2" href="mailto:support@docurama.eu">support@docurama.eu</a>
        </p>
      </footer>
    </div>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

function useOnboardingAct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { op: string; data?: Record<string, unknown>; id?: string }) =>
      apiPost<{ ok?: boolean; message?: string; [k: string]: unknown }>("/api/onboarding", vars),
    onSuccess: (body) => {
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      if (body?.message) toast.success(body.message);
    },
    onError: (err: ApiError) => toast.error(err.message),
  });
}

function StepPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-5 p-6 sm:p-8">
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

// ─── Step 1: account (unauthenticated only) ───────────────────────────────────

function AccountStep({ invite, inviteTokenRef, planRef, onDone }: { invite: InviteInfo | null; inviteTokenRef: React.RefObject<string | null>; planRef: React.RefObject<string | null>; onDone: () => void }) {
  const qc = useQueryClient();
  const viaInvite = invite?.status === "PENDING";
  const [form, setForm] = useState({
    firstName: "", lastName: "",
    email: invite?.status === "PENDING" ? invite.email ?? "" : "",
    password: "",
    organization: "",
    consent: false,
  });
  // Bot guard: the moment this step rendered + an offscreen honeypot.
  const [signupStartedAt] = useState(() => Date.now());
  const [honeypot, setHoneypot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [verificationReset, setVerificationReset] = useState(0);

  const [corporateDomain, setCorporateDomain] = useState<{
    autoJoin: boolean;
    domain?: string;
    tenantName?: string;
  } | null>(null);

  useEffect(() => {
    if (viaInvite) return;
    const parts = form.email.split("@");
    const timer = setTimeout(() => {
      if (parts.length === 2 && parts[1].includes(".")) {
        apiGet<{ autoJoin: boolean; domain?: string; tenantName?: string }>(
          `/api/auth/check-domain?email=${encodeURIComponent(form.email)}`
        )
          .then((res) => {
            if (res.autoJoin && res.tenantName) {
              setCorporateDomain(res);
              setForm((prev) => ({ ...prev, organization: res.tenantName || prev.organization }));
            } else {
              setCorporateDomain(null);
            }
          })
          .catch(() => setCorporateDomain(null));
      } else {
        setCorporateDomain(null);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [form.email, viaInvite]);

  const signup = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      }).then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { error?: string; token?: string };
        if (!res.ok) throw new ApiError(body.error ?? `Signup failed (HTTP ${res.status})`, res.status);
        return body;
      }),
    onSuccess: (body) => {
      if (body.token) setSessionToken(body.token);
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      toast.success(
        corporateDomain?.autoJoin
          ? `Confirm your email to join ${corporateDomain.tenantName}.`
          : "Account created - let's set up your workspace"
      );
      onDone();
    },
    onError: (err: ApiError) => {
      setTurnstileToken("");
      setVerificationReset((value) => value + 1);
      toast.error(err.message);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (signup.isPending || (TURNSTILE_ENABLED && !turnstileToken)) return;
    signup.mutate({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      password: form.password,
      organization: corporateDomain?.autoJoin ? corporateDomain.tenantName : form.organization,
      consent: form.consent,
      // Bot guard (src/lib/bot-guard.ts): honeypot + render timestamp.
      website: honeypot,
      formStartedAt: signupStartedAt,
      turnstileToken,
      ...(viaInvite ? { inviteToken: inviteTokenRef.current } : {}),
      // ?plan= prefill from the pricing page (SOLO). Ignored when joining
      // via invitation or corporate domain — the existing workspace wins.
      ...(!viaInvite && !corporateDomain?.autoJoin && planRef.current ? { planCode: planRef.current } : {}),
    });
  };

  return (
    <StepPanel
      title={
        viaInvite
          ? `Join ${invite?.org.name} on Docurama`
          : corporateDomain?.autoJoin
          ? `Join ${corporateDomain.tenantName}`
          : "Create your account"
      }
      description={
        viaInvite
          ? "Your teammates are already here - create your login with the invited email address."
          : corporateDomain?.autoJoin
          ? `Confirm your @${corporateDomain.domain} email address to access ${corporateDomain.tenantName}.`
          : "You'll be the owner of a new organization on a 14-day trial of the Starter plan. No credit card required."
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {/* Honeypot: invisible to humans, irresistible to bots. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="su-website">Website</label>
          <input
            id="su-website" name="website" type="text" tabIndex={-1} autoComplete="off"
            value={honeypot} onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="su-first">First name</Label>
            <Input id="su-first" autoComplete="given-name" required maxLength={40} value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Alexandra" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="su-last">Last name</Label>
            <Input id="su-last" autoComplete="family-name" required maxLength={40} value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Fischer" className="h-11" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="su-email">Work email</Label>
          <Input id="su-email" type="email" autoComplete="email" required value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            readOnly={viaInvite} aria-readonly={viaInvite}
            placeholder="you@company.com" className="h-11" />
          {viaInvite && <p className="text-xs text-muted-foreground">Locked to the invited address - this invitation belongs to {invite?.email}.</p>}
        </div>

        {corporateDomain?.autoJoin && (
          <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="space-y-0.5">
              <p className="font-medium text-emerald-950 dark:text-emerald-100">
                Approved company workspace: {corporateDomain.tenantName}
              </p>
              <p className="text-xs text-emerald-800 dark:text-emerald-300">
                Your email domain (@{corporateDomain.domain}) is registered. After you verify your email, you can join the company workspace without an individual subscription.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="su-password">Password</Label>
          <Input id="su-password" type="password" autoComplete="new-password" required value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 10 characters"
            className="h-11" minLength={10} />
          <p className="text-xs text-muted-foreground">Minimum 10 characters with at least one letter and one number.</p>
        </div>
        {!viaInvite && !corporateDomain?.autoJoin && (
          <div className="space-y-1.5">
            <Label htmlFor="su-org">Organization name</Label>
            <Input id="su-org" required maxLength={80} value={form.organization}
              onChange={(e) => setForm({ ...form, organization: e.target.value })}
              placeholder="StålFe" className="h-11" />
            <p className="text-xs text-muted-foreground">Your workspace - teammates join it by invitation.</p>
          </div>
        )}
        <label className="flex items-start gap-2.5 rounded-lg border bg-muted/50 p-3 text-sm">
          <input
            type="checkbox"
            required
            checked={form.consent}
            onChange={(e) => setForm({ ...form, consent: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-[#0f7a5a]"
          />
          <span className="text-muted-foreground">
            I agree to the Docurama{" "}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">Terms of Service</a>{" "}
            and{" "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</a>,
            and I consent to the processing of my account data as described there (GDPR Art. 6(1)(b)).
          </span>
        </label>
        <TurnstileField onToken={setTurnstileToken} resetKey={verificationReset} />
        <Button type="submit" className="w-full" disabled={signup.isPending || (TURNSTILE_ENABLED && !turnstileToken)}>
          {signup.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Creating your account…</>
          ) : (
            <><UserPlus className="h-4 w-4" aria-hidden /> {viaInvite ? "Create account & join" : "Create account"}</>
          )}
        </Button>
        {signup.isError && (
          <p role="alert" className="text-sm text-destructive">{(signup.error as ApiError)?.message}</p>
        )}
      </form>
    </StepPanel>
  );
}

// ─── Step 2: verify email ─────────────────────────────────────────────────────

function VerifyStep({ state, onDone }: { state: OnboardingData; onDone: () => void }) {
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = useMutation({
    mutationFn: () =>
      fetch("/api/auth/resend-verification", { method: "POST", credentials: "same-origin" })
        .then(async (res) => {
          const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
          if (!res.ok) throw new ApiError(body.error ?? "Could not send the email", res.status);
          return body;
        }),
    onSuccess: (body) => {
      setCooldown(60);
      toast.success(body.message ?? "Verification email sent");
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  if (state.emailVerified) {
    return (
      <StepPanel title="Email confirmed" description="Your address is verified - signing, certificates and API access are active.">
        <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary-soft/50 p-4">
          <MailCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="text-sm">
            <p className="font-medium text-primary-deep">{state.user?.email}</p>
            <p className="text-muted-foreground">Verified - recorded in your audit trail.</p>
          </div>
        </div>
        <Button onClick={onDone}>Continue <ArrowRight className="h-4 w-4" aria-hidden /></Button>
      </StepPanel>
    );
  }

  return (
    <StepPanel
      title="Confirm your email address"
      description="We sent a verification link to your inbox from Docurama Sign <notifications@docurama.eu>. Confirming your email activates signing, certificates and API keys."
    >
    <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-4 text-sm">
          <Mail className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">{state.user?.email}</p>
            <p className="text-muted-foreground">Check your inbox (and spam folder) - the link expires in 24 hours.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => resend.mutate()} disabled={resend.isPending || cooldown > 0}>
            {resend.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
          </Button>
        </div>
        <p className="rounded-lg border border-dashed bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          If the verification email does not arrive after you resend it, contact your workspace administrator.
          Workspace access requires confirmation through the link sent to your email address.
        </p>
        <Button variant="ghost" size="sm" onClick={onDone} className="text-muted-foreground">
          I&apos;ll do this later - continue setup
        </Button>
      </div>
    </StepPanel>
  );
}

// ─── Step 3: organization ─────────────────────────────────────────────────────

function OrgStep({ state, onDone }: { state: OnboardingData; onDone: () => void }) {
  const act = useOnboardingAct();
  const [form, setForm] = useState({
    name: state.org?.name ?? "",
    industry: state.org?.industry ?? "",
    companySize: state.org?.companySize ?? "",
  });
  const saved = state.steps.org;

  return (
    <StepPanel
      title="Your organization"
      description="This name appears on envelopes, signing invitations and completion certificates. You can change it later in Settings → Account."
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="org-name">Organization name</Label>
          <Input id="org-name" required maxLength={80} value={form.name} className="h-11"
            onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="StålFe" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Industry (optional)</Label>
            <Select value={form.industry || undefined} onValueChange={(v) => setForm({ ...form, industry: v })}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Select an industry" /></SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Company size (optional)</Label>
            <Select value={form.companySize || undefined} onValueChange={(v) => setForm({ ...form, companySize: v })}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Employees" /></SelectTrigger>
              <SelectContent>
                {SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => act.mutate({ op: "org.update", data: { name: form.name, industry: form.industry, companySize: form.companySize } })}
            disabled={act.isPending || !form.name.trim()}>
            {act.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Building2 className="h-4 w-4" aria-hidden />}
            {saved ? "Save changes" : "Save & continue"}
          </Button>
          {saved && (
            <Button variant="ghost" onClick={onDone}>
              Continue <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
        {state.org && (
          <p className="text-xs text-muted-foreground">
            Workspace slug <span className="font-mono">{state.org.slug}</span> · plan{" "}
            {state.org.planCode === "STARTER" ? "Starter (trial)" : state.org.planCode} · {state.org.enforceTwoFactor ? "2FA required by policy" : "2FA optional"}
          </p>
        )}
      </div>
    </StepPanel>
  );
}

// ─── Step 4: signature ────────────────────────────────────────────────────────

function SignatureStep({ state, onDone }: { state: OnboardingData; onDone: () => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"signature" | "initial">("signature");
  const [method, setMethod] = useState<"draw" | "type" | "upload">("draw");
  const [typed, setTyped] = useState(state.user?.name ?? "");
  const [font, setFont] = useState(SIGNATURE_FONTS[0].key);
  const [uploadData, setUploadData] = useState<string | null>(null);
  const [savedStamps, setSavedStamps] = useState<{ kind: string; preview: string }[]>([]);
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

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300_000) { toast.error("Image too large - keep it under 300 KB"); return; }
    const reader = new FileReader();
    reader.onload = () => setUploadData(String(reader.result));
    reader.readAsDataURL(file);
  };

  const hasValue = method === "draw" ? hasDrawn : method === "type" ? Boolean(typed.trim()) : Boolean(uploadData);

  const save = useMutation({
    mutationFn: async () => {
      let value: string;
      if (method === "draw") {
        value = canvasRef.current?.toDataURL("image/png") ?? "";
        if (!hasDrawn) throw new Error("Draw your signature first");
      } else if (method === "type") {
        value = typed.trim();
      } else {
        value = uploadData ?? "";
      }
      const res = await apiPost<{ ok?: boolean; message?: string }>("/api/onboarding", {
        op: "signature.save",
        data: { kind, method, value, font: method === "type" ? font : null },
      });
      return { res, preview: method === "type" ? value : method === "upload" ? (uploadData ?? "") : (canvasRef.current?.toDataURL("image/png") ?? "") };
    },
    onSuccess: ({ res, preview }) => {
      setSavedStamps((prev) => [...prev, { kind, preview }]);
      if (kind === "signature") setKind("initial"); // nudge: add initials next
      clear();
      toast.success(res.message ?? "Stamp saved");
      qc.invalidateQueries({ queryKey: ["onboarding"] });
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  return (
    <StepPanel
      title="Your signature & initials"
      description="The stamp that is affixed when you sign. Your signature is applied to signature fields; initials stamp every page of long documents. Both can be managed later in Settings → Profile."
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {(["signature", "initial"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
              className={cn("rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                kind === k ? "border-primary bg-primary-soft/60 text-primary-deep" : "hover:bg-muted")}>
              {k === "signature" ? "Signature" : "Initials"}
            </button>
          ))}
          <span className="mx-1 h-8 w-px bg-border" aria-hidden />
          {(["draw", "type", "upload"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m}
              className={cn("rounded-full border px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                method === m ? "border-primary bg-primary-soft/60 text-primary-deep" : "hover:bg-muted")}>
              {m}
            </button>
          ))}
        </div>

        {method === "draw" && (
          <div className="space-y-2">
            <canvas ref={canvasRef} width={560} height={200} onPointerDown={start} onPointerMove={move}
              onPointerUp={end} onPointerLeave={end}
              className="h-44 w-full touch-none rounded-lg border bg-white" aria-label={`Draw your ${kind} here`} />
            <Button variant="outline" size="sm" onClick={clear}><Eraser className="h-3.5 w-3.5" aria-hidden /> Clear</Button>
          </div>
        )}

        {method === "type" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ob-typed">{kind === "signature" ? "Signature text" : "Initials text"}</Label>
              <Input id="ob-typed" value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={60} className="h-11" />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {SIGNATURE_FONTS.map((f) => (
                <button key={f.key} type="button" onClick={() => setFont(f.key)} aria-pressed={font === f.key}
                  className={cn("flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-lg border p-2 transition-colors",
                    font === f.key ? "border-primary bg-primary-soft/40" : "hover:bg-muted/60")}>
                  <span className={cn("text-xl leading-none", f.key)}>{typed || "Your name"}</span>
                  <span className="text-[10px] text-muted-foreground">{f.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {method === "upload" && (
          <div className="space-y-2">
            <label className="flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/40 text-sm text-muted-foreground transition-colors hover:border-primary/50">
              {uploadData ? (
                <img src={uploadData} alt="Uploaded stamp preview" className="max-h-28 object-contain" />
              ) : (
                <>
                  <PenTool className="h-5 w-5" aria-hidden />
                  Click to upload a PNG or JPG (max 300 KB)
                </>
              )}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onUpload} />
            </label>
            {uploadData && <Button variant="outline" size="sm" onClick={() => setUploadData(null)}>Remove image</Button>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => save.mutate()} disabled={save.isPending || !hasValue}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PenTool className="h-4 w-4" aria-hidden />}
            Save {kind === "signature" ? "signature" : "initials"}
          </Button>
          {state.steps.signature && (
            <Button variant="ghost" onClick={onDone}>
              Continue <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>

        {(savedStamps.length > 0 || state.steps.signature) && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Saved stamps</span>
            {savedStamps.map((s, i) => (
              <span key={i} className="flex h-10 min-w-20 items-center justify-center rounded border bg-white px-3">
                {s.preview.startsWith("data:") ? (
                  <img src={s.preview} alt={`${s.kind} stamp`} className="max-h-8 object-contain" />
                ) : (
                  <span className="text-lg leading-none" style={{ fontFamily: "Caveat, cursive" }}>{s.preview}</span>
                )}
              </span>
            ))}
            {save.isSuccess && <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />}
          </div>
        )}
      </div>
    </StepPanel>
  );
}

// ─── Step 5: invites ──────────────────────────────────────────────────────────

function InvitesStep({ state, onDone }: { state: OnboardingData; onDone: () => void }) {
  const act = useOnboardingAct();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const seats = state.seats ?? { used: 1, limit: 3, remaining: 2, members: 1, pendingInvites: 0 };
  const full = seats.remaining <= 0;
  const plan = planDef(state.org?.planCode ?? "STARTER");

  return (
    <StepPanel
      title="Invite your team"
      description="Teammates receive an invitation email from notifications@docurama.eu with a secure link - they create their own password, so you never handle credentials."
    >
      <div className="space-y-4">
        {/* Seat occupancy: invites target the plan's remaining seats. */}
        <div className="rounded-lg border bg-muted/40 p-4">
          <div className="flex items-center justify-between text-sm">
            <p className="font-medium">
              {seats.remaining > 0
                ? `Fill your ${plan.name} seats — ${seats.remaining} of ${seats.limit} still open`
                : `All ${seats.limit} ${plan.name} seats are taken`}
            </p>
            <span className="text-xs tabular-nums text-muted-foreground">
              {seats.members} member{seats.members === 1 ? "" : "s"}
              {seats.pendingInvites > 0 && ` · ${seats.pendingInvites} pending`}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={seats.used} aria-valuemin={0} aria-valuemax={seats.limit} aria-label={`${seats.used} of ${seats.limit} seats used`}>
            <div className={cn("h-full rounded-full transition-all", full ? "bg-destructive" : "bg-primary")} style={{ width: `${seats.limit ? Math.min(100, Math.round((seats.used / seats.limit) * 100)) : 0}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {full
              ? "Revoke an invitation to free a seat, or continue — you can upgrade the plan anytime."
              : seats.remaining === 1
                ? "One seat left — invite the teammate who sends the most documents."
                : "Invite now or continue alone; invitations can be sent anytime from Settings → Users."}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="inv-email">Email address</Label>
            <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com" className="h-11" disabled={full} />
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole} disabled={full}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="ADMIN">Workspace admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="h-11" disabled={!email.includes("@") || act.isPending || full}
            title={full ? "All seats are in use" : undefined}
            onClick={() => { act.mutate({ op: "invite.send", data: { email, role } }); setEmail(""); }}>
            {act.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
            Invite
          </Button>
        </div>

        {state.inviteList.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {state.inviteList.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.role === "ADMIN" ? "Workspace admin" : "Member"} · invitation pending
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="text-muted-foreground"
                  onClick={() => act.mutate({ op: "invite.revoke", id: inv.id })}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => act.mutate({ op: "invite.skip" })} disabled={act.isPending}>
            Skip for now
          </Button>
          {state.steps.invites && (
            <Button onClick={onDone}>
              Continue <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          You can invite and manage teammates anytime in Settings → Users - including revoking invitations and
          enforcing two-factor authentication for the whole organization.
        </p>
      </div>
    </StepPanel>
  );
}

// ─── Step 6: security (2FA) ───────────────────────────────────────────────────

type TotpStart = { ok?: boolean; secret?: string; uri?: string; qrSvg?: string };

function SecurityStep({ state, onDone }: { state: OnboardingData; onDone: () => void }) {
  const qc = useQueryClient();
  const [enrol, setEnrol] = useState<TotpStart | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const startEnrol = useMutation({
    mutationFn: () => apiPost<TotpStart>("/api/workspace/settings", { op: "2fa.start" }),
    onSuccess: (body) => setEnrol(body),
    onError: (err: ApiError) => toast.error(err.message),
  });

  const enable = useMutation({
    mutationFn: () => apiPost<{ message?: string; recoveryCodes?: string[] }>("/api/workspace/settings", {
      op: "2fa.enable", data: { code },
    }),
    onSuccess: (body) => {
      setRecoveryCodes(body.recoveryCodes ?? []);
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      toast.success(body.message ?? "Two-factor authentication enabled");
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  const skip = useMutation({
    mutationFn: () => apiPost<{ message?: string }>("/api/onboarding", { op: "security.skip" }),
    onSuccess: (body) => {
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      toast.success(body.message ?? "Skipped for now");
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  return (
    <StepPanel
      title="Secure your account"
      description={
        state.org?.enforceTwoFactor
          ? "Your organization requires two-factor authentication - enroll an authenticator app to finish setup."
          : "Add a second factor with any TOTP authenticator app (Google Authenticator, 1Password, Authy…). Strongly recommended for signing accounts."
      }
    >
      <div className="space-y-4">
        {!enrol && !recoveryCodes && (
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => startEnrol.mutate()} disabled={startEnrol.isPending}>
              {startEnrol.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
              Set up 2FA
            </Button>
            {!state.org?.enforceTwoFactor && (
              <Button variant="outline" onClick={() => skip.mutate()} disabled={skip.isPending}>
                Skip for now
              </Button>
            )}
          </div>
        )}

        {enrol && !recoveryCodes && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="shrink-0 rounded-lg border bg-white p-3"
                // Server-generated QR SVG (safe - no external assets)
                dangerouslySetInnerHTML={{ __html: enrol.qrSvg ?? "" }} />
              <div className="space-y-2 text-sm">
                <p className="font-medium">Scan with your authenticator app</p>
                <p className="text-muted-foreground">Or enter this secret manually:</p>
                <code className="block break-all rounded bg-muted px-2 py-1.5 font-mono text-xs">{enrol.secret}</code>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ob-code">Enter the 6-digit code</Label>
              <div className="flex gap-2">
                <Input id="ob-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="h-11 w-36 text-center font-mono text-lg tracking-[0.3em]" placeholder="123456" />
                <Button className="h-11" disabled={code.length !== 6 || enable.isPending} onClick={() => enable.mutate()}>
                  {enable.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
                  Verify & enable
                </Button>
              </div>
            </div>
          </div>
        )}

        {recoveryCodes && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-primary-deep">Two-factor enabled - save your recovery codes</p>
            <p className="text-sm text-muted-foreground">
              Each code works exactly once if you lose your authenticator. They are shown only this once.
            </p>
            <div className="grid gap-1.5 rounded-lg border bg-muted/50 p-4 sm:grid-cols-2">
              {recoveryCodes.map((c) => (
                <code key={c} className="font-mono text-sm">{c}</code>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(recoveryCodes.join("\n")); toast.success("Recovery codes copied"); }}>
                <Copy className="h-4 w-4" aria-hidden /> Copy codes
              </Button>
              <Button onClick={onDone}>Continue <ArrowRight className="h-4 w-4" aria-hidden /></Button>
            </div>
          </div>
        )}

        {state.steps.security && !recoveryCodes && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary-soft/50 p-4 text-sm">
            <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <p className="text-primary-deep">
              {state.flags.skippedSecurity
                ? "Two-factor is optional for your organization - you can enable it anytime in Settings → Profile."
                : "Two-factor authentication is active on your account."}
            </p>
          </div>
        )}
        {state.steps.security && !recoveryCodes && (
          <Button onClick={onDone}>Continue <ArrowRight className="h-4 w-4" aria-hidden /></Button>
        )}
      </div>
    </StepPanel>
  );
}

// ─── Done ─────────────────────────────────────────────────────────────────────

function DoneStep({ state }: { state: OnboardingData }) {
  const qc = useQueryClient();
  const finish = useMutation({
    mutationFn: () => apiPost<{ message?: string }>("/api/onboarding", { op: "complete" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding"] }),
    onError: (err: ApiError) => toast.error(err.message),
  });

  const checklist = [
    { label: "Account created", done: true },
    { label: "Email verified", done: state.emailVerified },
    { label: `Organization - ${state.org?.name ?? ""}`, done: state.steps.org },
    { label: "Signature & initials ready", done: state.steps.signature },
    { label: state.flags.skippedInvite ? "Team invites - skipped" : `${state.pendingInvites} teammate${state.pendingInvites === 1 ? "" : "s"} invited`, done: state.steps.invites },
    { label: state.flags.skippedSecurity ? "Two-factor - skipped (enable anytime)" : "Two-factor authentication", done: state.steps.security },
  ];

  // Per-plan guided instructions + demos (cycle 10): the done step points
  // each customer at what their plan is for and how to see it working.
  const plan = planDef(state.org?.planCode ?? "STARTER");
  const guide = planGuide(state.org?.planCode ?? "STARTER");

  return (
    <StepPanel
      title={state.completed ? "You're all set" : "Finish setup"}
      description="Here's your workspace summary. You can revisit any of this later - everything lives in Settings."
    >
      <div className="space-y-5">
        <ul className="space-y-2.5">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-center gap-3 text-sm">
              {item.done ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" aria-hidden />
              )}
              <span className={item.done ? "" : "text-muted-foreground"}>{item.label}</span>
            </li>
          ))}
        </ul>

        {/* Plan guide: what this plan is for, guided first moves, demos. */}
        <div className="rounded-xl border bg-muted/40 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden /> {guide.headline}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {plan.name} · {plan.seatLabel} · {plan.envelopeLimit.toLocaleString("en-GB")} envelopes/month
            {plan.code === "SOLO" || plan.code === "STARTER" ? " · 35 sending days a month (weekends on us)" : ""}
            {" "}· unused envelopes roll over on renewal
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
          </div>
          <ul className="mt-4 space-y-1.5 border-t pt-3">
            {plan.outcomes.map((o) => (
              <li key={o} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /> {o}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-3">
          {!state.completed && (
            <Button onClick={() => finish.mutate()} disabled={finish.isPending || !state.emailVerified || !state.steps.org}>
              {finish.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
              Finish setup
            </Button>
          )}
          <Button variant={state.completed ? "default" : "outline"} onClick={() => { window.location.assign("/"); }}>
            <ArrowRight className="h-4 w-4" aria-hidden /> Open my workspace
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Next steps worth knowing: connect your sending domain (Settings → Account) so invitations come from
          your own address, provision a signing certificate (Settings → eSign), and create an API key
          (Settings → API) if you plan to integrate.
        </p>
      </div>
    </StepPanel>
  );
}
