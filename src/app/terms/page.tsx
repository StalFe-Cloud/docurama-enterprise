import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_LEGAL_NAME, BRAND_ADDRESS } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Terms of Service · Docurama",
  description:
    "The Docurama terms of service: plans and billing, envelope allowances, signature levels, acceptable use, availability and governing law.",
  alternates: { canonical: "/terms" },
};

const UPDATED = "18 September 2026";

export default function TermsPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/marketing" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            ← Docurama
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/privacy">Privacy</Link>
            <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/security">Security</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {UPDATED} · {BRAND_LEGAL_NAME}, {BRAND_ADDRESS}</p>

        <div className="mt-10 space-y-10 text-[15px] leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-lg font-semibold tracking-tight">1. The service</h2>
            <p className="mt-3">
              Docurama is a document and electronic signature platform operated by {BRAND_LEGAL_NAME}.
              It lets organizations prepare documents, collect signatures through personal signing
              links, seal completed documents with cryptographic digests and timestamps, and produce
              evidence records and public verification. These terms govern your use of the platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">2. Signature levels, honestly stated</h2>
            <p className="mt-3">
              Docurama implements eIDAS-aligned electronic signature workflows. Depending on plan and
              configuration, documents are sealed at the PAdES B-B, B-T, B-LT or B-LTA conformance
              level, and the level actually applied is reported in each document&apos;s evidence record.
              Docurama is not a Qualified Trust Service Provider, does not issue qualified
              certificates, and does not provide qualified electronic signatures or seals. Whether a
              simple or advanced electronic signature is sufficient for a specific contract is a legal
              question that remains your responsibility; for most B2B contracts in the EU, simple and
              advanced signatures are sufficient and enforceable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">3. Accounts and workspaces</h2>
            <p className="mt-3">
              You must provide accurate information, keep your credentials confidential, and enable
              two-factor authentication where your organization requires it. Workspace owners are
              responsible for their members&apos; actions and for keeping invitations to people who are
              authorized to join the organization.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">4. Plans, billing and allowances</h2>
            <div className="mt-3 space-y-3">
              <p>
                Plans are billed monthly by default with no engagement: you can change or cancel at
                any time and the change takes effect at the end of the current period. If you prefer,
                you may commit to a 3-month (5% discount), 6-month (10%) or 12-month (15%) billing
                term; committed terms run to their end date.
              </p>
              <p>
                Each plan includes an envelope allowance per period. On the Solo and Starter plans a
                period is a 35-day month, so weekends are on us; on other plans a period is 30 days.
                Unused envelopes are carried into your next period, capped at one period&apos;s allowance.
                Allowances are per workspace and do not accumulate across plan changes or refunds.
              </p>
              <p>
                Every workspace starts with a free trial of the selected plan. Trials have the same
                functionality but expire automatically; no credit card is required to start.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">5. Acceptable use</h2>
            <p className="mt-3">
              You may not use Docurama to forge or misrepresent signatures, to sign documents you are
              not authorized to sign, to send spam or malware through signing invitations, to harass
              anyone, or in violation of applicable law. We may suspend workspaces that abuse the
              service, with notice where practicable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">6. Your documents</h2>
            <p className="mt-3">
              You keep all rights to the documents you upload or generate. We process them only to
              provide the service, as described in the{" "}
              <Link className="underline underline-offset-2" href="/privacy">Privacy Policy</Link>. Signing evidence
              (audit trails, digests, timestamps) is retained for the integrity of the signed record.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">7. Availability and support</h2>
            <p className="mt-3">
              We target the uptime published for each plan (99.5% on Solo and Starter, 99.9% on
              Business, 99.99% on Enterprise) and publish live status at status.docurama.eu. Planned
              maintenance is announced in advance. Support is available by email on all plans, with
              priority support on Business and 24/7 support on Enterprise.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">8. Liability</h2>
            <p className="mt-3">
              To the extent permitted by French law, Docurama&apos;s aggregate liability is limited to the
              fees you paid in the twelve months before the claim. We are not liable for indirect
              damages or for the legal sufficiency of signatures, which depends on the circumstances
              of each contract. Nothing in these terms excludes liability that cannot be excluded by
              law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">9. Termination</h2>
            <p className="mt-3">
              You may cancel at any time; the workspace remains available until the end of the paid
                period, after which documents can be exported on request before deletion. We may
              terminate for material breach after notice and a reasonable cure period.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">10. Governing law</h2>
            <p className="mt-3">
              These terms are governed by French law. Disputes fall under the courts of Paris, unless
              consumer law gives you a different forum. Questions about these terms can go to{" "}
              <a className="underline underline-offset-2" href="mailto:legal@docurama.eu">legal@docurama.eu</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
