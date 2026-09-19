import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, Braces, KeyRound, ShieldCheck, Terminal, Webhook, Boxes,
} from "lucide-react";
import { BrandLogo, BRAND_LEGAL_NAME, BRAND_ADDRESS } from "@/components/brand/logo";
import { CodeTabs } from "@/components/marketing/code-tabs";
import { API_REFERENCE } from "@/lib/api-reference";
import { ScrollTop } from "@/components/marketing/scroll-top";

export const metadata: Metadata = {
  alternates: { canonical: "/developers" },
  title: "Developers · Docurama",
  description:
    "The Docurama API: envelopes, templates, public verification, signed webhooks and an MCP server, behind X-API-Key authentication. REST endpoints, code examples and the full reference.",
};

/**
 * The dedicated developers surface, split out of the marketing homepage.
 *
 * Everything documented here is live on this deployment: the endpoints are
 * read from the same catalogue that powers Settings → API and /docs, so the
 * page can never drift from what the product actually serves.
 */

const CAPABILITIES = [
  {
    icon: KeyRound,
    title: "API keys, done properly",
    body: "Keys are hashed at rest, scoped to the workspace, revocable in one click and shown exactly once at creation. Every request is rate-limited and audit-logged.",
  },
  {
    icon: Webhook,
    title: "Signed webhooks",
    body: "Subscribe to envelope.sent, envelope.viewed, envelope.completed and more. Payloads are signed with HMAC SHA-256 and delivered with retries and backoff.",
  },
  {
    icon: Braces,
    title: "MCP server for AI agents",
    body: "A JSON-RPC 2.0 endpoint at /api/mcp lets agents list envelopes, check status and trigger verification with the same API key. Expose your signing workflow to any MCP client.",
  },
  {
    icon: ShieldCheck,
    title: "Public verification endpoint",
    body: "GET /api/v1/verify/{code} returns the sealed document's status, digest and signers without authentication. Build trust pages of your own on top of it.",
  },
  {
    icon: Terminal,
    title: "No SDK required",
    body: "Plain REST with JSON bodies and standard headers. curl, fetch or requests are first-class clients. If your stack can make an HTTPS call, it can send an envelope.",
  },
  {
    icon: Boxes,
    title: "Templates over the API",
    body: "List templates, read their roles and fields, and send envelopes from them programmatically. The same objects the UI uses, nothing hidden.",
  },
];

export default function DevelopersPage() {
  const endpointCount = API_REFERENCE.reduce((n, g) => n + g.endpoints.length, 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandLogo size="sm" />
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link className="hover:text-foreground" href="/docs">Docs</Link>
            <Link className="hover:text-foreground" href="/status">Status</Link>
            <Link className="hover:text-foreground" href="/marketing">Product</Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Statement + code */}
        <section className="border-b">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-20">
            <div className="space-y-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">For developers</p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Built API-first</h1>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
                Envelopes, templates and verification are REST endpoints behind
                X-API-Key authentication. Everything the web app does, your
                code can do. The reference below documents the{" "}
                <span className="font-medium text-foreground">{endpointCount} live endpoints</span>{" "}
                on this deployment, not an aspirational list.
              </p>
              <ul className="flex flex-wrap gap-2" aria-label="Core endpoints">
                {["POST /api/v1/envelopes", "GET /api/v1/envelopes/{id}", "GET /api/v1/templates", "GET /api/v1/verify/{code}", "POST /api/mcp"].map((e) => (
                  <li key={e} className="rounded-md border bg-muted/60 px-2.5 py-1 font-mono text-[11px] text-muted-foreground">{e}</li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3 pt-1">
                <Link
                  href="/docs#api"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Read the API reference <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  href="/welcome"
                  className="inline-flex h-10 items-center rounded-lg border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Create an API key
                </Link>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                API access is included in Business and Enterprise plans. Keys
                are created under Settings, then API.
              </p>
            </div>
            <CodeTabs />
          </div>
        </section>

        {/* Capabilities */}
        <section className="border-b bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              The integration surface, without surprises
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Six pieces, each backed by a real mechanism rather than a
              marketing checkbox.
            </p>
            <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((c) => (
                <div key={c.title} className="space-y-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <c.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="text-sm font-semibold">{c.title}</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Endpoint catalogue summary */}
        <section className="border-b">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Every endpoint, grouped
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              The full reference with request and response bodies lives at{" "}
              <Link className="font-medium underline underline-offset-2 hover:text-foreground" href="/docs#api">docs.docurama.eu</Link>.
              This is the map.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {API_REFERENCE.map((g) => (
                <div key={g.name} className="rounded-xl border bg-card p-5">
                  <h3 className="text-sm font-semibold">{g.name}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{g.description}</p>
                  <ul className="mt-4 space-y-1.5">
                    {g.endpoints.map((ep) => (
                      <li key={`${ep.method} ${ep.path}`} className="flex items-center gap-2 font-mono text-[11px]">
                        <span className={ep.method === "POST" ? "font-bold text-primary" : "font-bold text-muted-foreground"}>{ep.method}</span>
                        <span className="truncate text-muted-foreground">{ep.path}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section>
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:py-20">
            <div>
              <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
                Your first API envelope is four lines away
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                Create a workspace, add an API key, send the curl example.
                Free for 14 days, no credit card required.
              </p>
            </div>
            <Link
              href="/welcome"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start free trial <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-muted/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-xs leading-relaxed text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>{BRAND_LEGAL_NAME}, {BRAND_ADDRESS}. All transactional mail is sent from notifications@docurama.eu.</p>
          <nav className="flex gap-4">
            <Link className="hover:text-foreground" href="/docs">Documentation</Link>
            <Link className="hover:text-foreground" href="/security">Security</Link>
            <Link className="hover:text-foreground" href="/status">Status</Link>
            <Link className="hover:text-foreground" href="/marketing">Product</Link>
          </nav>
        </div>
      </footer>

      <ScrollTop />
    </div>
  );
}
