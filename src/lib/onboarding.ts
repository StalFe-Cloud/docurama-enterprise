import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { seatCapacity } from "@/lib/billing";

/**
 * Onboarding domain logic (Task 7) - shared by /api/auth/signup,
 * /api/onboarding, /api/invitations/[token] and the /welcome wizard.
 *
 * Honest-delivery note: the platform has no outbound SMTP transport wired
 * (PlatformSetting carries host/user metadata only - no credentials), so
 * transactional mail is recorded in the MailOutbox ledger with status QUEUED
 * instead of being silently dropped. The raw verification / invitation link
 * is stored on the outbox row so an operator can hand it over while the
 * transport is being provisioned. When platform SMTP credentials land, a
 * worker can flip QUEUED rows to SENT.
 */

export const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** True when a platform-level SMTP transport is configured. It is not yet -
 *  see note above. Drives the in-session "demo verify" shortcut visibility. */
export const SMTP_TRANSPORT_CONFIGURED = false;

export type OnboardingFlags = {
  skippedInvite?: boolean;
  skippedSecurity?: boolean;
  completedAt?: string;
};

export type OnboardingState = {
  authenticated: boolean;
  user: { id: string; email: string; name: string } | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  org: { id: string; name: string; slug: string; industry: string | null; companySize: string | null; planCode: string; enforceTwoFactor: boolean } | null;
  steps: {
    account: boolean;     // signed up / signed in
    verify: boolean;      // email verified
    org: boolean;         // organization named (not the signup default)
    signature: boolean;   // at least one stamp saved
    invites: boolean;     // invites sent or explicitly skipped
    security: boolean;    // 2FA enabled or explicitly skipped
  };
  flags: OnboardingFlags;
  completed: boolean;
  pendingInvites: number;
  inviteList: { id: string; email: string; role: string; createdAt: string }[];
  /** Seat occupancy (cycle 10): drives "invite your team to the remaining
   *  seats" guidance in the wizard and the users settings tab. */
  seats: { used: number; limit: number; remaining: number; members: number; pendingInvites: number };
  smtpTransportConfigured: boolean;
};

export const newVerificationToken = () => randomBytes(32).toString("hex");
export const newInvitationToken = () => `inv_${randomBytes(24).toString("hex")}`;

export async function getOnboardingFlags(userId: string): Promise<OnboardingFlags> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { onboardingJson: true } });
  if (!user?.onboardingJson) return {};
  try {
    return JSON.parse(user.onboardingJson) as OnboardingFlags;
  } catch {
    return {};
  }
}

export async function setOnboardingFlags(userId: string, flags: OnboardingFlags) {
  await db.user.update({ where: { id: userId }, data: { onboardingJson: JSON.stringify(flags) } });
}

const DEFAULT_ORG_NAMES = new Set(["", "my organization", "my company", "my workspace", "my team"]);

/** The org step is done once the tenant has a real name (not a signup default). */
function orgNamed(name: string): boolean {
  return !DEFAULT_ORG_NAMES.has(name.trim().toLowerCase());
}

export async function computeOnboardingState(userId: string): Promise<OnboardingState> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      memberships: { include: { tenant: true } },
      signatures: { select: { id: true } },
    },
  });
  if (!user) {
    return {
      authenticated: false, user: null, emailVerified: false, emailVerifiedAt: null, org: null,
      steps: { account: false, verify: false, org: false, signature: false, invites: false, security: false },
      flags: {}, completed: false, pendingInvites: 0, inviteList: [],
      seats: { used: 0, limit: 0, remaining: 0, members: 0, pendingInvites: 0 },
      smtpTransportConfigured: SMTP_TRANSPORT_CONFIGURED,
    };
  }

  const flags = await getOnboardingFlags(userId);
  const active = user.memberships.find((m) => m.tenantId === user.activeTenantId) ?? user.memberships[0];
  const tenant = active?.tenant ?? null;

  let pendingInvites = 0;
  let inviteList: { id: string; email: string; role: string; createdAt: string }[] = [];
  if (tenant) {
    const rows = await db.invitation.findMany({
      where: { tenantId: tenant.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    inviteList = rows.map((r) => ({ id: r.id, email: r.email, role: r.role, createdAt: r.createdAt.toISOString() }));
    pendingInvites = rows.length;
  }

  const emailVerified = Boolean(user.emailVerifiedAt);
  const hasSignature = user.signatures.length > 0;
  const orgDone = tenant ? orgNamed(tenant.name) : false;
  const invitesDone = flags.skippedInvite || pendingInvites > 0;
  const securityDone = user.totpEnabled || flags.skippedSecurity || false;
  const capacity = tenant ? await seatCapacity(tenant.id) : null;
  const seats = {
    used: capacity?.used ?? 0,
    limit: capacity?.seatLimit ?? 0,
    remaining: capacity?.remaining ?? 0,
    members: capacity?.members ?? 0,
    pendingInvites: capacity?.pendingInvites ?? 0,
  };

  return {
    authenticated: true,
    user: { id: user.id, email: user.email, name: `${user.firstName} ${user.lastName}`.trim() },
    emailVerified,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    org: tenant
      ? { id: tenant.id, name: tenant.name, slug: tenant.slug, industry: tenant.industry, companySize: tenant.companySize, planCode: tenant.planCode, enforceTwoFactor: tenant.enforceTwoFactor }
      : null,
    steps: {
      account: true,
      verify: emailVerified,
      org: orgDone,
      signature: hasSignature,
      invites: invitesDone,
      security: securityDone,
    },
    flags,
    completed: Boolean(flags.completedAt),
    pendingInvites,
    inviteList,
    seats,
    smtpTransportConfigured: SMTP_TRANSPORT_CONFIGURED,
  };
}

/** Queue a transactional email in the MailOutbox ledger. */
export async function queueMail(input: {
  to: string;
  subject: string;
  template: string;
  body: string;
  linkUrl?: string;
}) {
  return db.mailOutbox.create({
    data: {
      toEmail: input.to.toLowerCase(),
      subject: input.subject,
      template: input.template,
      bodyText: input.body,
      linkUrl: input.linkUrl ?? null,
      status: SMTP_TRANSPORT_CONFIGURED ? "SENT" : "QUEUED",
      sentAt: SMTP_TRANSPORT_CONFIGURED ? new Date() : null,
    },
  });
}

/** Create a fresh email-verification token for a user (invalidates older ones). */
export async function issueEmailVerification(userId: string, email: string, origin: string) {
  await db.emailVerification.updateMany({
    where: { userId, purpose: "SIGNUP", consumedAt: null },
    data: { consumedAt: new Date() },
  });
  const token = newVerificationToken();
  await db.emailVerification.create({
    data: {
      userId,
      email: email.toLowerCase(),
      tokenHash: sha(token),
      purpose: "SIGNUP",
      expiresAt: new Date(Date.now() + 24 * 3600_000),
    },
  });
  const link = `${origin}/welcome?verify=${token}`;
  await queueMail({
    to: email,
    subject: "Confirm your email - Docurama",
    template: "SIGNUP_VERIFICATION",
    body: [
      `Welcome to Docurama!`,
      ``,
      `Please confirm your email address to activate signing, certificates and API access for your workspace:`,
      ``,
      link,
      ``,
      `This link expires in 24 hours. If you didn't create a Docurama account, you can ignore this message.`,
      ``,
      `Docurama SAS - 1 Rue Marguerin, 75014 Paris, France`,
    ].join("\n"),
    linkUrl: link,
  });
  return token;
}

/** Consume a verification token. Returns the userId on success. */
export async function consumeVerificationToken(token: string): Promise<{ userId: string; email: string } | null> {
  const row = await db.emailVerification.findUnique({ where: { tokenHash: sha(token) } });
  if (!row || row.consumedAt || row.expiresAt < new Date()) return null;
  await db.emailVerification.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  await db.user.update({
    where: { id: row.userId },
    data: { emailVerifiedAt: new Date(), status: "ACTIVE" },
  });
  return { userId: row.userId, email: row.email };
}

/** Create an invitation for an email (or refresh an existing pending one). */
export async function createInvitation(input: {
  tenantId: string;
  email: string;
  role: string;
  invitedBy: string;
  invitedById: string;
  origin: string;
}) {
  const email = input.email.trim().toLowerCase();
  const existing = await db.invitation.findFirst({
    where: { tenantId: input.tenantId, email, status: "PENDING" },
  });
  if (existing) {
    // Refresh: rotate the token and extend the expiry.
    const token = newInvitationToken();
    await db.invitation.update({ where: { id: existing.id }, data: { token, role: input.role, expiresAt: new Date(Date.now() + 14 * 24 * 3600_000) } });
    await queueInvitationMail({ ...input, email, token, tenantName: await tenantName(input.tenantId) });
    return existing;
  }
  const token = newInvitationToken();
  const inv = await db.invitation.create({
    data: {
      tenantId: input.tenantId,
      email,
      role: input.role,
      token,
      invitedBy: input.invitedBy,
      invitedById: input.invitedById,
      expiresAt: new Date(Date.now() + 14 * 24 * 3600_000),
    },
  });
  await queueInvitationMail({ ...input, email, token, tenantName: await tenantName(input.tenantId) });
  return inv;
}

async function tenantName(tenantId: string) {
  const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return t?.name ?? "their workspace";
}

async function queueInvitationMail(input: { email: string; invitedBy: string; origin: string; token: string; tenantName: string }) {
  const link = `${input.origin}/invite/${input.token}`;
  await queueMail({
    to: input.email,
    subject: `${input.invitedBy} invited you to join ${input.tenantName} on Docurama`,
    template: "TEAM_INVITE",
    body: [
      `${input.invitedBy} has invited you to sign documents on Docurama as part of ${input.tenantName}.`,
      ``,
      `Accept the invitation and create your account here:`,
      ``,
      link,
      ``,
      `The invitation expires in 14 days. If you weren't expecting it, you can ignore this email.`,
      ``,
      `Docurama SAS - 1 Rue Marguerin, 75014 Paris, France`,
    ].join("\n"),
    linkUrl: link,
  });
}

/** Derive an absolute origin (protocol + host) from a request for links. */
export function requestOrigin(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || (req.url.startsWith("https:") ? "https" : "http");
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host") || "app.docurama.eu";
  return `${proto}://${host}`;
}

/** Unique tenant slug from an organization name. */
export function slugifyOrg(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";
  return `${base}-${randomBytes(3).toString("hex")}`;
}
