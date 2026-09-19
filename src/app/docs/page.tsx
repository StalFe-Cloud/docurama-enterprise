import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo, BRAND_LEGAL_NAME } from "@/components/brand/logo";
import { API_REFERENCE } from "@/lib/api-reference";
import { ScrollTop } from "@/components/marketing/scroll-top";
import { DocsSearch } from "@/components/docs/docs-search";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { getDocsNav } from "@/lib/docs";

export const metadata: Metadata = {
  alternates: { canonical: "/docs" },
  title: "Docurama documentation",
  description:
    "Guides and API reference for Docurama: sending envelopes, templates, verification, sending domains, notifications, the REST API, webhooks, MCP and compliance modes.",
};

const SECTIONS = [
  { id: "getting-started", label: "Getting started" },
  { id: "documents", label: "Documents and signing" },
  { id: "templates", label: "Templates" },
  { id: "verification", label: "Verification" },
  { id: "domains", label: "Sending domains" },
  { id: "notifications", label: "Reminders and notifications" },
  { id: "api", label: "API reference" },
  { id: "webhooks", label: "Webhooks" },
  { id: "mcp", label: "MCP server" },
  { id: "billing", label: "Billing and plans" },
  { id: "teams", label: "Teams and roles" },
  { id: "account", label: "Account and security" },
  { id: "self-hosting", label: "Self-hosting" },
  { id: "troubleshooting", label: "Troubleshooting" },
  { id: "tutorials", label: "Tutorials" },
  { id: "compliance", label: "Compliance modes" },
  { id: "legal", label: "Legal" },
];

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 text-xl font-semibold tracking-tight">
      {children}
    </h2>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded-lg border bg-foreground p-4 font-mono text-[12px] leading-relaxed text-background/85">
      <code>{children}</code>
    </pre>
  );
}

export default function DocsPage() {
  const nav = getDocsNav();
  const searchItems = nav.flatMap((group) =>
    group.items.map((item) => ({ ...item, group: group.name }))
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandLogo size="sm" />
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <DocsSearch items={searchItems} />
            <LanguageSwitcher />
            <Link className="hover:text-foreground" href="/docs/legal">Legal</Link>
            <Link className="hover:text-foreground" href="/status">Status</Link>
            <Link className="hover:text-foreground" href="/security">Security</Link>
            <Link className="hover:text-foreground" href="/marketing">Product</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[220px_1fr]">
        {/* Sidebar */}
        <aside className="hidden lg:block">
          <nav aria-label="Documentation" className="sticky top-24 space-y-1">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Guides</p>
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`}
                className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Mobile section jump */}
        <nav aria-label="Sections" className="flex flex-wrap gap-2 lg:hidden lg:col-span-2">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`}
              className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
              {s.label}
            </a>
          ))}
        </nav>

        <main className="min-w-0 space-y-16">
          <header>
            <h1 className="text-3xl font-semibold tracking-tight">Documentation</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Everything Docurama does, how to drive it from the UI and the API,
              and what the compliance controls actually enforce. The API
              reference below documents live endpoints on this deployment, not
              an aspirational list.
            </p>
          </header>

          {/* Getting started */}
          <section>
            <H2 id="getting-started">Getting started</H2>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground marker:font-semibold marker:text-foreground">
              <li><span className="font-medium text-foreground">Create your account</span> at app.docurama.eu/welcome. Signup opens a 14-day Starter trial and creates your organization workspace.</li>
              <li><span className="font-medium text-foreground">Verify your email.</span> A verification link is sent from notifications@docurama.eu. Until an SMTP transport is wired for your deployment, workspace admins can verify from the onboarding wizard with an audited action.</li>
              <li><span className="font-medium text-foreground">Name your organization</span> and pick an industry and size. This tunes your workspace defaults.</li>
              <li><span className="font-medium text-foreground">Add your signature</span> by drawing, typing or uploading. Signatures are stored per user and reused on every envelope.</li>
              <li><span className="font-medium text-foreground">Invite your team</span> with tokenized invitations by email. Invitations expire after 14 days and can be revoked.</li>
              <li><span className="font-medium text-foreground">Enable 2FA</span> under Settings, Profile. Organizations can enforce it for all members under Settings, Users.</li>
            </ol>
          </section>

          {/* Documents */}
          <section>
            <H2 id="documents">Documents and signing</H2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              An envelope wraps a document, its signers, routing order and the
              full event ledger. Open Documents and choose New envelope to set
              the title, pages, conformance level and recipients. Recipients
              can be signers or carbon-copy observers. Reminders can be sent
              manually or scheduled per envelope with quiet hours.
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Signers receive an email with a personal signing link. They can
              draw, type or upload a signature, no account needed. Every view,
              signature and seal lands in the envelope's audit timeline. On
              completion the document is sealed and given a public verification
              code.
            </p>
          </section>

          {/* Templates */}
          <section>
            <H2 id="templates">Templates</H2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Templates turn repeatedly signed documents into reusable starting
              points. Create one from the Templates page, organize by category
              or folder, and launch a new envelope pre-filled from it. Usage
              counters show how often each template has been sent, so you can
              retire stale paperwork.
            </p>
          </section>

          {/* Verification */}
          <section>
            <H2 id="verification">Verification</H2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Every sealed envelope carries a public code (format DOC-XXXXXXXX)
              and a SHA-256 digest. Anyone can check a code on the public
              verification portal without an account. The result states exactly
              what the evidence shows: VERIFIED, NOT_SEALED, VOIDED or
              NOT_FOUND. The digest can be recomputed from the sealed file at
              any time, independently of Docurama.
            </p>
          </section>

          {/* Domains */}
          <section>
            <H2 id="domains">Sending domains</H2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              By default, invitations are sent from notifications@docurama.eu.
              To send from your own domain, add it under Settings, Account.
              Docurama verifies ownership over live DNS (TXT record check via
              DNS-over-HTTPS) before any mail is sent. Your organization's
              sending identity protects both deliverability and brand.
            </p>
          </section>

          {/* Notifications */}
          <section>
            <H2 id="notifications">Reminders and notifications</H2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Reminders run in three modes: manual nudges from the documents
              list, per-envelope automatic schedules, and platform-wide jobs.
              All modes respect quiet hours and weekend settings, and can
              escalate to SMS after repeated silence. Signer alerts (sent,
              viewed, signed) are configured under Settings, Notifications,
              including a full SMTP override per organization.
            </p>
          </section>

          {/* Billing */}
          <section>
            <H2 id="billing">Billing and plans</H2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Five plans from €12 a month, one allowance rule: buy seats, never surprises.
              Solo and Starter share the same 50-envelope monthly allowance (the only
              difference is seats), unused envelopes roll over on renewal, and committed
              terms take 5–20% off. Checkout runs on Stripe where configured, or by bank
              transfer with admin approval on self-hosted instances.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              <li><Link className="text-primary underline underline-offset-4" href="/docs/billing/plans-and-allowances">Plans and allowances</Link></li>
              <li><Link className="text-primary underline underline-offset-4" href="/docs/billing/checkout-and-payments">Checkout and payment methods</Link></li>
              <li><Link className="text-primary underline underline-offset-4" href="/docs/billing/invoices-and-portal">Invoices and payment history</Link></li>
            </ul>
          </section>

          {/* Teams */}
          <section>
            <H2 id="teams">Teams and roles</H2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Workspaces have three roles — OWNER, ADMIN and MEMBER — and pending
              invitations hold a seat from the moment they are sent. Smart Team and above
              can organize members into small team groups (Sales, HR, Legal) so templates
              and envelope visibility follow your org chart.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              <li><Link className="text-primary underline underline-offset-4" href="/docs/teams/roles-and-invites">Roles, invites and seats</Link></li>
              <li><Link className="text-primary underline underline-offset-4" href="/docs/teams/team-groups">Team groups</Link></li>
            </ul>
          </section>

          {/* Account and security */}
          <section>
            <H2 id="account">Account and security</H2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              TOTP two-factor authentication with one-time recovery codes (enforceable
              organization-wide), revocable server-side sessions with a device list,
              password reset, and single sign-on: OIDC (Microsoft Entra ID, Google
              Workspace, Okta, Keycloak) and SAML 2.0, bound to your email domain with
              just-in-time provisioning.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              <li><Link className="text-primary underline underline-offset-4" href="/docs/account/two-factor-authentication">Two-factor authentication</Link></li>
              <li><Link className="text-primary underline underline-offset-4" href="/docs/account/sessions-and-devices">Sessions and devices</Link></li>
              <li><Link className="text-primary underline underline-offset-4" href="/docs/account/single-sign-on">Single sign-on (SSO)</Link></li>
              <li><Link className="text-primary underline underline-offset-4" href="/docs/account/password-and-recovery">Password and account recovery</Link></li>
            </ul>
          </section>

          {/* Self-hosting */}
          <section>
            <H2 id="self-hosting">Self-hosting</H2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Run Docurama on your own infrastructure: Docker Compose for a single host
              (with an optional SeaweedFS S3 profile) or Helm for Kubernetes. SQLite by
              default, PostgreSQL for multi-replica deployments, any S3-compatible object
              store, your SMTP relay — and signed attestations so counterparties can
              still verify your documents on a public portal.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              <li><Link className="text-primary underline underline-offset-4" href="/docs/self-hosting/deployment">Deploying Docurama</Link></li>
              <li><Link className="text-primary underline underline-offset-4" href="/docs/self-hosting/operations">Operating a self-hosted instance</Link></li>
            </ul>
          </section>

          {/* Troubleshooting */}
          <section>
            <H2 id="troubleshooting">Troubleshooting</H2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              The answers we give most often: missing signer emails, quota 402s,
              NOT_SEALED verification results, deliverability for custom sending
              domains, 2FA lockouts, and what the verification portal is actually
              checking.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              <li><Link className="text-primary underline underline-offset-4" href="/docs/troubleshooting/faq">FAQ and troubleshooting</Link></li>
            </ul>
          </section>

          {/* Tutorials */}
          <section>
            <H2 id="tutorials">Tutorials</H2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Step-by-step walkthroughs for the two moments that matter most: sending
              your very first envelope, and verifying a completed document as a
              third party. Each tutorial is a single sitting with exact UI paths.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm">
              <li><Link className="text-primary underline underline-offset-4" href="/docs/getting-started/tutorial-send-first-envelope">Tutorial: send your first envelope</Link></li>
              <li><Link className="text-primary underline underline-offset-4" href="/docs/getting-started/tutorial-verify-a-document">Tutorial: verify a signed document</Link></li>
            </ul>
          </section>

          {/* API */}
          <section>
            <H2 id="api">API reference</H2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Integration endpoints live under /api/v1 and authenticate with
              the X-API-Key header. Create keys under Settings, API. Keys are
              shown once and stored as SHA-256 hashes. The base URL is
              api.docurama.eu (this deployment also serves the same routes from
              app.docurama.eu).
            </p>
            <div className="mt-6 space-y-10">
              {API_REFERENCE.map((group) => (
                <div key={group.name}>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {group.name}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{group.description}</p>
                  <div className="mt-4 space-y-4">
                    {group.endpoints.map((ep) => (
                      <div key={ep.path + ep.method} className="rounded-xl border bg-card p-5">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="rounded-md bg-primary-soft px-2 py-0.5 font-mono text-[11px] font-bold text-primary-deep">
                            {ep.method}
                          </span>
                          <code className="font-mono text-[13px]">{ep.path}</code>
                          <span className="ml-auto rounded-full border px-2.5 py-0.5 text-[11px] text-muted-foreground">
                            {ep.auth === "api-key" ? "X-API-Key" : ep.auth === "session" ? "session" : ep.auth === "signature" ? "signed payload" : "public"}
                          </span>
                        </div>
                        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{ep.summary}</p>
                        {ep.params && (
                          <ul className="mt-3 space-y-1.5">
                            {ep.params.map((p) => (
                              <li key={p.name} className="text-xs text-muted-foreground">
                                <code className="font-mono text-foreground">{p.name}</code>{" "}
                                <span className="opacity-70">({p.type})</span> {p.description}
                              </li>
                            ))}
                          </ul>
                        )}
                        {ep.request && (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Request body</summary>
                            <Code>{ep.request}</Code>
                          </details>
                        )}
                        <details className="mt-1.5" open={!ep.request}>
                          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Response</summary>
                          <Code>{ep.response}</Code>
                        </details>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Webhooks */}
          <section>
            <H2 id="webhooks">Webhooks</H2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Business and Enterprise plans can register webhook endpoints
              under Settings, API. Deliveries are signed, retried with
              backoff, and viewable in a delivery log with status codes and
              response bodies. Events include envelope.sent,
              envelope.viewed, envelope.signed, envelope.completed,
              envelope.voided and envelope.declined. Test deliveries can be
              triggered from the settings screen.
            </p>
          </section>

          {/* MCP */}
          <section>
            <H2 id="mcp">MCP server</H2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              The same API surface is exposed as an MCP server (JSON-RPC 2.0)
              at /api/mcp for AI agents. It answers initialize, tools/list and
              tools/call. MCP access is enabled per organization and can be
              restricted to an allowlist of tools and a per-key rate limit,
              under Settings, MCP.
            </p>
          </section>

          {/* Compliance */}
          <section>
            <H2 id="compliance">Compliance modes</H2>
            <div className="mt-4 max-w-2xl space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Part 11 mode</span> enforces
                21 CFR Part 11 controls organization-wide: signature
                manifestation under §11.50, versioned signer consent under
                §11.100, and optional re-authentication before each signing
                action. Enable it under Settings, Account.
              </p>
              <p>
                <span className="font-medium text-foreground">eIDAS levels.</span> Envelopes
                declare their signature level (SES, AdES-aligned, QES-aligned).
                The level applied is the level reported in the evidence
                record. For Qualified Electronic Signatures, pair Docurama
                with an accredited EU QTSP.
              </p>
              <p>
                <span className="font-medium text-foreground">GDPR.</span> Data stays in the
                EU. DSAR requests (access, erasure, rectification,
                portability) are tracked with statutory deadlines. Consent
                records are captured and versioned at signup.
              </p>
            </div>
          </section>

          {/* Legal */}
          <section>
            <H2 id="legal">Legal & Compliance</H2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Docurama publishes its comprehensive governance pack online: consult our{" "}
              <Link className="font-semibold text-foreground underline underline-offset-2" href="/docs/legal">
                Legal & Compliance Center (/docs/legal)
              </Link>{" "}
              for the Information Security Policy (PSSI), GDPR policies, and eIDAS compliance statements.
              Explore our ready-to-sign{" "}
              <Link className="font-semibold text-foreground underline underline-offset-2" href="/modeles-de-contrats">
                French Legal Templates (/modeles-de-contrats)
              </Link>.
              Security disclosures follow our{" "}
              <Link className="underline underline-offset-2" href="/security">security policy</Link>.
            </p>
          </section>

          <footer className="border-t pt-6 text-xs leading-relaxed text-muted-foreground">
            <p>
              Questions or corrections? <a className="underline underline-offset-2" href="mailto:support@docurama.eu">support@docurama.eu</a>.
              See also <Link className="underline underline-offset-2" href="/status">platform status</Link>.
            </p>
            <p className="mt-2">© 2026 {BRAND_LEGAL_NAME}. docurama.eu documentation.</p>
          </footer>
        </main>
      </div>
      <ScrollTop />

    </div>
  );
}
