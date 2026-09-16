"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Lock, Check, KeyRound, Loader2, ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLogo, BRAND_LEGAL_NAME, BRAND_ADDRESS } from "@/components/brand/logo";
import { setSessionToken } from "@/lib/client";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const t = searchParams.get("token") || "";
    setToken(t);
    if (!t) {
      setError("No reset token provided. Please use the link from your email.");
    }
  }, [searchParams]);

  const hasLength = password.length >= 10;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isValid = hasLength && hasLetter && hasNumber && passwordsMatch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || !token) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token, password }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Failed to reset password");
      }

      if (body.token) {
        setSessionToken(body.token);
      }

      setSuccess(true);
      toast.success("Password reset successfully!");
      setTimeout(() => {
        window.location.assign("/");
      }, 1500);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

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
            Account security under European standards.
          </h1>
          <p className="text-sm leading-relaxed text-white/70">
            Passwords are salted, hashed with cryptographic best practices, and stored solely within the European Union.
          </p>
          <ul className="space-y-2.5 text-sm text-white/80">
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              Single-use expiring reset tokens with automated session invalidation
            </li>
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              GDPR Article 32 state-of-the-art authentication protections
            </li>
          </ul>
        </div>
        <p className="relative text-xs text-white/40">
          © 2026 {BRAND_LEGAL_NAME} · {BRAND_ADDRESS} · EU data residency
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6">
        <main className="w-full max-w-md space-y-6">
          <div className="space-y-2 text-center lg:text-left">
            <div className="mb-6 flex justify-center lg:justify-start">
              <BrandLogo tagline size="md" className="lg:hidden" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Set a new password</h2>
            <p className="text-sm text-muted-foreground">
              Choose a strong password with at least 10 characters.
            </p>
          </div>

          {success ? (
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="space-y-4 p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                  <Check className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-medium text-foreground">Password updated</h3>
                <p className="text-sm text-muted-foreground">
                  Your password has been changed. Signing you in to your portal…
                </p>
                <Button className="w-full" onClick={() => window.location.assign("/")}>
                  Go to Workspace
                </Button>
              </CardContent>
            </Card>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rp-password">New password</Label>
                <Input
                  id="rp-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="h-11"
                  disabled={loading || !token}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rp-confirm">Confirm new password</Label>
                <Input
                  id="rp-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="h-11"
                  disabled={loading || !token}
                />
              </div>

              {/* Password criteria checklist */}
              <div className="rounded-lg border bg-card p-3.5 space-y-2 text-xs">
                <p className="font-medium text-muted-foreground">Password requirements:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li className={`flex items-center gap-2 ${hasLength ? "text-emerald-600 font-medium" : ""}`}>
                    <Check className={`h-3.5 w-3.5 ${hasLength ? "opacity-100" : "opacity-30"}`} />
                    At least 10 characters
                  </li>
                  <li className={`flex items-center gap-2 ${hasLetter ? "text-emerald-600 font-medium" : ""}`}>
                    <Check className={`h-3.5 w-3.5 ${hasLetter ? "opacity-100" : "opacity-30"}`} />
                    At least one letter
                  </li>
                  <li className={`flex items-center gap-2 ${hasNumber ? "text-emerald-600 font-medium" : ""}`}>
                    <Check className={`h-3.5 w-3.5 ${hasNumber ? "opacity-100" : "opacity-30"}`} />
                    At least one number
                  </li>
                  <li className={`flex items-center gap-2 ${passwordsMatch ? "text-emerald-600 font-medium" : ""}`}>
                    <Check className={`h-3.5 w-3.5 ${passwordsMatch ? "opacity-100" : "opacity-30"}`} />
                    Passwords match
                  </li>
                </ul>
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11"
                disabled={loading || !isValid || !token}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating password…
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" /> Reset password and sign in
                  </>
                )}
              </Button>

              <div className="text-center pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                </Link>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
