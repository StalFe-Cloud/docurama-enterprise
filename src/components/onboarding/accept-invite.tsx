"use client";

/**
 * /invite/[token] - invitation landing page.
 *
 * Public visitors see who invited them and to which organization. Accepting
 * requires the invited email: existing users sign in, new users create their
 * account through the signup step at /welcome?invite=<token> (the email is
 * pre-filled and locked to the invitation).
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Loader2, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, apiGet, apiPost } from "@/lib/client";
import { BrandLogo } from "@/components/brand/logo";
import { PortalProviders } from "@/components/portal/providers";

type InviteData = {
  status: string;
  org: { name: string; planCode?: string };
  email?: string;
  role?: string;
  invitedBy?: string;
  expiresAt?: string;
};

type MeData = { user: { email: string; name: string } | null };

/** The invitation token is the last path segment of /invite/<token>.
 *  Read lazily inside the query/mutation functions - no mount effect, no
 *  state, and hydration stays consistent. */
function inviteTokenFromUrl(): string {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/** Exported shell - wires React Query context around the page. */
export function AcceptInvite() {
  return (
    <PortalProviders>
      <InvitePageInner />
    </PortalProviders>
  );
}

function InvitePageInner() {
  const inviteQ = useQuery({
    queryKey: ["invite"],
    queryFn: () => apiGet<InviteData>(`/api/invitations/${inviteTokenFromUrl()}`),
    retry: false,
  });

  const meQ = useQuery({
    queryKey: ["session"],
    queryFn: () => apiGet<MeData>("/api/auth/me"),
  });

  const accept = useMutation({
    mutationFn: () => apiPost<{ message?: string }>(`/api/invitations/${inviteTokenFromUrl()}`, { op: "accept" }),
    onSuccess: (body) => {
      toast.success(body.message ?? "Invitation accepted");
      window.location.assign("/");
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  const invite = inviteQ.data;
  const me = meQ.data?.user ?? null;
  const emailMatches = me && invite?.email && me.email.toLowerCase() === invite.email.toLowerCase();
  const invalid = invite && invite.status !== "PENDING";

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-4 sm:px-6">
          <BrandLogo tagline size="sm" />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-lg">
          <CardContent className="space-y-6 p-6 sm:p-8">
            {inviteQ.isLoading || meQ.isLoading ? (
              <div className="flex items-center justify-center gap-3 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading your invitation…
              </div>
            ) : inviteQ.isError ? (
              <div className="space-y-4 text-center">
                <p className="text-lg font-semibold">Invitation not found</p>
                <p className="text-sm text-muted-foreground">
                  This link doesn&apos;t match any invitation - ask your colleague to send a new one from
                  Settings → Users.
                </p>
              </div>
            ) : invalid ? (
              <div className="space-y-4 text-center">
                <p className="text-lg font-semibold">This invitation is {invite.status.toLowerCase()}</p>
                <p className="text-sm text-muted-foreground">
                  Ask {invite.invitedBy ?? "the person who invited you"} to send a fresh invitation - it
                  only takes a click in Settings → Users.
                </p>
                <Button variant="outline" onClick={() => { window.location.assign("/"); }}>
                  Go to Docurama
                </Button>
              </div>
            ) : invite ? (
              <>
                <div className="space-y-1.5 text-center">
                  <h1 className="text-2xl font-semibold tracking-tight">Join {invite.org.name} on Docurama</h1>
                  <p className="text-sm text-muted-foreground">
                    {invite.invitedBy ?? "A teammate"} invited{" "}
                    <span className="font-medium text-foreground">{invite.email}</span> as{" "}
                    {invite.role === "ADMIN" ? "a workspace admin" : invite.role === "OWNER" ? "an owner" : "a member"}.
                  </p>
                </div>

                {emailMatches ? (
                  <div className="space-y-4">
                    <p className="flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary-soft/50 p-3 text-sm text-primary-deep">
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                      Signed in as {me?.email} - ready to accept
                    </p>
                    <Button className="w-full" onClick={() => accept.mutate()} disabled={accept.isPending}>
                      {accept.isPending ? (
                        <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Accepting…</>
                      ) : (
                        <><ArrowRight className="h-4 w-4" aria-hidden /> Accept invitation</>
                      )}
                    </Button>
                  </div>
                ) : me ? (
                  <div className="space-y-4 text-sm">
                    <p className="rounded-lg border bg-muted/60 p-3">
                      You&apos;re signed in as <span className="font-medium">{me.email}</span>, but this
                      invitation was sent to <span className="font-medium">{invite.email}</span>. Sign out and
                      back in with the invited address to accept it.
                    </p>
                    <Button variant="outline" className="w-full" onClick={() => { window.location.assign("/api/auth/logout"); }}>
                      <LogIn className="h-4 w-4" aria-hidden /> Sign out
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button onClick={() => { window.location.assign(`/welcome?invite=${inviteTokenFromUrl()}`); }}>
                      <UserPlus className="h-4 w-4" aria-hidden /> Create an account
                    </Button>
                    <Button variant="outline" onClick={() => { window.location.assign("/login"); }}>
                      <LogIn className="h-4 w-4" aria-hidden /> I have an account
                    </Button>
                  </div>
                )}

                <p className="text-xs leading-relaxed text-muted-foreground">
                  Docurama is a product of VOIRIA (VOIRIA SASU) - 1 Rue Marguerin, 75014 Paris, France · EU data residency ·
                  Questions? <a className="underline underline-offset-2" href="mailto:support@docurama.eu">support@docurama.eu</a>
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
