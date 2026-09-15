"use client";

/**
 * docurama.eu public marketing landing page.
 *
 * Served at `/` for unauthenticated visitors on the marketing domain (and at
 * `/marketing` for an always-available preview). The application itself lives
 * at app.docurama.eu. Sign in points to /login, the primary CTA to /welcome.
 *
 * Design rules applied (taste-skill): no em-dashes anywhere, one accent
 * (emerald), one signup CTA label across the page, live product demos only
 * (the hero movie, the bento table and verify demos, and the tabbed live
 * examples), asymmetric hero, bento grid with exact cell count and rhythm,
 * no "Step N" labels, eyebrows rationed to two, middle dots rationed,
 * honest copy ("aligned", never "certified"). The developer section lives
 * on its own /developers page.
 */

import { useState } from "react";
import {
  ArrowRight, BadgeCheck, BellRing, FileSignature, FileCheck2, Fingerprint,
  Lock, Menu, X, PenTool, ScrollText, ShieldCheck, Timer, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo, BRAND_LEGAL_NAME, BRAND_ADDRESS } from "@/components/brand/logo";
import { HeroDemo } from "@/components/marketing/hero-demo";
import { TableDemo } from "@/components/marketing/table-demo";
import { VerifyDemo } from "@/components/marketing/verify-demo";
import { LiveExamples } from "@/components/marketing/live-examples";
import { ScrollTop } from "@/components/marketing/scroll-top";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#product", labelKey: "nav.product", fallback: "Product" },
  { href: "#examples", labelKey: "nav.examples", fallback: "Examples" },
  { href: "#compliance", labelKey: "nav.compliance", fallback: "Compliance" },
  { href: "#pricing", labelKey: "nav.pricing", fallback: "Pricing" },
  { href: "/modeles-de-contrats", labelKey: "nav.templates", fallback: "Templates" },
  { href: "/docs", labelKey: "nav.docs", fallback: "Docs" },
  { href: "/developers", labelKey: "nav.developers", fallback: "Developers" },
  { href: "#faq", labelKey: "nav.faq", fallback: "FAQ" },
];

/** The bento: three feature cells plus two live product demos. */
const BENTO_FEATURES = [
  {
    icon: FileSignature,
    title: "Send and eSign",
    body: "Multi-signer envelopes with routing order, carbon copies and reminders. Signers never need an account.",
  },
  {
    icon: Fingerprint,
    title: "Certificates and sealing",
    body: "One-click RSA-2048 signing certificates per workspace. Seal with PAdES conformance from B-B to B-LTA.",
  },
  {
    icon: Timer,
    title: "RFC 3161 timestamps",
    body: "Every signature anchored to an independent Timestamp Authority. Presets for DigiCert, Sectigo, GlobalSign, or your own TSA.",
  },
];

/** Capabilities listed below the bento as a quiet two-column cluster. */
const ALSO_INCLUDED = [
  { icon: BellRing, title: "Smart reminders", body: "Manual nudges, per-envelope jobs or platform schedules with quiet hours and SMS escalation." },
  { icon: MessageSquare, title: "SMS and WhatsApp alerts", body: "Fourteen researched providers, from WhatsApp Cloud API's free tier to EU-hosted gateways." },
  { icon: ScrollText, title: "Templates", body: "Turn any repeatedly signed document into a template with usage tracking and folders." },
  { icon: BadgeCheck, title: "Sending domains", body: "Send from your own domain after live DNS verification over DNS-over-HTTPS." },
];

const COMPLIANCE = [
  {
    icon: ShieldCheck,
    tag: "GDPR",
    title: "European by design",
    points: [
      "EU data residency. Documents are processed and stored in the European Union.",
      "DSAR intake with access, erasure, rectification and portability workflows.",
      "Versioned consent records captured at signup (Art. 7 proof).",
      "DPO reachable at privacy@docurama.eu within statutory deadlines.",
    ],
  },
  {
    icon: FileCheck2,
    tag: "eIDAS",
    title: "Signature levels that mean something",
    points: [
      "Simple, Advanced and Qualified-aligned signing workflows.",
      "Cryptographic sealing with PAdES conformance levels (B-B to B-LTA).",
      "Per-tenant signing certificates with revocation and thumbprints.",
      "Honest conformance reporting. The level shown is the level applied.",
    ],
  },
  {
    icon: Lock,
    tag: "21 CFR Part 11",
    title: "Controls for regulated teams",
    points: [
      "§11.50 signature manifestation: printed name, date and meaning on every signature.",
      "§11.100 identity and consent records, versioned and audit-logged.",
      "Optional re-authentication before each signing action.",
      "Organization-wide Part 11 mode with policy enforcement.",
    ],
  },
];

const PLANS = [
  {
    code: "STARTER",
    name: "Starter",
    price: "€19",
    per: "/mo",
    blurb: "For small teams sending their first envelopes.",
    features: ["3 seats", "25 envelopes / month", "PAdES B-B sealing", "Email signing and public verify portal", "2 templates", "99.5% uptime SLA"],
    highlight: false,
  },
  {
    code: "BUSINESS",
    name: "Business",
    price: "€79",
    per: "/mo",
    blurb: "For growing operations that live in documents.",
    features: ["10 seats", "250 envelopes / month", "PAdES B-LT sealing", "SMS + WhatsApp delivery", "API access and webhooks", "DNS domain attestation", "Unlimited templates", "99.9% uptime SLA"],
    highlight: true,
  },
  {
    code: "ENTERPRISE",
    name: "Enterprise",
    price: "€349",
    per: "/mo",
    blurb: "For regulated teams with audit obligations.",
    features: ["100 seats", "5,000 envelopes / month", "PAdES B-LTA sealing", "BYO certificates and SSO/SAML", "21 CFR Part 11 mode", "Audit chain exports", "Custom retention and legal hold", "99.99% uptime SLA"],
    highlight: false,
  },
];

const FAQS = [
  {
    q: "Is Docurama an EU company, and where is my data?",
    a: "Docurama SAS is registered at 1 Rue Marguerin, 75014 Paris, France. Customer data is processed and stored in the European Union, with no transatlantic transfers of your documents.",
  },
  {
    q: "Are the signatures legally valid?",
    a: "Docurama implements eIDAS-aligned electronic signature workflows (Simple, Advanced, Qualified-aligned) with cryptographic sealing and RFC 3161 timestamps. For most B2B contracts across the EU, Simple and Advanced eSignatures are sufficient and fully enforceable. The signing level applied to each document is reported honestly in its evidence record.",
  },
  {
    q: "We're a regulated company. Can you support 21 CFR Part 11?",
    a: "Yes. Organizations can enable Part 11 mode, which enforces signature manifestation under §11.50 (printed name, date/time and meaning of signature), versioned signer-consent records under §11.100, optional re-authentication before signing, and audit events on every mutation.",
  },
  {
    q: "Can we send from our own domain?",
    a: "Yes. Add your domain in Settings, then Account, and Docurama verifies it over live DNS (TXT) before any mail is sent from it, protecting both deliverability and your brand.",
  },
  {
    q: "Is there an API?",
    a: "Business and Enterprise plans include a REST API with X-API-Key authentication, envelope and template endpoints, a public verification endpoint and signed webhooks. An MCP server is also available for AI-agent integrations. See the API documentation at docs.docurama.eu.",
  },
  {
    q: "How do we exercise GDPR rights?",
    a: "Write to privacy@docurama.eu or use the DSAR tooling available to workspace administrators. Access, erasure, rectification and portability requests are tracked with statutory due dates and completion records.",
  },
];

export function MarketingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { t, locale } = useI18n();

  return (
    <div className="min-h-screen bg-background">
      {/* Nav: one line, 64px, light */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main">
          <a href="#top" className="flex items-center gap-2" aria-label="Docurama home">
            <BrandLogo tagline size="sm" />
          </a>
          <div className="hidden items-center gap-6 md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                {t(n.labelKey, n.fallback)}
              </a>
            ))}
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <LanguageSwitcher />
            <Button variant="ghost" size="sm" onClick={() => { window.location.assign("/login"); }}>
              {t("nav.signIn", "Sign in")}
            </Button>
            <Button size="sm" onClick={() => { window.location.assign("/welcome"); }}>
              {t("nav.startTrial", "Start free trial")}
            </Button>
          </div>
          <button
            type="button" className="flex h-10 w-10 items-center justify-center rounded-lg border md:hidden"
            aria-expanded={menuOpen} aria-label="Toggle menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </nav>
        {menuOpen && (
          <div className="space-y-1 border-t bg-background p-4 md:hidden">
            <div className="flex justify-end pb-2 border-b">
              <LanguageSwitcher />
            </div>
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-muted">
                {t(n.labelKey, n.fallback)}
              </a>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { window.location.assign("/login"); }}>
                {t("nav.signIn", "Sign in")}
              </Button>
              <Button className="flex-1" onClick={() => { window.location.assign("/welcome"); }}>
                {t("nav.startTrial", "Start free trial")}
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* Hero: centered statement over the live product movie,
           filling exactly the first viewport fold */}
      <section id="top" className="hero-fold flex border-b">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10 sm:px-6 sm:py-12">
          <div className="text-center">
            <h1 className="hero-in mx-auto max-w-3xl text-4xl font-semibold leading-[1.06] tracking-tighter sm:text-5xl lg:text-6xl">
              {locale === "fr" ? (
                <>
                  Signez vos documents.<br />
                  <span className="text-primary">Prouvez l'essentiel.</span>
                </>
              ) : (
                <>
                  Sign documents.<br />
                  <span className="text-primary">Prove everything.</span>
                </>
              )}
            </h1>
            <p className="hero-in mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg" style={{ animationDelay: ".08s" }}>
              {t("hero.subtitle", "EU-built eSignatures with cryptographic evidence: X.509 sealing, RFC 3161 timestamps and an audit trail built for review.")}
            </p>
            <div className="hero-in mt-7 flex flex-wrap justify-center gap-3" style={{ animationDelay: ".16s" }}>
              <Button size="lg" onClick={() => { window.location.assign("/welcome"); }}>
                {t("hero.startFree", "Start free trial")} <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
              <Button size="lg" variant="outline" onClick={() => { window.location.assign("/verify"); }}>
                {t("hero.verifyDoc", "Verify a document")}
              </Button>
            </div>
          </div>
          <figure className="relative mt-7 flex min-h-0 flex-1 flex-col">
            <div aria-hidden className="pointer-events-none absolute -inset-x-8 -top-8 bottom-0 rounded-[32px]" style={{ background: "radial-gradient(60% 55% at 50% 30%, rgba(15,122,90,.06), transparent 70%)" }} />
            <div className="relative min-h-[300px] w-full flex-1">
              <HeroDemo />
            </div>
            <figcaption className="mx-auto mt-4 max-w-2xl shrink-0 text-center text-xs leading-relaxed text-muted-foreground">
              {t("hero.caption", "The StålFe demo workspace replayed end to end: a mill certificate goes to the foundry, is signed, sealed and proven with cryptographic evidence.")}
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Trust strip: quiet, under the hero */}
      <section aria-label="Trust summary" className="border-b bg-muted/40">
        <p className="mx-auto max-w-6xl px-4 py-4 text-center text-xs leading-relaxed text-muted-foreground sm:px-6">
          {t("trust.summary", "EU data residency. GDPR, eIDAS-aligned and 21 CFR Part 11 workflows. Public status at status.docurama.eu, platform security at security.docurama.eu.")}
        </p>
      </section>

      {/* Product bento: 2 live demos + 3 feature cells, asymmetric */}
      <section id="product" className="reveal border-b">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
            A complete evidence pipeline, not just a signature in a corner
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            From the first invitation email to the sealed archive, every step is
            recorded, hashed and reportable.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            {/* Documents table: live demo, large cell, spans two rows */}
            <figure className="md:col-span-2 lg:col-span-4 lg:row-span-2">
              <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card">
                <div className="min-h-0 flex-1 border-b">
                  <TableDemo />
                </div>
                <figcaption className="px-5 py-4 text-xs leading-relaxed text-muted-foreground">
                  Signer progress, status and the evidence digest for every
                  envelope in the workspace, replayed live.
                </figcaption>
              </div>
            </figure>

            {BENTO_FEATURES.slice(0, 2).map((f) => (
              <div key={f.title} className="rounded-xl border bg-card p-5 lg:col-span-2">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <f.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="text-sm font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}

            {/* Timestamps feature cell */}
            <div className="rounded-xl border bg-primary-soft/30 p-5 md:col-span-2 lg:col-span-2">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-card text-primary">
                <Timer className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="text-sm font-semibold">{BENTO_FEATURES[2].title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{BENTO_FEATURES[2].body}</p>
            </div>

            {/* Public verify portal: live demo, wide cell to close the grid */}
            <figure className="md:col-span-2 lg:col-span-4">
              <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card">
                <div className="min-h-0 flex-1 border-b">
                  <VerifyDemo />
                </div>
                <figcaption className="px-5 py-4 text-xs leading-relaxed text-muted-foreground">
                  Anyone can check a completed document's code on the public
                  portal. Proof without exposing the file.
                </figcaption>
              </div>
            </figure>
          </div>

          {/* Also included: quiet two-column cluster, no card chrome */}
          <div className="mt-12 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {ALSO_INCLUDED.map((f) => (
              <div key={f.title} className="flex gap-3.5">
                <f.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <div>
                  <h3 className="text-sm font-semibold">{f.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live examples: one product flow per document type */}
      <LiveExamples />

      {/* Compliance: three framework rows, tag and title left, points right */}
      <section id="compliance" className="reveal border-b bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Compliance</p>
          <h2 className="mt-3 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Evidence you can show an auditor
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Three frameworks, each backed by real mechanisms in the product
            rather than badges on a page.
          </p>

          <div className="mt-14 space-y-16">
            {COMPLIANCE.map((c) => (
              <div key={c.tag} className="grid gap-6 lg:grid-cols-12 lg:gap-12">
                <div className="lg:col-span-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <c.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="mt-4 inline-block rounded-md border bg-card px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-muted-foreground">
                    {c.tag}
                  </span>
                  <h3 className="mt-3 text-lg font-semibold tracking-tight">{c.title}</h3>
                </div>
                <ul className="grid gap-x-10 gap-y-4 self-center sm:grid-cols-2 lg:col-span-8">
                  {c.points.map((p) => (
                    <li key={p} className="text-sm leading-relaxed text-muted-foreground">{p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works: asymmetric 1 + 2, verb labels only */}
      <section className="reveal border-b">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Three moves to a sealed contract
          </h2>
          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <div className="space-y-4 rounded-xl border bg-card p-6 sm:p-8">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <PenTool className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="text-lg font-semibold tracking-tight">Prepare and send</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Upload your document, drop in signers, set routing and
                reminders. Invitations go out from notifications@docurama.eu
                or your own verified domain.
              </p>
            </div>
            <div className="grid gap-6">
              <div className="space-y-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <FileSignature className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="text-lg font-semibold tracking-tight">Sign anywhere</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Signers draw, type or upload a signature on any device.
                  Identity is captured, consent is versioned, and every action
                  lands in the event ledger.
                </p>
              </div>
              <div className="space-y-3 border-t pt-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <BadgeCheck className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="text-lg font-semibold tracking-tight">Seal and prove</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  On completion the document is sealed with your certificate,
                  timestamped via RFC 3161, and gets a public verification code
                  anyone can check.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="reveal border-b bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Simple, EU-priced plans
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Every plan starts with a 14-day trial, no credit card required.
            Prices exclude VAT.
          </p>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {PLANS.map((p) => (
              <div key={p.code} className={cn(
                "relative flex flex-col rounded-xl border p-6",
                p.highlight ? "border-primary bg-card shadow-lg shadow-primary/[0.07]" : "bg-card",
              )}>
                {p.highlight && (
                  <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold text-primary-foreground">
                    Most popular
                  </span>
                )}
                {/* Fixed-height header block keeps feature lists aligned across columns */}
                <div className="min-h-[104px]">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{p.name}</h3>
                  <p className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-semibold tracking-tight">{p.price}</span>
                    <span className="text-sm text-muted-foreground">{p.per}</span>
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{p.blurb}</p>
                </div>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs leading-relaxed">
                      <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button className="mt-6 w-full" variant={p.highlight ? "default" : "outline"}
                  onClick={() => {
                    if (p.code === "ENTERPRISE") window.location.assign("mailto:sales@docurama.eu");
                    else window.location.assign("/welcome");
                  }}>
                  {p.code === "ENTERPRISE" ? "Talk to sales" : "Start free trial"}
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Need more envelopes, self-hosting or on-premises deployment?{" "}
            <a className="font-medium underline underline-offset-2" href="mailto:sales@docurama.eu">Write to sales@docurama.eu</a>.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="reveal border-b bg-muted/40">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Frequently asked</h2>
          <div className="mt-8 space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-xl border bg-card px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
                  {f.q}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA: left-aligned */}
      <section className="reveal border-b">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:py-20">
          <div>
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Your next contract deserves better than a scanned PDF
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Set up a compliant eSignature workspace in about two minutes.
              Free for 14 days, no credit card required.
            </p>
          </div>
          <div className="shrink-0">
            <Button size="lg" onClick={() => { window.location.assign("/welcome"); }}>
              Start free trial <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-muted/40">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4">
            <BrandLogo tagline size="sm" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {BRAND_LEGAL_NAME}<br />{BRAND_ADDRESS}<br />EU data residency. Paris, France.
            </p>
          </div>
          <nav aria-label="Product">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Product</p>
            <ul className="space-y-2.5 text-sm">
              {[["Features", "#product"], ["Live examples", "#examples"], ["Compliance", "#compliance"], ["Pricing", "#pricing"], ["Developers", "/developers"], ["Verify a document", "/verify"], ["Documentation", "/docs"], ["Create account", "/welcome"]].map(([l, h]) => (
                <li key={l}><a className="text-muted-foreground transition-colors hover:text-foreground" href={h}>{l}</a></li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Contact">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Contact</p>
            <ul className="space-y-2.5 text-sm">
              {[["Support", "support@docurama.eu"], ["Sales and enterprise", "sales@docurama.eu"], ["Billing", "billing@docurama.eu"], ["Privacy and DPO", "privacy@docurama.eu"], ["Legal", "legal@docurama.eu"], ["Security disclosure", "security@docurama.eu"], ["Abuse report", "abuse@docurama.eu"], ["Postmaster", "postmaster@docurama.eu"]].map(([l, m]) => (
                <li key={m}><a className="text-muted-foreground transition-colors hover:text-foreground" href={`mailto:${m}`}>{l}</a></li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Legal and trust">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Legal and trust</p>
            <ul className="space-y-2.5 text-sm">
              <li><a className="text-muted-foreground transition-colors hover:text-foreground" href="/docs#legal">Terms of Service</a></li>
              <li><a className="text-muted-foreground transition-colors hover:text-foreground" href="/docs#legal">Privacy Policy</a></li>
              <li><a className="text-muted-foreground transition-colors hover:text-foreground" href="/docs#legal">Data Processing Agreement</a></li>
              <li><a className="text-muted-foreground transition-colors hover:text-foreground" href="/docs#legal">Subprocessor list</a></li>
              <li><a className="text-muted-foreground transition-colors hover:text-foreground" href="/security">Security policy</a></li>
              <li><a className="text-muted-foreground transition-colors hover:text-foreground" href="/status">Platform status</a></li>
              <li><a className="text-muted-foreground transition-colors hover:text-foreground" href="/.well-known/security.txt">security.txt</a></li>
            </ul>
          </nav>
        </div>
        <div className="border-t">
          <p className="mx-auto max-w-6xl px-4 py-5 text-[11px] leading-relaxed text-muted-foreground sm:px-6">
            © 2026 {BRAND_LEGAL_NAME}, {BRAND_ADDRESS}. All transactional mail
            is sent from notifications@docurama.eu. Docurama implements
            GDPR-, eIDAS- and 21 CFR Part 11-aligned workflows; it is not an
            accredited Qualified Trust Service Provider. For QES, pair
            Docurama with an EU QTSP.
          </p>
        </div>
      </footer>

      <ScrollTop />
    </div>
  );
}
