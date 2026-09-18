import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PublicSign, type SignPageState } from "@/components/marketing/public-sign";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign a document · Docurama",
  description:
    "Review and electronically sign a document shared with you via Docurama. The link is unique to you - no account needed.",
  robots: { index: false, follow: false }, // signing links are private to the recipient
};

/**
 * /sign/{token} — the public signer portal.
 *
 * The token is a 32-byte secret unique to one recipient of one envelope; it
 * authenticates the signer without an account. The page resolves the full
 * signing state server-side (invalid link, envelope state, turn order) and
 * hands a serializable snapshot to the client component, which drives the
 * adopt-signature / sign / decline flow against /api/sign/{token}.
 */
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const recipient = await db.recipient.findUnique({
    where: { accessToken: token },
    include: {
      envelope: {
        include: {
          recipients: { orderBy: { order: "asc" } },
          tenant: { select: { name: true } },
          template: { select: { bodyMarkdown: true, sourceNotes: true } },
          document: { select: { filename: true, pageCount: true, sha256: true } },
          createdBy: { select: { email: true } },
        },
      },
    },
  });

  let state: SignPageState;
  if (!recipient) {
    state = { phase: "invalid" };
  } else {
    const env = recipient.envelope;
    const signers = env.recipients.filter((r) => r.role === "SIGNER");
    const ahead = signers.find((r) => r.status === "PENDING" || r.status === "DELIVERED");

    // The attached document, when there is one — shown to signers as an
    // embedded page-by-page preview (they must see what they are signing).
    const document = env.document
      ? { filename: env.document.filename, pages: env.document.pageCount, sha256: env.document.sha256 }
      : null;

    if (["VOIDED", "DECLINED", "EXPIRED"].includes(env.status)) {
      state = {
        phase: "terminal", status: env.status,
        title: env.title, code: env.publicCode,
        voidReason: env.voidReason ?? null,
      };
    } else if (recipient.role === "CC") {
      state = {
        phase: "cc", title: env.title, code: env.publicCode,
        tenantName: env.tenant.name, recipientName: recipient.name,
      };
    } else if (recipient.status === "SIGNED") {
      state = {
        phase: "signed", title: env.title, code: env.publicCode,
        tenantName: env.tenant.name, recipientName: recipient.name,
        sealed: env.status === "COMPLETED",
        document: env.status === "COMPLETED" ? null : document,
      };
    } else if (env.status === "COMPLETED") {
      state = {
        phase: "completed", title: env.title, code: env.publicCode,
        tenantName: env.tenant.name,
      };
    } else if (ahead && ahead.id !== recipient.id) {
      state = {
        phase: "wait", title: env.title, code: env.publicCode,
        tenantName: env.tenant.name, aheadName: ahead.name,
        document,
      };
    } else {
      // Anti-phishing trust signal: when the sender's email domain is
      // DNS-TXT-verified for this workspace, the signer sees it next to the
      // sender identity. The lookup is cheap (indexed) and only shown when
      // it is actually true — never a generic “trusted sender” badge.
      const senderDomain = env.createdBy?.email?.split("@")?.[1]?.toLowerCase() ?? null;
      const verifiedDomain = senderDomain
        ? await db.domain.findFirst({
            where: { tenantId: env.tenantId, domain: senderDomain, purpose: "SENDING", status: "VERIFIED" },
            select: { domain: true },
          })
        : null;
      state = {
        phase: "active",
        title: env.title, code: env.publicCode,
        tenantName: env.tenant.name,
        message: env.message || null,
        pages: env.pages,
        senderName: env.tenant.name,
        senderDomainVerified: verifiedDomain?.domain ?? null,
        recipientName: recipient.name, recipientEmail: recipient.email,
        signers: signers.map((r) => ({ name: r.name, email: r.email, status: r.status, order: r.order })),
        bodyMarkdown: env.template?.bodyMarkdown || null,
        document,
      };
    }
  }

  return <PublicSign token={token} state={state} />;
}
