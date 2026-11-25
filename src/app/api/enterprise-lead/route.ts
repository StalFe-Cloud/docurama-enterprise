import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/serializers";
import { queueMail } from "@/lib/onboarding";
import { checkBotGuard } from "@/lib/bot-guard";
import { foldForSearch } from "@/lib/search";

/**
 * POST /api/enterprise-lead — public Enterprise pipeline intake (cycle 10).
 *
 * Persists an EnterpriseLead row (triaged in the admin console, Enterprise
 * leads section) and queues a notification to sales@docurama.eu in the mail
 * outbox so nothing is lost while SMTP delivery is not wired. Rate-limit
 * honesty: a soft throttle rejects a repeat submission for the same email
 * within 10 minutes. Bot protection (go-live cycle): honeypot + time trap +
 * optional Cloudflare Turnstile — see src/lib/bot-guard.ts.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body");
  }

  // Bot guard: honeypot, time trap, optional Turnstile. Runs before any
  // validation or DB access.
  const guard = await checkBotGuard({
    website: String(body.website ?? ""),
    formStartedAt: Number(body.formStartedAt ?? 0),
    turnstileToken: String(body.turnstileToken ?? ""),
    ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim(),
  });
  if (!guard.ok) return jsonError(guard.error, guard.status);

  const company = String(body.company ?? "").trim();
  const contactName = String(body.contactName ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = String(body.phone ?? "").trim() || null;
  const requirements = String(body.requirements ?? "").trim().slice(0, 2000);
  const seats = Math.max(0, Math.min(100_000, Number(body.seats) || 0));
  // Seats arrive as a range label ("11-50") from the form: keep the raw label
  // in requirements context and store the numeric midpoint when parseable.
  const seatsRaw = String(body.seats ?? "").trim();
  const monthlyEnvelopes = Math.max(0, Math.min(1_000_000, Number(body.monthlyEnvelopes) || 0));

  if (!company || company.length > 120) return jsonError("Company name is required (max 120 characters)");
  if (!contactName || contactName.length > 80) return jsonError("Contact name is required (max 80 characters)");
  if (!EMAIL_RE.test(email) || email.length > 120) return jsonError("A valid work email is required");

  // Soft throttle: same email inside 10 minutes is treated as a duplicate.
  const recent = await db.enterpriseLead.findFirst({
    where: { email, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
  });
  if (recent) {
    return jsonError("Your request was already received — a solutions engineer will reply within one business day", 429);
  }

  const seatsNumeric = seats > 0 ? seats : parseSeatsLabel(seatsRaw);
  const lead = await db.enterpriseLead.create({
    data: {
      company, contactName, email, phone,
      companyLower: foldForSearch(company),
      contactNameLower: foldForSearch(contactName),
      seats: seatsNumeric,
      monthlyEnvelopes,
      requirements: seatsRaw && seatsNumeric === 0 ? `${requirements}\n(seats: ${seatsRaw})`.trim() : requirements,
      status: "NEW",
    },
  });

  await queueMail({
    to: "sales@docurama.eu",
    subject: `Enterprise lead: ${company} (${contactName})`,
    template: "ENTERPRISE_LEAD",
    body: [
      `New Enterprise lead from the /enterprise onboarding page.`,
      ``,
      `Company: ${company}`,
      `Contact: ${contactName} <${email}>${phone ? ` · ${phone}` : ""}`,
      `Seats: ${seatsRaw || seatsNumeric}`,
      `Monthly envelopes: ${monthlyEnvelopes || "not specified"}`,
      `Requirements: ${requirements || "not specified"}`,
      ``,
      `Triage in the admin console: Enterprise leads (id ${lead.id}).`,
      ``,
      `VOIRIA SASU (Docurama) - 1 Rue Marguerin, 75014 Paris, France`,
    ].join("\n"),
  });

  await recordAudit({
    actor: `Enterprise form (${email})`,
    actorRole: "ANONYMOUS",
    action: "enterprise.lead.created",
    resource: `lead:${lead.id}`,
    tenantName: company,
    detail: `Lead from /enterprise — ${seatsRaw || seatsNumeric} seats, ${monthlyEnvelopes || "?"} envelopes/month`,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined,
  });

  return jsonOk({ ok: true, message: "Request received — we'll reply within one business day" });
}

/** "11-50" → 31 (midpoint, rounded), "100+" → 100, "42" → 42. Zero when unparseable. */
function parseSeatsLabel(label: string): number {
  if (/^\d+$/.test(label)) return Number(label);
  const m = label.match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) return Math.round((Number(m[1]) + Number(m[2])) / 2);
  const plus = label.match(/^(\d+)\s*\+$/);
  if (plus) return Number(plus[1]);
  return 0;
}
