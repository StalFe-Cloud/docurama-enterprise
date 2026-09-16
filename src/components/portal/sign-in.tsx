"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, Loader2, Lock, KeyRound, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, setSessionToken } from "@/lib/client";
import { BrandLogo, BRAND_LEGAL_NAME, BRAND_ADDRESS } from "@/components/brand/logo";

/**
 * One-click sign-in for the QA dataset. These are working credentials printed
 * in plain text, so the block is gated behind an explicit opt-in rather than
 * shipped by default: PRODUCTION-PLAN.md carries "demo accounts removed or
 * rotated" as a go-live item, and a login page that advertises a platform
 * administrator password is the sort of thing that survives to production by
 * accident. Unset or "false" in any real deployment.
 *
 * NEXT_PUBLIC_* is inlined at build time, so a production build with the flag
 * unset drops this code path entirely rather than merely hiding it.
 */
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const DEMO_ACCOUNTS = [
  {
    label: "Platform Admin - Docurama SAS",
    email: "admin@docurama.eu",
    password: "admin1234",
    desc: "Full admin control panel: tenants, compliance, billing, ops",
  },
  {
    label: "Workspace Admin - StålFe",
    email: "alex@stalfe.example",
    password: "demo1234",
    desc: "Enterprise user portal: documents, templates, settings",
  },
];

type LoginBody = {
  ok?: boolean;
  error?: string;
  token?: string;
  requiresOtp?: boolean;
  challenge?: string;
};

export function SignIn() {
  const [view, setView] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [otp, setOtp] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const queryClient = useQueryClient();

  const forgotMutation = useMutation({
    mutationFn: (targetEmail: string) =>
      fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new ApiError(data.error ?? "Failed to request reset link", res.status);
        return data;
      }),
    onSuccess: () => {
      setForgotSubmitted(true);
      toast.success("Reset instructions sent");
    },
    onError: (err: ApiError) => {
      toast.error(err.message || "Failed to request reset link");
    },
  });

  const login = useMutation({
    mutationFn: (creds: { email: string; password: string; otp?: string; challenge?: string }) =>
      fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(creds),
      }).then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as LoginBody;
        if (!res.ok) throw new ApiError(body.error ?? `Sign-in failed (HTTP ${res.status})`, res.status);
        return body;
      }),
    onSuccess: (body) => {
      if (body?.requiresOtp && body?.challenge) {
        // Password accepted - the account requires the second factor.
        setChallenge(body.challenge);
        setOtp("");
        return;
      }
      setChallenge(null);
      // Persist the bearer fallback token so the session survives embedding
      // contexts where the browser blocks third-party cookies entirely.
      if (body?.token) setSessionToken(body.token);
      // Signing in from /login (or /welcome) lands the user in the app root.
      if (window.location.pathname !== "/") {
        window.history.pushState({}, "", "/");
      }
      queryClient.invalidateQueries({ queryKey: ["session"] });
      toast.success("Welcome back");
    },
    onError: (err: ApiError) => {
      toast.error(err.message || "Sign-in failed");
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (challenge) {
      login.mutate({ email, password, otp: otp.trim(), challenge });
    } else {
      login.mutate({ email, password });
    }
  };

  const submitForgot = (e: React.FormEvent) => {
    e.preventDefault();
    const target = forgotEmail.trim() || email.trim();
    if (!target) return;
    forgotMutation.mutate(target);
  };

  const backToPassword = () => {
    setChallenge(null);
    setOtp("");
    setUseRecovery(false);
    login.reset();
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted lg:grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-nautical p-10 text-white lg:flex">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary/30 blur-3xl" aria-hidden />
        <div className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-[#4fd1a1]/15 blur-3xl" aria-hidden />
        <div className="relative">
          <BrandLogo invert tagline size="md" />
        </div>
        <div className="relative max-w-md space-y-5">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            The enterprise portal for signed, sealed and verifiable documents.
          </h1>
          <p className="text-sm leading-relaxed text-white/70">
            PAdES digital signatures with honest conformance reporting, RFC 3161 timestamps,
            GDPR-grade compliance operations and full platform administration - in one console.
          </p>
          <ul className="space-y-2.5 text-sm text-white/80">
            {[
              "Cryptographic verification with copyable evidence digests",
              "Tenant, plan and lifecycle administration for the whole platform",
              "DSAR, retention, legal hold and audit chain operations built-in",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/40">
          © 2026 {BRAND_LEGAL_NAME} · {BRAND_ADDRESS} · EU data residency · eIDAS &amp; ESIGN compliant workflows
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6">
        <main className="w-full max-w-md space-y-8">
          <div className="space-y-2 text-center lg:text-left">
            <div className="mb-6 flex justify-center lg:justify-start">
              <BrandLogo tagline size="md" className="lg:hidden" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {view === "forgot"
                ? "Reset your password"
                : challenge
                ? "Two-factor verification"
                : "Sign in to your portal"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {view === "forgot"
                ? "Enter your work email address and we'll send you a secure link to reset your password."
                : challenge
                ? `Enter the 6-digit code from your authenticator app${useRecovery ? " - or paste one of your recovery codes" : ""}.`
                : "Platform administrators and workspace members use the same door."}
            </p>
          </div>

          {view === "forgot" ? (
            forgotSubmitted ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 space-y-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-foreground">Check your inbox</h3>
                  <p className="text-sm text-muted-foreground">
                    If an account exists for <span className="font-medium text-foreground">{forgotEmail || email}</span>, a secure password reset link has been sent.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  The link is valid for 1 hour. Be sure to check your spam or quarantine folders.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => {
                    setView("signin");
                    setForgotSubmitted(false);
                  }}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to sign in
                </Button>
              </div>
            ) : (
              <form onSubmit={submitForgot} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email">Work email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={forgotEmail || email}
                    onChange={(e) => {
                      setForgotEmail(e.target.value);
                      setEmail(e.target.value);
                    }}
                    placeholder="you@company.com"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={forgotMutation.isPending || !(forgotEmail.trim() || email.trim())}
                >
                  {forgotMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending reset link…</>
                  ) : (
                    <><KeyRound className="mr-2 h-4 w-4" /> Send reset link</>
                  )}
                </Button>
                {forgotMutation.isError && (
                  <p role="alert" className="text-sm text-destructive">
                    {(forgotMutation.error as ApiError)?.message ?? "Failed to send reset link."}
                  </p>
                )}
                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setView("signin");
                      forgotMutation.reset();
                    }}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                  </button>
                </div>
              </form>
            )
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              {challenge ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="otp">{useRecovery ? "Recovery code" : "Verification code"}</Label>
                    <Input
                      id="otp"
                      inputMode={useRecovery ? "text" : "numeric"}
                      autoComplete="one-time-code"
                      autoFocus
                      required
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder={useRecovery ? "a1b2-c3d4" : "123456"}
                      className="h-12 text-center font-mono text-lg tracking-[0.3em]"
                      maxLength={useRecovery ? 12 : 6}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={login.isPending || otp.trim().length < 4}>
                    {login.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Verifying…</>
                    ) : (
                      <><KeyRound className="h-4 w-4" aria-hidden /> Verify and sign in</>
                    )}
                  </Button>
                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => { setUseRecovery((v) => !v); setOtp(""); }}
                      className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {useRecovery ? "Use the app code instead" : "Use a recovery code"}
                    </button>
                    <button
                      type="button"
                      onClick={backToPassword}
                      className="flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Work email</Label>
                    <Input
                      id="email" type="email" autoComplete="email" required value={email}
                      onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <button
                        type="button"
                        onClick={() => {
                          setView("forgot");
                          setForgotEmail(email);
                        }}
                        className="text-xs text-primary underline-offset-4 hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <Input
                      id="password" type="password" autoComplete="current-password" required value={password}
                      onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={login.isPending}>
                    {login.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Signing in…</>
                    ) : (
                      <><Lock className="h-4 w-4" aria-hidden /> Sign in securely</>
                    )}
                  </Button>
                </>
              )}
              {login.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {(login.error as ApiError)?.message ?? "Sign-in failed - please try again."}
                </p>
              )}
            </form>
          )}

          {view === "signin" && !challenge && (
            <p className="text-center text-sm text-muted-foreground">
              New to Docurama?{" "}
              <a href="/welcome" className="font-medium text-primary underline-offset-4 hover:underline">
                Create a free account
              </a>
            </p>
          )}

          {DEMO_MODE && view === "signin" && !challenge && (
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Demo accounts - one click to enter
              </p>
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword(acc.password);
                    setChallenge(null);
                    login.mutate({ email: acc.email, password: acc.password });
                  }}
                  className="w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary-soft/40 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="block text-sm font-medium">{acc.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{acc.desc}</span>
                  <span className="mt-2 block font-mono text-xs text-muted-foreground">{acc.email} · {acc.password}</span>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
