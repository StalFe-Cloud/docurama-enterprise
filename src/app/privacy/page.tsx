import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_LEGAL_NAME, BRAND_ADDRESS } from "@/components/brand/logo";

export const metadata: Metadata = {
  title: "Privacy Policy · Docurama",
  description:
    "How Docurama processes personal data: account data, documents and signing evidence, retention, EU data residency, subprocessors and your GDPR rights.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "18 September 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/marketing" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            ← Docurama
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/terms">Terms</Link>
            <Link className="text-muted-foreground transition-colors hover:text-foreground" href="/security">Security</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {UPDATED} · {BRAND_LEGAL_NAME}, {BRAND_ADDRESS}</p>

        <div className="mt-10 space-y-10 text-[15px] leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-lg font-semibold tracking-tight">1. Who is responsible</h2>
            <p className="mt-3">
              {BRAND_LEGAL_NAME} ({`"`}Docurama{`"`}, {`"`}we{`"`}), registered at {BRAND_ADDRESS}, France, is the
              data controller for the Docurama electronic signature platform. You can reach our Data
              Protection Officer at <a className="underline underline-offset-2" href="mailto:privacy@docurama.eu">privacy@docurama.eu</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">2. What we process and why</h2>
            <div className="mt-3 space-y-4">
              <div>
                <p className="font-medium">Account data</p>
                <p className="mt-1 text-muted-foreground">
                  Name, work email, a salted hash of your password, two-factor authentication state
                  (TOTP secrets and one-time recovery codes are stored as SHA-256 hashes, never in
                  plaintext), session records with IP address and browser signature, and onboarding
                  progress. Basis: performance of the contract (GDPR Art. 6(1)(b)) and security of our
                  systems (Art. 6(1)(f)).
                </p>
              </div>
              <div>
                <p className="font-medium">Organization profile</p>
                <p className="mt-1 text-muted-foreground">
                  Organization name, industry and company size when you choose to provide them, plus
                  billing contact email. Basis: contract performance (Art. 6(1)(b)).
                </p>
              </div>
              <div>
                <p className="font-medium">Documents and signing evidence</p>
                <p className="mt-1 text-muted-foreground">
                  Documents you upload or generate, envelope metadata, recipient names and email
                  addresses, signing events (sent, viewed, signed, declined), cryptographic digests and
                  timestamps. We process this to provide the signing service you subscribed to
                  (Art. 6(1)(b)) and to maintain tamper-evident audit trails that protect the integrity
                  of signed documents (Art. 6(1)(f)).
                </p>
              </div>
              <div>
                <p className="font-medium">Audit and security records</p>
                <p className="mt-1 text-muted-foreground">
                  Every significant action writes an audit event (actor, action, resource, time, IP).
                  Security events record sign-in attempts and blocked actions. Basis: legitimate
                  interest in security, fraud prevention and legal defence (Art. 6(1)(f)), and legal
                  obligations where applicable.
                </p>
              </div>
              <div>
                <p className="font-medium">Transactional email records</p>
                <p className="mt-1 text-muted-foreground">
                  A ledger of system emails (verification, invitations, signing links, reminders)
                  including recipient address and message content, kept as proof of dispatch.
                  Basis: contract performance (Art. 6(1)(b)).
                </p>
              </div>
              <div>
                <p className="font-medium">Consent records</p>
                <p className="mt-1 text-muted-foreground">
                  When you accept the Terms and this Policy at signup, we store a timestamped consent
                  record (GDPR Art. 7 requires us to be able to demonstrate consent).
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">3. Where your data lives</h2>
            <p className="mt-3">
              Customer data is processed and stored on infrastructure in the European Union. We do not
              transfer documents or signing evidence outside the EU, and we do not use analytics or
              advertising trackers on the platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">4. Cookies and local storage</h2>
            <p className="mt-3">
              Docurama uses only essential and functional storage. The session cookie
              (<code className="rounded bg-muted px-1.5 py-0.5 text-xs">docurama_session</code>) keeps
              you signed in (HttpOnly, Secure on HTTPS). A language preference cookie
              (<code className="rounded bg-muted px-1.5 py-0.5 text-xs">NEXT_LOCALE</code>) and a
              sidebar-state cookie remember your UI choices. The browser app stores the session token
              and UI preferences in local storage. There are no advertising, analytics or third-party
              tracking cookies, so no tracking consent is required.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">5. Subprocessors</h2>
            <p className="mt-3">
              Docurama runs on self-managed EU infrastructure. We do not currently engage third-party
              subprocessors for core document processing, storage or signing. If this changes, we will
              update this section and notify affected workspace owners before any transfer of data to a
              new subprocessor.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">6. Retention</h2>
            <p className="mt-3">
              Documents and their audit trails are kept for the life of the workspace under the
              retention policy configured by the organization, and are deleted when a workspace is
              deleted or a document is erased on request, except where a legal hold applies.
              Sessions expire after 7 days. Email verification tokens expire after 24 hours.
              Account data is deleted when the account is closed, subject to the same legal-hold
              exceptions and invoicing retention duties under French commercial law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">7. Your rights</h2>
            <p className="mt-3">
              You may request access, rectification, erasure, restriction or portability of your
              personal data, and object to processing based on legitimate interest. Write to{" "}
              <a className="underline underline-offset-2" href="mailto:privacy@docurama.eu">privacy@docurama.eu</a>{" "}
              or use the DSAR tooling available to workspace administrators. You may also lodge a
              complaint with the CNIL (cnil.fr), the French supervisory authority.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">8. Security measures</h2>
            <p className="mt-3">
              Passwords are salted and hashed; TOTP secrets and recovery codes are stored as SHA-256
              hashes; API keys are stored hashed and shown once. Traffic is served over TLS with
              strict transport security. Every mutation is recorded in a tamper-evident audit chain.
              See the <Link className="underline underline-offset-2" href="/security">security page</Link> for details.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">9. Changes</h2>
            <p className="mt-3">
              If we change this policy we will update the date above and notify workspace owners by
              email for material changes before they take effect.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
