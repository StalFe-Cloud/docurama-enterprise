import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, Building2, CheckCircle2, FileSearch, Handshake, KeyRound,
  Lock, Mail, PlayCircle, Server, ShieldCheck, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo, BRAND_LEGAL_NAME, BRAND_ADDRESS } from "@/components/brand/logo";
import { EnterpriseLeadForm } from "@/components/marketing/enterprise-lead-form";
import { PortalProviders } from "@/components/portal/providers";

export const metadata: Metadata = {
  title: "Enterprise onboarding - Docurama",
  description:
    "Audit-grade eSignature for regulated teams: SSO/SAML, BYO certificates, 21 CFR Part 11 mode, legal holds and self-hosting. Guided onboarding from first call to rollout.",
};

/**
 * /enterprise — Enterprise onboarding page (cycle 10).
 *
 * Replaces the bare mailto:sales@ CTA with a real pipeline: what Enterprise
 * includes, how the guided onboarding runs (call → pilot → security review →
 * rollout), and a lead form that lands in the admin console (Enterprise leads)
 * so nothing is lost in an inbox. Small-team structures inside the company
 * (e.g. a sales pod wanting its own group) are covered by team groups in the
 * workspace — no separate purchase needed.
 */

const STEPS = [
  {
    icon: Mail,
    title: "1 · Tell us about your signing world",
    body: "Send the form below (or write to sales@docurama.eu). Within one business day you get a reply from a solutions engineer — not a generic sequence — with questions that matter: volumes, regulated status, integrations, deadlines.",
  },
  {
    icon: PlayCircle,
    title: "2 · Guided pilot on your real contracts",
    body: "We open a pilot workspace seeded with your templates and, if useful, your sending domain. Your team sends real envelopes for 30 days; we review the evidence trail together every week and tune workflows, signing levels and reminders.",
  },
  {
    icon: FileSearch,
    title: "3 · Security and procurement review",
    body: "You get the documentation pack: data-processing agreement, subprocessor list, security posture, transparency-log architecture. We complete your security questionnaire and, for self-hosting candidates, walk through the Helm chart and SeaweedFS storage topology.",
  },
  {
    icon: ShieldCheck,
    title: "4 · Rollout with a named contact",
    body: "SSO/SAML enrollment, BYO certificate import, Part 11 mode, retention policies and small-team structures (Sales, HR, Legal groups inside one workspace) are configured with you. Post-rollout you keep a named technical contact and a 24/7 escalation path.",
  },
];

const INCLUDED = [
  { icon: Users, title: "100 seats, structured your way", body: "Organize members into small team groups inside the company workspace — Sales, HR, Legal — with per-team visibility of activity, without fragmenting billing or audit." },
  { icon: KeyRound, title: "SSO/SAML and BYO certificates", body: "Enroll your identity provider and import your own signing and sealing certificates, including qualified certificates from your QTSP." },
  { icon: Lock, title: "21 CFR Part 11 mode", body: "Signature manifestation (§11.50), signer-consent records (§11.100), optional re-authentication before signing, and audit events on every mutation." },
  { icon: FileSearch, title: "Audit chain exports and evidence packs", body: "Every envelope carries a court-ready evidence pack; export the full audit chain for any period your auditors ask about." },
  { icon: Server, title: "EU data residency, self-hosting option", body: "Production runs in the EU (Paris). Regulated about SaaS entirely? The Helm chart, Docker Compose and SeaweedFS S3 storage run the same stack in your own datacenter." },
  { icon: ShieldCheck, title: "Custom retention and legal hold", body: "Per-workspace retention policies and defensible legal holds, with restore drills documented in the compliance hub." },
];

export default function EnterprisePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main">
          <Link href="/" className="flex items-center gap-2" aria-label="Docurama home">
            <BrandLogo tagline size="sm" />
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">Back to docurama.eu</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/welcome">Start free trial</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="border-b">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Enterprise onboarding</p>
            <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Audit-grade signing for regulated teams, rolled out with you
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Enterprise is not a bigger bundle of the same plan — it is a
              guided rollout: a pilot on your real contracts, a security
              review your procurement team can close, and a workspace
              structured the way your company actually works (small team
              groups included). Fill in the form below and a solutions
              engineer replies within one business day.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <a href="#lead-form">Start the conversation <ArrowRight className="h-4 w-4" aria-hidden /></a>
              </Button>
              <Button variant="outline" asChild>
                <a href="mailto:sales@docurama.eu">Prefer email? sales@docurama.eu</a>
              </Button>
            </div>
          </div>
        </section>

        {/* How onboarding runs */}
        <section className="border-b bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How Enterprise onboarding runs</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Four steps, no surprise procurement gates. Typical time from
              first contact to production rollout: two to four weeks.
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {STEPS.map((s) => (
                <div key={s.title} className="rounded-xl border bg-card p-6">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <s.icon className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    <h3 className="text-sm font-semibold">{s.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What Enterprise includes */}
        <section className="border-b">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What Enterprise includes</h2>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {INCLUDED.map((f) => (
                <div key={f.title} className="rounded-xl border bg-card p-6">
                  <f.icon className="h-5 w-5 text-primary" aria-hidden />
                  <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              List price is €349/month for 100 seats and 5,000 envelopes;
              committed 3/6/12-month terms take −5/−10/−15%. Higher volumes,
              self-hosting and on-premises deployments are quoted per rollout —
              the form below captures what we need to price it.
            </p>
          </div>
        </section>

        {/* Lead form */}
        <section id="lead-form" className="border-b bg-muted/40">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-20">
            <div className="flex items-center gap-2.5">
              <Handshake className="h-5 w-5 text-primary" aria-hidden />
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Tell us about your signing world</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The form lands directly in our Enterprise pipeline — a solutions
              engineer triages it and replies within one business day. No
              mailing-list drip, no phone ambush.
            </p>
            {/* React Query context for the form's mutations (the marketing
                page itself is static; the provider makes the form SSR-safe). */}
            <PortalProviders>
              <EnterpriseLeadForm />
            </PortalProviders>
          </div>
        </section>

        {/* Small reassurance block */}
        <section className="border-b">
          <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
            <ul className="space-y-3">
              {[
                "Already a Business customer? Upgrades keep your envelopes, templates and audit history — nothing is migrated or lost.",
                "Just a small team inside a bigger company? You don't need Enterprise: any workspace supports small team groups, and Business covers most teams up to 10 seats.",
                "Evaluated by procurement? Everything on this page (DPA, subprocessors, security posture, transparency log) has a document behind it — ask.",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" aria-hidden /> {BRAND_LEGAL_NAME} · {BRAND_ADDRESS}
            </p>
            <div className="flex gap-4 text-sm">
              <Link className="text-muted-foreground hover:text-foreground" href="/docs">Documentation</Link>
              <Link className="text-muted-foreground hover:text-foreground" href="/security">Security</Link>
              <Link className="text-muted-foreground hover:text-foreground" href="/status">Status</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
