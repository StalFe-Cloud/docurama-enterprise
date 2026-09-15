import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo, BRAND_LEGAL_NAME, BRAND_ADDRESS } from "@/components/brand/logo";
import { ShieldCheck, Lock, FileCheck2, Timer, KeyRound, ScrollText, Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Docurama security",
  description:
    "How Docurama protects signed documents: disclosure policy, security.txt, platform security practices and responsible reporting for security@docurama.eu.",
};

const PRACTICES = [
  {
    icon: Lock,
    title: "Encryption in transit and at rest",
    body: "All traffic is served over TLS. API keys, TOTP secrets and recovery codes are stored as SHA-256 hashes, never in plaintext. Certificate passphrases are never persisted.",
  },
  {
    icon: KeyRound,
    title: "Strong authentication",
    body: "RFC 6238 two-factor authentication with one-time recovery codes, revocable server-side sessions bound to device and IP metadata, and organization-level 2FA enforcement.",
  },
  {
    icon: ScrollText,
    title: "Tamper-evident audit chain",
    body: "Every mutation writes an audit event. The chain can be sealed and its integrity re-verified, so deletions and edits leave traces.",
  },
  {
    icon: Timer,
    title: "Independent timestamps",
    body: "Signatures are anchored to RFC 3161 Timestamp Authorities. Timestamp evidence does not depend on our own infrastructure.",
  },
  {
    icon: FileCheck2,
    title: "EU data residency",
    body: "Documents and records are processed and stored in the European Union. Sub-processors are documented and reviewed.",
  },
  {
    icon: ShieldCheck,
    title: "Operational readiness",
    body: "Access reviews, risk registers, change management and restore drills are tracked inside the platform's own compliance tooling.",
  },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <BrandLogo size="sm" />
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link className="hover:text-foreground" href="/status">Status</Link>
            <Link className="hover:text-foreground" href="/docs">Documentation</Link>
            <Link className="hover:text-foreground" href="/marketing">Product</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Security</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Docurama is built for documents that carry legal weight. This page
          explains how to report a vulnerability, what we commit to when you do,
          and the controls the platform runs on.
        </p>

        {/* Reporting */}
        <section aria-label="Report a vulnerability" className="mt-10 rounded-xl border bg-card p-6">
          <h2 className="text-lg font-semibold tracking-tight">Report a vulnerability</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Email{" "}
            <a className="font-medium underline underline-offset-2" href="mailto:security@docurama.eu">security@docurama.eu</a>{" "}
            with details and reproduction steps. Our security.txt, including the
            PGP key we use for sensitive reports, is published at{" "}
            <a className="font-medium underline underline-offset-2" href="/.well-known/security.txt">/.well-known/security.txt</a>{" "}
            per RFC 9116.
          </p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-muted/50 p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">First response</dt>
              <dd className="mt-1 text-sm font-medium">Within 48 hours</dd>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Triage target</dt>
              <dd className="mt-1 text-sm font-medium">Severity assigned in 5 days</dd>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Safe harbor</dt>
              <dd className="mt-1 text-sm font-medium">Good-faith reports protected</dd>
            </div>
          </dl>
          <div className="mt-5 border-t pt-4 text-xs leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground">Scope. Web application, API and mail infrastructure on *.docurama.eu.</p>
            <p className="mt-1.5">
              Out of scope: volumetric denial of service, social engineering,
              physical attacks, spam, and automated scanner output without a
              demonstrated impact. Do not test against other tenants' data.
            </p>
          </div>
        </section>

        {/* Practices */}
        <section aria-label="Security practices" className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">How the platform is secured</h2>
          <div className="mt-6 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {PRACTICES.map((p) => (
              <div key={p.title} className="flex gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <p.icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{p.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Compliance posture */}
        <section aria-label="Compliance posture" className="mt-10 rounded-xl border bg-muted/40 p-6">
          <h2 className="text-lg font-semibold tracking-tight">Compliance posture, stated plainly</h2>
          <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
            <li>GDPR: EU data residency, DSAR workflows, versioned consent records, DPO at privacy@docurama.eu.</li>
            <li>eIDAS: Simple, Advanced and Qualified-aligned signature workflows with honest conformance reporting. Docurama is not an accredited QTSP.</li>
            <li>21 CFR Part 11: optional mode with signature manifestation, versioned consent and re-authentication controls.</li>
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Full legal documents, including the Data Processing Agreement and
            sub-processor list, are collected in{" "}
            <Link className="underline underline-offset-2" href="/docs/legal">Documentation, Legal</Link>.
          </p>
        </section>

        {/* Contact card */}
        <section aria-label="Security contacts" className="mt-10 flex flex-col gap-4 rounded-xl border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div>
              <p className="text-sm font-semibold">security@docurama.eu</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Monitored by the engineering team. For legal matters write to
                legal@docurama.eu, for privacy to privacy@docurama.eu.
              </p>
            </div>
          </div>
          <a
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            href="/.well-known/security.txt"
          >
            View security.txt <ShieldCheck className="h-4 w-4" aria-hidden />
          </a>
        </section>

        <footer className="mt-14 border-t pt-6 text-xs leading-relaxed text-muted-foreground">
          <p>{BRAND_LEGAL_NAME}. {BRAND_ADDRESS}.</p>
          <p className="mt-2">
            See also <Link className="underline underline-offset-2" href="/status">platform status</Link> and{" "}
            <Link className="underline underline-offset-2" href="/docs">product documentation</Link>.
          </p>
        </footer>
      </main>
    </div>
  );
}
