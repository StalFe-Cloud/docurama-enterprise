/**
 * Shared plan catalog — single source of truth for Docurama pricing.
 *
 * Consumed by:
 *  - the marketing pricing page (cards, promotional term switch, savings)
 *  - the workspace quota engine (envelope allowance incl. carry-forward)
 *  - the onboarding wizard (plan guides: guided instructions + demos)
 *  - prisma/seed.ts (Plan table mirror) and the admin console labels
 *
 * Pricing decisions (cycle 10 & strategic friction update):
 *  - SOLO: €12/mo entry point for solo founders and freelancers (1 seat, 30 envelopes/mo).
 *  - STARTER: €29/mo for collaborative teams (3 seats, 100 envelopes/mo, €9.67/seat).
 *    Strategic client friction: Solo is low-friction to start, but hard-caps at 1 seat
 *    and 30 envelopes, making the upgrade to Starter natural and compelling as business grows.
 *  - STARTER envelope allowance is 100, branded "35 sending days a month — weekends are on us".
 *  - Unused envelopes roll over to the next period on renewal, capped at one monthly allowance.
 *  - Billing terms: monthly (no engagement, cancel anytime) or a committed
 *    term with an incremental discount: 3 months −5%, 6 months −10%,
 *    12 months −20%. Discounts apply to the whole term, shown per month.
 *  - No "most popular" badge anywhere: every card instead carries an
 *    outcomes block ("with this plan you'll…") so buyers self-select by
 *    what they need to achieve.
 */

export type PlanCode = "SOLO" | "STARTER" | "BUSINESS" | "ENTERPRISE";

export interface PlanDef {
  code: PlanCode;
  name: string;
  monthlyEur: number;
  seatLimit: number;
  envelopeLimit: number; // per month/period
  storageGb: number;
  apiAccess: boolean;
  slaUptime: string;
  support: string;
  /** One-line "who is this for" shown under the plan name. */
  bestFor: string;
  /** Marketing feature bullets (card body). */
  features: string[];
  /** Outcome bullets: "with this plan you'll …" (replaces most-popular). */
  outcomes: string[];
  /** Seat marketing label, e.g. "1 seat" / "3 seats". */
  seatLabel: string;
}

export const PLAN_CATALOG: Record<PlanCode, PlanDef> = {
  SOLO: {
    code: "SOLO",
    name: "Solo",
    monthlyEur: 12,
    seatLimit: 1,
    envelopeLimit: 30,
    storageGb: 5,
    apiAccess: false,
    slaUptime: "99.5%",
    support: "Email support",
    bestFor: "Solo founders and freelancers who sign for themselves.",
    seatLabel: "1 seat",
    features: [
      "1 seat (just you — teammates can still sign as recipients)",
      "30 envelopes / month",
      "35 sending days a month — weekends are on us",
      "Unused envelopes roll over on renewal (up to 30)",
      "PAdES B-B sealing",
      "Email signing and public verify portal",
      "2 templates",
      "99.5% uptime SLA",
    ],
    outcomes: [
      "Sign client contracts yourself without paying for team seats you don't need",
      "Keep every unused envelope — a quiet month is never a lost month",
      "Look professional from day one: branded signing pages and a public verification code on every document",
    ],
  },
  STARTER: {
    code: "STARTER",
    name: "Starter",
    monthlyEur: 29,
    seatLimit: 3,
    envelopeLimit: 100,
    storageGb: 10,
    apiAccess: false,
    slaUptime: "99.5%",
    support: "Email support",
    bestFor: "Small teams sending their first envelopes together.",
    seatLabel: "3 seats",
    features: [
      "3 seats",
      "100 envelopes / month",
      "35 sending days a month — weekends are on us",
      "Unused envelopes roll over on renewal (up to 100)",
      "PAdES B-B sealing",
      "Email signing and public verify portal",
      "5 templates",
      "99.5% uptime SLA",
    ],
    outcomes: [
      "Get your first contracts signed this week, as a team",
      "Scale up seamlessly with 100 envelopes and rollover on renewal",
      "Give clients a verifiable, EU-compliant signing experience without IT help",
    ],
  },
  BUSINESS: {
    code: "BUSINESS",
    name: "Business",
    monthlyEur: 79,
    seatLimit: 10,
    envelopeLimit: 250,
    storageGb: 50,
    apiAccess: true,
    slaUptime: "99.9%",
    support: "Priority email support",
    bestFor: "Growing operations that live in documents.",
    seatLabel: "10 seats",
    features: [
      "10 seats",
      "250 envelopes / month (rollover on renewal, up to 250)",
      "PAdES B-LT sealing",
      "SMS + WhatsApp delivery",
      "API access and webhooks",
      "DNS domain attestation",
      "Unlimited templates",
      "99.9% uptime SLA",
    ],
    outcomes: [
      "Run your whole contract operation — sales, HR, procurement — in one place",
      "Automate signing into your own tools with the REST API and webhooks",
      "Send from your own verified domain so every invitation carries your brand",
    ],
  },
  ENTERPRISE: {
    code: "ENTERPRISE",
    name: "Enterprise",
    monthlyEur: 349,
    seatLimit: 100,
    envelopeLimit: 5000,
    storageGb: 500,
    apiAccess: true,
    slaUptime: "99.99%",
    support: "24/7 support + TAM",
    bestFor: "Regulated teams with audit obligations.",
    seatLabel: "100 seats",
    features: [
      "100 seats",
      "5,000 envelopes / month (rollover on renewal, up to 5,000)",
      "PAdES B-LTA sealing",
      "BYO certificates and SSO/SAML",
      "21 CFR Part 11 mode",
      "Audit chain exports",
      "Custom retention and legal hold",
      "99.99% uptime SLA",
    ],
    outcomes: [
      "Pass audits — every signature manifests who signed, when, and what it means",
      "Keep counsel happy with legal holds, retention policies and evidence packs",
      "Bring your own certificates and SSO, on EU infrastructure you can point a regulator at",
    ],
  },
};

export const PLAN_ORDER: PlanCode[] = ["SOLO", "STARTER", "BUSINESS", "ENTERPRISE"];

/** Plan codes a new signup can self-select on /welcome (ENTERPRISE goes through sales). */
export const SELF_SERVE_PLANS: PlanCode[] = ["SOLO", "STARTER"];

// ─── Billing terms (the promotional switch) ──────────────────────────────────

export interface BillingTerm {
  months: 1 | 3 | 6 | 12;
  /** Short label for the switch. */
  label: string;
  /** Incremental discount for the committed term (percentage points). */
  discountPct: 0 | 5 | 10 | 20;
  /** Marketing line under the switch. */
  note: string;
}

export const BILLING_TERMS: BillingTerm[] = [
  { months: 1, label: "Monthly", discountPct: 0, note: "No engagement — cancel anytime" },
  { months: 3, label: "3 months", discountPct: 5, note: "−5% for the term" },
  { months: 6, label: "6 months", discountPct: 10, note: "−10% for the term" },
  { months: 12, label: "12 months", discountPct: 20, note: "−20% for the term" },
];

export function termFor(months: number): BillingTerm {
  return BILLING_TERMS.find((t) => t.months === months) ?? BILLING_TERMS[0];
}

/** Effective per-month price of a plan under a billing term. */
export function effectiveMonthlyEur(plan: PlanDef, term: BillingTerm): number {
  return Math.round(plan.monthlyEur * (100 - term.discountPct)) / 100;
}

/** Total charged for the whole term (effective monthly × months). */
export function termTotalEur(plan: PlanDef, term: BillingTerm): number {
  return Math.round(effectiveMonthlyEur(plan, term) * term.months * 100) / 100;
}

/** Absolute saving vs. list price over the same duration, in EUR. */
export function termSavingsEur(plan: PlanDef, term: BillingTerm): number {
  return Math.round((plan.monthlyEur * term.months - termTotalEur(plan, term)) * 100) / 100;
}

/** Rollover cap: unused envelopes carry forward on renewal, capped at one monthly allowance. */
export function rolloverCap(plan: PlanDef): number {
  return plan.envelopeLimit;
}

// ─── Lookups for runtime quota/seat logic ────────────────────────────────────

export function planDef(code: string): PlanDef {
  return PLAN_CATALOG[code as PlanCode] ?? PLAN_CATALOG.STARTER;
}

/** Monthly envelope allowance codes used across the API surface. */
export const ENVELOPE_LIMITS: Record<string, number> = Object.fromEntries(
  PLAN_ORDER.map((c) => [c, PLAN_CATALOG[c].envelopeLimit]),
) as Record<string, number>;

// ─── Per-plan onboarding guides (guided instructions + demos) ────────────────

export interface PlanGuide {
  headline: string;
  /** Guided first steps, checked off against onboarding state. */
  steps: { label: string; href: string }[];
  /** Demo links — each plan points at a demo matched to its use case. */
  demos: { label: string; href: string; desc: string }[];
}

export const PLAN_GUIDES: Record<PlanCode, PlanGuide> = {
  SOLO: {
    headline: "You're on Solo — 1 seat, 30 envelopes, sized for one",
    steps: [
      { label: "Send your first envelope (Builder → upload a PDF or pick a template)", href: "/" },
      { label: "Watch a recipient sign: open the signing link and see the guided signer flow", href: "/#examples" },
      { label: "Verify a completed document on the public portal", href: "/verify" },
    ],
    demos: [
      { label: "Live example: signing an NDA", href: "/#examples", desc: "See the whole journey — open, sign, seal, verify — with sample data." },
      { label: "Contract template library", href: "/modeles-de-contrats", desc: "Start from a French-law template instead of a blank page." },
    ],
  },
  STARTER: {
    headline: "You're on Starter — 3 seats, 100 envelopes, weekends on us",
    steps: [
      { label: "Invite your teammates to the remaining seats (Settings → Users)", href: "/settings/users" },
      { label: "Send your first envelope together (Builder → upload a PDF or pick a template)", href: "/" },
      { label: "Verify a completed document on the public portal", href: "/verify" },
    ],
    demos: [
      { label: "Live example: signing an NDA", href: "/#examples", desc: "See the whole journey — open, sign, seal, verify — with sample data." },
      { label: "Contract template library", href: "/modeles-de-contrats", desc: "Start from a French-law template instead of a blank page." },
    ],
  },
  BUSINESS: {
    headline: "You're on Business — automation, your domain, SMS delivery",
    steps: [
      { label: "Connect your sending domain so invitations come from you (Settings → Account)", href: "/settings/account" },
      { label: "Create an API key and wire the envelope API into your stack (Settings → API)", href: "/settings/api" },
      { label: "Invite the team and organize members into small teams (Settings → Users)", href: "/settings/users" },
      { label: "Enable SMS/WhatsApp delivery for urgent signers (Settings → SMS)", href: "/settings/sms" },
    ],
    demos: [
      { label: "Developers: API + webhooks demo", href: "/developers", desc: "Envelope endpoints, signed webhooks and the MCP server, live." },
      { label: "Live example: a quotation approval flow", href: "/#examples", desc: "Multi-recipient business flow with routing and reminders." },
    ],
  },
  ENTERPRISE: {
    headline: "You're on Enterprise — audit-grade signing for regulated teams",
    steps: [
      { label: "Review the compliance hub: controls, retention, legal holds", href: "/settings" },
      { label: "Provision your signing certificate (Settings → eSign) or bring your own", href: "/settings/esign" },
      { label: "Enforce two-factor authentication organization-wide (Settings → Users)", href: "/settings/users" },
      { label: "Export an evidence pack from a completed envelope for your audit file", href: "/" },
    ],
    demos: [
      { label: "Security and transparency model", href: "/security", desc: "Key transparency, Rekor witnessing, evidence architecture." },
      { label: "Public verification portal", href: "/verify", desc: "What your auditors and counterparties can independently check." },
    ],
  },
};

export function planGuide(code: string): PlanGuide {
  return PLAN_GUIDES[code as PlanCode] ?? PLAN_GUIDES.STARTER;
}
