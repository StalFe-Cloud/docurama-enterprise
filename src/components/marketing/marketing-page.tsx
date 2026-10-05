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
 * copy limited to implemented signing and evidence behavior. The developer section lives
 * on its own /developers page.
 */

import { useState } from "react";
import Link from "next/link";
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
import { CookieNotice } from "@/components/marketing/cookie-notice";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  PLAN_CATALOG, PLAN_ORDER, BILLING_TERMS, type BillingTerm,
  effectiveMonthlyEur, termTotalEur, termSavingsEur,
} from "@/lib/plans";

const NAV = [
  { href: "#product", labelKey: "nav.product", fallback: "Product" },
  { href: "#examples", labelKey: "nav.examples", fallback: "Examples" },
  { href: "#compliance", labelKey: "nav.compliance", fallback: "Assurance" },
  { href: "#pricing", labelKey: "nav.pricing", fallback: "Pricing" },
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
    title: "Completed documents and evidence",
    body: "Download a completed document and a separate completion record containing the captured signer values and frozen terms.",
  },
  {
    icon: Timer,
    title: "Recorded signing times",
    body: "Signing events and completion evidence record application times. Independent trusted timestamping is outside this release.",
  },
];

/** Capabilities listed below the bento as a quiet two-column cluster. */
const ALSO_INCLUDED = [
  { icon: BellRing, title: "Signing reminders", body: "Nudge the eligible pending signer by email, with the envelope and recipient state checked before dispatch." },
  { icon: MessageSquare, title: "Recipient notifications", body: "Signing invitations, waiting notices and final copies follow the recipient routing order." },
  {
    icon: ScrollText,
    title: "Templates & Legal Contracts",
    body: "Turn recurring agreements into templates, or review and adapt a contract starter before sending.",
    href: "/modeles-de-contrats",
    linkText: "Explore French legal templates →",
  },
  { icon: BadgeCheck, title: "Sending domains", body: "Use an authorized sender and SMTP relay; workspace sender overrides require a verified sending domain." },
];

const COMPLIANCE = [
  {
    icon: ShieldCheck,
    tag: "DATA CONTROLS",
    title: "Review the deployment data boundaries",
    points: [
      "Data location depends on the selected hosting and integrations; approve it before launch.",
      "Track data-access and other privacy requests; operators review and explicitly record completion.",
      "Record consent text and version for review alongside signing evidence.",
      "Assign a privacy contact, retention policy and request-handling process for the installation.",
    ],
  },
  {
    icon: FileCheck2,
    tag: "EMAIL-LINK SIGNING",
    title: "Know what the signing record contains",
    points: [
      "Personal signing links, explicit consent and typed-name signature adoption.",
      "Frozen contract terms and recipient-bound signature, initials, text, date and checkbox values.",
      "Private completed-document and completion-record downloads for authorized participants.",
      "Advanced/Qualified signatures, embedded PAdES and trusted timestamps are unavailable in this release.",
    ],
  },
  {
    icon: Lock,
    tag: "RELEASE ACCEPTANCE",
    title: "Qualify the selected installation",
    points: [
      "Check the displayed terms, recorded consent, signer values and final document before acceptance.",
      "Approve the email-link assurance scope for the intended documents.",
      "Verify the actual sender, relay and mailbox delivery with controlled test addresses.",
      "Part 11 enforcement requires separate implementation and applicable qualification.",
    ],
  },
];

const FAQS = [
  {
    q: "What's the difference between Solo and Starter?",
    a: "Solo includes one seat and 30 envelopes for €12/month. Starter includes three seats and 100 envelopes for €29/month. Both include 35 sending days and rollover; Business supports larger teams.",
  },
  {
    q: "Where is my data stored?",
    a: "Storage and processing locations depend on the approved hosting environment, storage service and integrations. Confirm those locations and the privacy terms for the selected installation before using customer documents.",
  },
  {
    q: "What signing assurance is supported?",
    a: "This release supports personal email-link access, explicit consent and typed-name signature adoption with completion evidence. It does not verify an official identity, provide Advanced/Qualified signatures, embed PAdES or obtain trusted RFC 3161 timestamps. Approve this scope for the intended document classes before launch.",
  },
  {
    q: "We're a regulated company. Can you support 21 CFR Part 11?",
    a: "Part 11 enforcement is unavailable in this release. Completion records and audit data can support a review, but they do not establish regulated-use qualification. A regulated deployment needs its own approved controls and acceptance evidence.",
  },
  {
    q: "Can we send from our own domain?",
    a: "Configure an authorized SMTP relay and sender address. A workspace sender override requires a currently verified sending domain. DNS verification does not configure the relay or guarantee inbox delivery; check delivery with controlled test addresses.",
  },
  {
    q: "Is there an API?",
    a: "Business and Enterprise plans include a REST API with X-API-Key authentication, envelope and template endpoints, a public verification endpoint and signed webhooks. An MCP server is also available for AI-agent integrations. See the API documentation at docs.docurama.eu.",
  },
  {
    q: "How do we exercise GDPR rights?",
    a: "Write to privacy@docurama.eu or use the DSAR tooling available to workspace administrators. Access, erasure, rectification and portability requests are tracked for operator review with due dates and explicit completion records.",
  },
];

export function MarketingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  // Promotional billing-term switch: monthly (no engagement) or a committed
  // 3/6/12-month term with an incremental discount. Drives every card price.
  const [termChoice, setTermChoice] = useState<BillingTerm>(BILLING_TERMS[0]);
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
            {/* Real links (asChild + Link), not onClick navigations: the CTAs
                keep working before hydration and for assistive tech, and the
                in-app transition stays client-side once hydrated. */}
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">{t("nav.signIn", "Sign in")}</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/welcome">{t("nav.startTrial", "Start free trial")}</Link>
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
              <Button variant="outline" className="flex-1" asChild>
                <Link href="/login">{t("nav.signIn", "Sign in")}</Link>
              </Button>
              <Button className="flex-1" asChild>
                <Link href="/welcome">{t("nav.startTrial", "Start free trial")}</Link>
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* Hero: centered statement over the live product movie */}
      <section id="top" className="border-b">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="text-center">
            <h1 className="hero-in mx-auto max-w-3xl text-4xl font-semibold leading-[1.06] tracking-tighter sm:text-5xl lg:text-6xl">
              {locale === "fr" ? (
                <>
                  Signez vos documents.<br />
                  <span className="text-primary">Conservez les preuves.</span>
                </>
              ) : (
                <>
                  Sign documents.<br />
                  <span className="text-primary">Record evidence.</span>
                </>
              )}
            </h1>
            <p className="hero-in mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg" style={{ animationDelay: ".08s" }}>
              {t("hero.subtitle", "Email-link signing with frozen contract terms, typed-name adoption and completion evidence built for review.")}
            </p>
            <div className="hero-in mt-7 flex flex-wrap justify-center gap-3" style={{ animationDelay: ".16s" }}>
              <Button size="lg" asChild>
                <Link href="/welcome">
                  {t("hero.startFree", "Start free trial")} <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/verify">{t("hero.verifyDoc", "Verify a document")}</Link>
              </Button>
            </div>
          </div>
          <figure className="relative mt-8 sm:mt-10 w-full">
            <div aria-hidden className="pointer-events-none absolute -inset-x-8 -top-8 bottom-0 rounded-[32px]" style={{ background: "radial-gradient(60% 55% at 50% 30%, rgba(15,122,90,.06), transparent 70%)" }} />
            <div className="relative w-full">
              <HeroDemo />
            </div>
            <figcaption className="mx-auto mt-4 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
              {t("hero.caption", "An illustrative workspace shows a mill certificate sent for signing, adopted by name and completed with an evidence record. Synthetic values demonstrate the flow.")}
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Trust strip: quiet, under the hero */}
      <section aria-label="Trust summary" className="border-b bg-muted/40">
        <p className="mx-auto max-w-6xl px-4 py-4 text-center text-xs leading-relaxed text-muted-foreground sm:px-6">
          {t("trust.summary", "Email-link signing, captured consent and private completion records. Hosting, delivery and assurance scope require acceptance for the selected installation.")}
        </p>
      </section>

      {/* Product bento: 2 live demos + 3 feature cells, asymmetric */}
      <section id="product" className="reveal border-b">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
            A complete evidence pipeline, not just a signature in a corner
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Capture the contract terms, recipient values and consent, then
            review the completed PDF and its separate completion record.
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
                  envelope in the workspace, shown with synthetic values.
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
                  {"href" in f && f.href && (
                    <a
                      href={f.href}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {("linkText" in f && f.linkText) || "Learn more →"}
                    </a>
                  )}
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
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Assurance</p>
          <h2 className="mt-3 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Evidence you can show an auditor
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Review the supported signing flow and the deployment decisions
            required for the documents your team intends to send.
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
            Three moves to a completed contract
          </h2>
          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <div className="space-y-4 rounded-xl border bg-card p-6 sm:p-8">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <PenTool className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="text-lg font-semibold tracking-tight">Prepare and send</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Upload a supported PDF or choose a template, add signers and
                set their routing order. Invitations use the configured sending
                identity or an authorized verified tenant domain.
              </p>
            </div>
            <div className="grid gap-6">
              <div className="space-y-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <FileSignature className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="text-lg font-semibold tracking-tight">Sign anywhere</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Signers review the contract, adopt a typed name and complete
                  the required fields. The displayed consent and version are
                  captured with the signing evidence.
                </p>
              </div>
              <div className="space-y-3 border-t pt-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <BadgeCheck className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="text-lg font-semibold tracking-tight">Complete and review</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Authorized participants can download the completed PDF and
                  a separate completion record. A public verification code
                  checks the recorded evidence without exposing the file.
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
            Monthly billing has no engagement — cancel anytime. Commit to a
            term and the discount grows: 3 months −5%, 6 months −10%, 12
            months −20%. Prices exclude VAT.
          </p>

          {/* Promotional billing-term switch */}
          <div className="mt-8">
            <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border bg-card p-1" role="tablist" aria-label="Billing term">
              {BILLING_TERMS.map((bt) => {
                const active = bt.months === termChoice.months;
                return (
                  <button
                    key={bt.months}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTermChoice(bt)}
                    className={cn(
                      "flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:text-sm",
                      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {bt.label}
                    {bt.discountPct > 0 && (
                      <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-emerald-100 text-emerald-800")}>
                        −{bt.discountPct}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 text-xs text-muted-foreground">
              {termChoice.months === 1
                ? "No engagement — pay monthly and cancel anytime."
                : `Committed ${termChoice.months}-month term: −${termChoice.discountPct}% off list price, billed once for the term.`}
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PLAN_ORDER.map((code) => (
              <PricingCard key={code} code={code} term={termChoice} />
            ))}
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            <strong className="font-semibold text-foreground">Choose the allowance your team needs</strong> —
            Solo includes 30 envelopes and one seat; Starter includes 100 envelopes and three seats.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Unused envelopes roll over to the next period on renewal (up to one
            monthly allowance) — a quiet month is never a lost month. Need more
            envelopes, self-hosting or on-premises deployment?{" "}
            <Link className="font-medium underline underline-offset-2" href="/enterprise">Talk to sales about Enterprise</Link>.
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
              Prepare a workspace for email-link signing and review the launch requirements.
              Free for 14 days, no credit card required.
            </p>
          </div>
          <div className="shrink-0">
            <Button size="lg" asChild>
              <Link href="/welcome">
                Start free trial <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
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
              {BRAND_LEGAL_NAME}<br />{BRAND_ADDRESS}<br />Deployment data location is operator-selected.
            </p>
          </div>
          <nav aria-label="Product">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Product</p>
            <ul className="space-y-2.5 text-sm">
              {[["Features", "#product"], ["Live examples", "#examples"], ["Assurance", "#compliance"], ["Pricing", "#pricing"], ["Contract templates", "/modeles-de-contrats"], ["Developers", "/developers"], ["Verify a document", "/verify"], ["Documentation", "/docs"], ["Blog", "/blog"], ["Create account", "/welcome"]].map(([l, h]) => (
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
              <li><a className="text-muted-foreground transition-colors hover:text-foreground" href="/terms">Terms of Service</a></li>
              <li><a className="text-muted-foreground transition-colors hover:text-foreground" href="/privacy">Privacy Policy</a></li>
              <li><a className="text-muted-foreground transition-colors hover:text-foreground" href="mailto:legal@docurama.eu">Data Processing Agreement (on request)</a></li>
              <li><a className="text-muted-foreground transition-colors hover:text-foreground" href="/privacy">Subprocessor list (Privacy Policy, §5)</a></li>
              <li><a className="text-muted-foreground transition-colors hover:text-foreground" href="/modeles-de-contrats">French legal templates</a></li>
              <li><a className="text-muted-foreground transition-colors hover:text-foreground" href="/security">Security policy</a></li>
              <li><a className="text-muted-foreground transition-colors hover:text-foreground" href="/status">Platform status</a></li>
              <li><a className="text-muted-foreground transition-colors hover:text-foreground" href="/.well-known/security.txt">security.txt</a></li>
            </ul>
          </nav>
        </div>
        <div className="border-t">
          <p className="mx-auto max-w-6xl px-4 py-5 text-[11px] leading-relaxed text-muted-foreground sm:px-6">
            © 2026 {BRAND_LEGAL_NAME}, {BRAND_ADDRESS}. All transactional mail
            uses the configured sending identity. This release supports
            email-link typed signing and completion records. It provides no
            Advanced/Qualified signing, embedded PAdES, trusted timestamps
            or Part 11 enforcement.
          </p>
        </div>
      </footer>

      <CookieNotice />
      <ScrollTop />
    </div>
  );
}

// ─── Pricing card ─────────────────────────────────────────────────────────────
//
// Deliberately no "most popular" highlight (cycle 10): instead of steering
// buyers to a badge, each card shows what the plan helps them achieve —
// outcome bullets plus a "best for" line — so customers self-select.

function PricingCard({ code, term }: { code: string; term: BillingTerm }) {
  const p = PLAN_CATALOG[code as keyof typeof PLAN_CATALOG];
  if (!p) return null;
  const monthly = effectiveMonthlyEur(p, term);
  const total = termTotalEur(p, term);
  const savings = termSavingsEur(p, term);
  const discounted = term.discountPct > 0;

  return (
    <div className="flex flex-col rounded-xl border bg-card p-6">
      {/* Fixed-height header keeps feature lists aligned across columns */}
      <div className="min-h-[128px]">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{p.name}</h3>
        <p className="mt-2 flex flex-wrap items-baseline gap-1.5">
          {discounted && (
            <span className="text-sm text-muted-foreground line-through" aria-hidden>€{p.monthlyEur.toFixed(2)}</span>
          )}
          <span className="text-3xl font-semibold tracking-tight">
            €{monthly.toFixed(2).replace(/\.00$/, "")}
          </span>
          <span className="text-sm text-muted-foreground">/mo</span>
        </p>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          {discounted
            ? `€${total.toFixed(2)} billed for ${term.months} months · save €${savings.toFixed(2)}`
            : "Billed monthly · no engagement"}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{p.bestFor}</p>
      </div>

      <ul className="mt-5 flex-1 space-y-2.5">
        {p.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs leading-relaxed">
            <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
            {f}
          </li>
        ))}
      </ul>

      {/* What this plan helps you achieve — replaces the "most popular" badge */}
      <div className="mt-5 rounded-lg bg-muted/60 p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          With {p.name} you&apos;ll
        </p>
        <ul className="mt-2 space-y-1.5">
          {p.outcomes.map((o) => (
            <li key={o} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              {o}
            </li>
          ))}
        </ul>
      </div>

      <Button className="mt-5 w-full" variant="outline" asChild>
        {p.code === "ENTERPRISE"
          ? <Link href="/enterprise">Talk to sales</Link>
          : <Link href={p.code === "SOLO" ? "/welcome?plan=SOLO" : "/welcome"}>Start free trial</Link>}
      </Button>
    </div>
  );
}
