"""One-shot source migration. Refuses changed inputs; never touches deployed data."""
from pathlib import Path
import subprocess, hashlib
R = Path.cwd()
BASE = '92dc317b221fff6af92f910e365133f390f56f44'
BRANCH = 'quality-remediation-20260920'
def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()
if git('branch', '--show-current') != BRANCH:
    raise SystemExit('Only the isolated remediation branch is permitted')
if git('status', '--porcelain'):
    raise SystemExit('Working tree must be clean')
subprocess.run(['git', 'merge-base', '--is-ancestor', BASE, 'HEAD'], check=True)
paths = [
 'src/lib/auth.ts','src/lib/billing.ts','src/lib/payments.ts','src/lib/settings-handlers.ts',
 'src/lib/monthly-period.ts','src/lib/safe-webhook-http.ts','src/lib/worker-loop.ts',
 'src/lib/transaction.ts','src/lib/sso.ts','prisma/schema.prisma',
 'src/app/api/auth/login/route.ts','src/app/api/auth/signup/route.ts',
 'src/app/api/auth/reset-password/route.ts','src/app/api/auth/forgot-password/route.ts',
 'src/app/api/auth/verify-email/route.ts','src/app/api/auth/resend-verification/route.ts',
 'src/app/api/onboarding/route.ts','src/app/api/invitations/[token]/route.ts',
 'scripts/schema-for.mjs','scripts/test-entrypoint.sh','docker-entrypoint.sh',
 '.gitignore','.github/workflows/e2e.yml',
]
for p in paths:
    if git('rev-parse', BASE + ':' + p) != git('hash-object', p):
        raise SystemExit('Source changed; reconcile manually: ' + p)
changes = {}
def read(path):
    return changes.get(path, (R/path).read_text())
def replace(path, old, new, count=1):
    s=read(path)
    if s.count(old) != count:
        raise SystemExit('Unexpected source shape: '+path+' '+old[:70])
    changes[path]=s.replace(old,new)
def write(path, text):
    if (R/path).exists() and path not in paths:
        raise SystemExit('Refusing to overwrite unverified path: '+path)
    changes[path]=text
# Keep the exact released schema as the baseline, not an intermediate broken candidate.
s=read('prisma/schema.prisma')
s=s.replace('  attempts      Int       @default(0)\n  lastError     String?', '  attempts     Int       @default(0)\n  lastError    String?')
s=s.replace('  payload       String?\n  attempts      Int       @default(1)', '  payload      String?\n  attempts     Int       @default(1)')
s=s.replace('  claimToken    String?\n  claimUntil    DateTime?\n','').replace('  @@index([claimUntil])\n','')
a=s.index('\nmodel EnvelopeQuotaUsage {'); b=s.index('\n}',a)+3; s=s[:a]+s[b:]
s=s.replace('  id          String   @id @default(cuid())\n  at          DateTime @default(now())\n  actorUserId String?\n  tenantId    String?\n  actor       String', '  id         String   @id @default(cuid())\n  at         DateTime @default(now())\n  actor      String')
s=s.replace('  id          String   @id @default(cuid())\n  at          DateTime @default(now())\n  actorUserId String?\n  tenantId    String?\n  type        String', '  id       String   @id @default(cuid())\n  at       DateTime @default(now())\n  type     String')
b=s.encode(); blob=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
if blob!='c79ff956959ac6d06deb28b67f98819a7476de76': raise SystemExit('Release baseline mismatch')
write('prisma/baselines/release-20260920.prisma',s)
replace('prisma/schema.prisma','  carriedForwardEnvelopes Int @default(0)','''  carriedForwardEnvelopes Int @default(0)
  paymentAnchorAt  DateTime?
  usageAnchorAt    DateTime?
  usagePeriodStart DateTime?
  usagePeriodEnd   DateTime?''')
s=read('prisma/schema.prisma')
for model in ['AuditEvent','SecurityEvent']:
    a=s.index('model '+model+' {'); b=s.index('\n}',a)
    block=s[a:b].replace('  actorUserId String?', '  actorUserId String?\n  subjectUserId String?')
    block+='\n\n  @@index([actorUserId, at])\n  @@index([subjectUserId, at])\n  @@index([tenantId, at])'
    s=s[:a]+block+s[b:]
changes['prisma/schema.prisma']=s
replace('src/lib/auth.ts','import { db } from "@/lib/db";', 'import { db } from "@/lib/db";\nexport { hashPasswordAsync, verifyPasswordAsync } from "@/lib/password-async";')
replace('src/lib/auth.ts','  actorUserId?: string | null; tenantId?: string | null;', '  actorUserId?: string | null; subjectUserId?: string | null; tenantId?: string | null;')
replace('src/lib/auth.ts','      actorUserId: input.actorUserId ?? null, tenantId: input.tenantId ?? null,','      actorUserId: input.actorUserId ?? null, subjectUserId: input.subjectUserId ?? null, tenantId: input.tenantId ?? null,')
replace('src/lib/auth.ts','    request.headers.get("x-forwarded-proto") ??','    (process.env.DOCURAMA_TRUST_PROXY_HEADERS === "1" ? request.headers.get("x-forwarded-proto") : null) ??')
write('src/lib/request-metadata.ts','''import { isIP } from "node:net";
/** Enable only when ingress strips and replaces client-supplied forwarding headers. */
export function requestClientIp(request: Pick<Request, "headers">): string {
  if (process.env.DOCURAMA_TRUST_PROXY_HEADERS !== "1") return "unknown";
  const value = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
  return value && isIP(value) ? value : "unknown";
}
''')
write('src/lib/password-async.ts',r'''import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const COST = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 } as const;
const PREFIX = "scrypt$1$32768$8$3$";
const FORMAT = /^scrypt\$1\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{64})$/;
const LEGACY = /^[a-f0-9]{64}$/i;
type Gate = { active: number; waiters: Array<() => void> };
const root = globalThis as typeof globalThis & { __docuramaPasswordGate?: Gate };
const gate = root.__docuramaPasswordGate ??= { active: 0, waiters: [] };
async function withSlot<T>(work: () => Promise<T>): Promise<T> {
  if (gate.active >= 2) {
    if (gate.waiters.length >= 32) throw new Response(JSON.stringify({ error: "Authentication is busy; retry shortly" }),
      { status: 503, headers: { "content-type": "application/json", "retry-after": "2" } });
    await new Promise<void>((resolve) => gate.waiters.push(resolve));
  } else gate.active++;
  try { return await work(); }
  finally { const next = gate.waiters.shift(); if (next) next(); else gate.active--; }
}
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return withSlot(() => new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 32, COST, (error, key) => error ? reject(error) : resolve(key));
  }));
}
export async function hashPasswordAsync(password: string): Promise<string> {
  if (typeof password !== "string" || Buffer.byteLength(password) > 16 * 1024) {
    throw new Response(JSON.stringify({ error: "Password exceeds the supported byte limit" }), { status: 400 });
  }
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `${PREFIX}${salt.toString("hex")}$${key.toString("hex")}`;
}
export async function verifyPasswordAsync(password: string, stored: string): Promise<boolean> {
  if (typeof password !== "string" || typeof stored !== "string" || stored.length > 256 || Buffer.byteLength(password) > 16 * 1024) return false;
  if (LEGACY.test(stored)) return timingSafeEqual(createHash("sha256").update(password).digest(), Buffer.from(stored, "hex"));
  const parts = FORMAT.exec(stored);
  if (!parts) return false;
  const key = await derive(password, Buffer.from(parts[1], "hex"));
  return timingSafeEqual(key, Buffer.from(parts[2], "hex"));
}
''')
write('src/lib/settings-policy.ts','''import type { SessionUser } from "@/lib/auth";
type Policy = "personal" | "admin" | "certificate";
export const SETTINGS_POLICY: Readonly<Record<string, Policy>> = Object.freeze({
  "save-profile":"personal", "save-signature":"personal", "signature.add":"personal",
  "signature.delete":"personal", "signature.default":"personal", "org.switch":"personal",
  "org.create":"personal", "password.change":"personal", "session.revoke":"personal",
  "session.revoke-others":"personal", "2fa.start":"personal", "2fa.enable":"personal", "2fa.disable":"personal",
  "save-org":"admin", "enforce-2fa":"admin", "domain.add":"admin", "domain.posture":"admin",
  "domain.verify":"admin", "domain.delete":"admin", "member.role":"admin", "invite-member":"admin",
  "invite-revoke":"admin", "remove-member":"admin", "team.create":"admin", "team.rename":"admin",
  "team.delete":"admin", "member.team":"admin", "tsa.save":"admin", "tsa.test":"admin",
  "part11.save":"admin", "esign.save":"admin", "notifications.save":"admin", "smtp.test":"admin",
  "reminders.run":"admin", "envelope.auto-remind":"admin", "sms.save":"admin", "sms.test":"admin",
  "create-key":"admin", "revoke-key":"admin", "webhook.create":"admin", "webhook.delete":"admin",
  "webhook.toggle":"admin", "mcp.save":"admin", "cert.create":"certificate", "cert.provision":"certificate",
  "cert.activate":"certificate", "cert.revoke":"certificate", "cert.delete":"certificate",
});
export function isWorkspaceAdmin(me: SessionUser): boolean {
  return me.workspaceRole === "OWNER" || me.workspaceRole === "ADMIN" || me.role === "PLATFORM_ADMIN";
}
/** Certificate handlers must additionally authorize the target resource. */
export function settingsOperationAllowed(me: SessionUser, operation: string): boolean {
  if (!Object.hasOwn(SETTINGS_POLICY, operation)) return false;
  return SETTINGS_POLICY[operation] !== "admin" || isWorkspaceAdmin(me);
}
''')
s=read('src/lib/settings-handlers.ts');a=s.index('const adminRoles = ');b=s.index('// \u2500\u2500 Lazy',a)
s=s[:a]+'''const adminRoles = isWorkspaceAdmin;
function requireSettingsPermission(me: SessionUser, op: string): Response | null {
  return settingsOperationAllowed(me, op) ? null : jsonError("Operation is not permitted", 403);
}

'''+s[b:]
s=s.replace('import net from "net";\n','').replace('import { hashPassword, verifyPassword, recordAudit } from "@/lib/auth";', '''import { hashPasswordAsync, verifyPasswordAsync, recordAudit } from "@/lib/auth";
import { requestClientIp } from "@/lib/request-metadata";
import { isWorkspaceAdmin, settingsOperationAllowed } from "@/lib/settings-policy";
import { smtpMode } from "@/lib/mail";''')
s=s.replace('where: { actorUserId: me.id },','where: { OR: [{ actorUserId: me.id }, { subjectUserId: me.id }] },')
s=s.replace('  const actor = `${me.firstName} ${me.lastName}`;','''  const actor = `${me.firstName} ${me.lastName}`;
  const ip = requestClientIp(req);
  const audit = (input: Parameters<typeof recordAudit>[0]) => recordAudit({
    ...input, actorUserId: me.id, tenantId: input.tenantId ?? me.tenantId, ip,
  });''')
a=s.index('  const denied = ');s=s[:a]+s[a:].replace('recordAudit({','audit({')
s=s.replace('if (!verifyPassword(current, user.passwordHash))','if (!(await verifyPasswordAsync(current, user.passwordHash)))')
s=s.replace('passwordHash: hashPassword(next)', 'passwordHash: await hashPasswordAsync(next)')
s=s.replace('if (!verifyPassword(String(data.password ?? ""), user.passwordHash))','if (!(await verifyPasswordAsync(String(data.password ?? ""), user.passwordHash)))')
s=s.replace('ip: "10.42.0.7"','ip, actorUserId: me.id, subjectUserId: me.id, tenantId')
s=s.replace('tenantName: tenant?.name, detail: `Active organization','tenantId: targetId, tenantName: tenant?.name, detail: `Active organization')
s=s.replace('    const days = Math.min(1095, Math.max(30, Number(data.days ?? 365)));','''    if (purpose === "sealing" && !adminRoles(me)) return jsonError("Workspace administrator access required", 403);
    const days = Math.min(1095, Math.max(30, Number(data.days ?? 365)));
    if (!Number.isFinite(days)) return jsonError("Invalid certificate lifetime");''')
s=s.replace('    if (!cert) return jsonError("Certificate not found", 404);','''    if (!cert) return jsonError("Certificate not found", 404);
    if (cert.purpose === "sealing" && !adminRoles(me)) return jsonError("Workspace administrator access required for sealing certificates", 403);''')
a=s.index('  if (op === "smtp.test") {');b=s.index('  if (op === "reminders.run")',a)
s=s[:a]+'''  if (op === "smtp.test") {
    const mode = smtpMode();
    await ensureNotificationSettings(tenantId);
    await db.notificationSettings.update({ where: { tenantId }, data: {
      smtpLastTestAt: new Date(), smtpLastTestStatus: "CONFIGURATION_ONLY",
    } });
    return jsonOk({ ok: true, configurationOnly: true, delivered: false,
      transportConfigured: mode.configured,
      message: "No test message sent. Delivery uses operator SMTP_URL; per-workspace SMTP fields are stored but inactive.",
    });
  }

'''+s[b:]
a=s.index('  if (op === "sms.test") {');b=s.index('  if (op === "create-key")',a)
s=s[:a]+r'''  if (op === "sms.test") {
    const gateway = await db.smsGateway.findUnique({ where: { tenantId } });
    if (!gateway || !(gateway.apiKey || gateway.whatsappApiKey)) return jsonError("Save gateway credentials first");
    const to = String(data.to ?? "").trim();
    if (!/^\+?[1-9]\d{6,14}$/.test(to.replace(/[\s-]/g, ""))) return jsonError("Enter an international phone number");
    await db.smsGateway.update({ where: { tenantId }, data: {
      lastTestAt: new Date(), lastTestStatus: "CONFIGURATION_ONLY", lastTestTo: to, status: "configured",
    } });
    return jsonOk({ ok: true, configurationOnly: true, delivered: false,
      message: "Configuration saved. No SMS or WhatsApp message was sent; delivery has not been verified.",
    });
  }

'''+s[b:]
s=s.replace('        settings: {\n          smtpHost:','        settings: {\n          smtpOverrideActive: false, transportSource: "SMTP_URL",\n          smtpHost:')
s=s.replace('"Notification settings saved - including the reminder policy"','"Notification settings saved. SMTP overrides are inactive; delivery uses operator SMTP_URL."')
changes['src/lib/settings-handlers.ts']=s
for path in ['src/app/api/auth/login/route.ts','src/app/api/auth/signup/route.ts','src/app/api/auth/reset-password/route.ts']:
    s=read(path).replace('hashPassword','hashPasswordAsync').replace('verifyPassword','verifyPasswordAsync')
    if path.endswith('login/route.ts'):
        s=s.replace('!verifyPasswordAsync(password, user.passwordHash)','!(await verifyPasswordAsync(password, user.passwordHash))')
        s=s.replace('passwordHash: hashPasswordAsync(password)','passwordHash: await hashPasswordAsync(password)')
    elif path.endswith('signup/route.ts'):
        anchor='  const created = await db.$transaction(async (tx) => {'
        if anchor not in s: raise SystemExit('Unexpected signup transaction')
        s=s.replace(anchor,'  const passwordHash = await hashPasswordAsync(password);\n'+anchor)
        s=s.replace('passwordHash: hashPasswordAsync(password)','passwordHash')
    else:
        s=s.replace('const newPasswordHash = hashPasswordAsync(password)','const newPasswordHash = await hashPasswordAsync(password)')
    s='import { requestClientIp } from "@/lib/request-metadata";\n'+s
    s=s.replace('req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1"','requestClientIp(req)')
    s=s.replace('ip: "198.51.100.7"','ip: requestClientIp(req), actorUserId: user?.id ?? null')
    s=s.replace('ip: "10.42.0.7"','ip: requestClientIp(req), actorUserId: user.id')
    identity='actorUserId: record.userId, subjectUserId: record.userId, tenantId: record.user.activeTenantId,' if path.endswith('reset-password/route.ts') else 'actorUserId: user.id, subjectUserId: user.id, tenantId: user.activeTenantId,'
    s=s.replace('await recordAudit({','await recordAudit({ '+identity)
    if path.endswith('signup/route.ts'): s=s.replace('type: "SIGNUP",','type: "SIGNUP", actorUserId: user.id, subjectUserId: user.id, tenantId: user.activeTenantId,')
    s=s.replace('export async function POST(req: NextRequest)','async function handlePost(req: NextRequest)',1)
    s+='''\nexport async function POST(req: NextRequest) {
  try { return await handlePost(req); }
  catch (error) {
    if (error instanceof Response) return error;
    console.error("[auth] request failed", error);
    return jsonError("Authentication request failed", 500);
  }
}
'''
    changes[path]=s
for path,var,tenant in [
 ('src/app/api/onboarding/route.ts','me','me.tenantId'),
 ('src/app/api/invitations/[token]/route.ts','me','inv.tenantId'),
 ('src/app/api/auth/verify-email/route.ts','user','user.activeTenantId'),
 ('src/app/api/auth/resend-verification/route.ts','user','user.activeTenantId'),
]:
    changes[path]=read(path).replace('recordAudit({',f'recordAudit({{ actorUserId: {var}.id, tenantId: {tenant},')
s=read('src/app/api/auth/forgot-password/route.ts').replace('recordAudit({','recordAudit({ subjectUserId: user.id, tenantId: user.activeTenantId,')
s=s.replace('actor: `${user.firstName} ${user.lastName}`,','actor: "Password reset requester",').replace('actorRole: user.role,','actorRole: "ANONYMOUS",')
changes['src/app/api/auth/forgot-password/route.ts']=s
replace('src/lib/sso.ts','await tx.auditEvent.create({\n    data: {','await tx.auditEvent.create({\n    data: { actorUserId: user.id, subjectUserId: user.id, tenantId: connection.tenantId,')
replace('src/lib/transaction.ts','["P2034", "P2002", "P1008", "P2028"]','["P2034", "P2002"]')
replace('src/lib/safe-webhook-http.ts','  const url = new URL(raw);\n  if (url.username','  signal.throwIfAborted();\n  const url = new URL(raw);\n  if (url.username')
replace('src/lib/safe-webhook-http.ts','  if (!addresses.length || (!internal','  signal.throwIfAborted();\n  if (!addresses.length || (!internal')
replace('src/lib/safe-webhook-http.ts','family: target.family, autoSelectFamily: false,','family: target.family,')
replace('src/lib/monthly-period.ts','''  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));''','''  if (!Number.isFinite(result.getTime())) throw new RangeError("Monthly boundary is outside the Date range");
  const monthEnd = new Date(result);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  if (!Number.isFinite(monthEnd.getTime())) throw new RangeError("Monthly boundary is outside the Date range");
  result.setUTCDate(Math.min(anchor.getUTCDate(), monthEnd.getUTCDate()));''')
replace('src/lib/monthly-period.ts','''  if (!subscription) return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  if (subscription.usageAnchorAt) return new Date(subscription.usageAnchorAt);''','''  if (!Number.isFinite(now.getTime())) throw new Error("Invalid metering time");
  if (!subscription) {
    const start = new Date(now);
    start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
    return start;
  }
  if (subscription.usageAnchorAt) {
    const anchor = new Date(subscription.usageAnchorAt);
    if (!Number.isFinite(anchor.getTime())) throw new Error("Invalid metering anchor");
    return anchor;
  }''')
replace('src/lib/monthly-period.ts','export function periodKey(now = new Date()): string {\n  return','export function periodKey(now = new Date()): string {\n  if (!Number.isFinite(now.getTime())) throw new Error("Invalid metering time");\n  return')
write('src/lib/worker-loop.ts','''/** One awaited chain, including startup and asynchronous error reporting. */
export function startWorkerLoop(
  tick: () => Promise<void>,
  options: { initialDelayMs: number; intervalMs: number; onError?: (error: unknown) => void | Promise<void> },
): () => void {
  const { initialDelayMs, intervalMs } = options;
  if (!Number.isSafeInteger(initialDelayMs) || initialDelayMs < 0 || initialDelayMs > 2_147_483_647) throw new RangeError("Invalid worker initial delay");
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0 || intervalMs > 2_147_483_647) throw new RangeError("Invalid worker interval");
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (delay: number) => {
    if (stopped) return;
    timer = setTimeout(() => { void run(); }, delay);
    timer.unref?.();
  };
  const run = async () => {
    if (stopped) return;
    try { await tick(); }
    catch (error) {
      try { if (options.onError) await options.onError(error); else console.warn("[worker] pass failed", error); }
      catch (reportError) { try { console.warn("[worker] error reporter failed", reportError); } catch { /* Best effort. */ } }
    } finally { schedule(intervalMs); }
  };
  schedule(initialDelayMs);
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
''')
s=read('src/lib/billing.ts')
s=s.replace('const initialAt = new Date(Math.min(now.getTime(), sub.renewalAt.getTime() - 1));','const initialAt = new Date(Math.min(now.getTime(), anchor.getTime()));')
s=s.replace('''      let count = 1;
      let renewalAt = shiftUtcMonth(sub.renewalAt, term);''','''      const paymentAnchor = sub.paymentAnchorAt ?? shiftUtcMonth(sub.renewalAt, -term);
      let count = 1;
      let renewalAt = shiftUtcMonth(paymentAnchor, term);''')
s=s.replace('renewalAt = shiftUtcMonth(sub.renewalAt, term * count);','renewalAt = shiftUtcMonth(paymentAnchor, term * count);')
s=s.replace('data: { renewalAt, lastInvoiceAt: now },','data: { renewalAt, paymentAnchorAt: paymentAnchor, lastInvoiceAt: now },')
changes['src/lib/billing.ts']=s
s=read('src/lib/payments.ts').replace('import { ENVELOPE_LIMITS, planDef, termFor, rolloverCap }','import { planDef, termFor }')
s=s.replace('import { periodStart } from "@/lib/billing";','import { monthlyWindow, shiftUtcMonth, usageAnchor } from "@/lib/monthly-period";\nimport { serializableTransaction } from "@/lib/transaction";')
s=s.replace('''  const renewalAt = new Date();
  renewalAt.setMonth(renewalAt.getMonth() + term.months);''','''  const now = new Date();
  const renewalAt = shiftUtcMonth(now, term.months);''',1)
s=s.replace('return db.$transaction(async (tx) => {','return serializableTransaction(async (tx) => {').replace('await db.$transaction(async (tx) => {','await serializableTransaction(async (tx) => {')
needle='    const sub = await tx.subscription.upsert({'
if s.count(needle)!=1: raise SystemExit('Unexpected subscription upsert')
s=s.replace(needle,'''    const usage = monthlyWindow(existing ? { ...existing, usageAnchorAt: usageAnchor(existing, now) } : { renewalAt: paidUntil, termMonths: term.months, usageAnchorAt: now }, now);
    const metering = existing
      ? { usageAnchorAt: existing.usageAnchorAt ?? usage.anchor }
      : { usageAnchorAt: usage.anchor, usagePeriodStart: usage.start, usagePeriodEnd: usage.end };
    const sub = await tx.subscription.upsert({''')
a=s.index(needle);b=s.index('    await tx.auditEvent.create',a)
block=s[a:b].replace('      update: {','      update: {\n        ...metering, paymentAnchorAt: now,',1).replace('      create: {','      create: {\n        ...metering, paymentAnchorAt: now,',1)
s=s[:a]+block+s[b:]
a=s.index('    // Rollover for the period that just closed.');b=s.index('    const renewalAt = advances ?',a)
s=s[:a]+'''    // Payment receipts never award monthly rollover; the usage engine does it once.
    const plan = planDef(sub.planCode);
    const anchor = usageAnchor(sub);

'''+s[b:]
s=s.replace('data: { renewalAt, carriedForwardEnvelopes: carriedForward, status:','data: { renewalAt, usageAnchorAt: sub.usageAnchorAt ?? anchor, status:')
s=s.replace('''          `Stripe renewal ${invoiceRef}: used ${usedInPeriod}/${allowance} envelopes in the closed period; ` +
          `${carriedForward} carried forward (cap ${rolloverCap(plan)}).`,''','''          `Stripe invoice ${invoiceRef} recorded. Paid-through ${renewalAt.toISOString()}; monthly rollover remains independent.`,''')
s=s.replace('tenantName: tenant.name,','tenantId: tenant.id, tenantName: tenant.name,').replace('tenantName: sub.tenant.name,','tenantId: sub.tenantId, tenantName: sub.tenant.name,')
changes['src/lib/payments.ts']=s
replace('scripts/schema-for.mjs','readFileSync, writeFileSync','readFileSync, writeFileSync, mkdirSync')
replace('scripts/schema-for.mjs','writeFileSync(outPath, out);','''writeFileSync(outPath, out);
mkdirSync(join(root, "prisma", target), { recursive: true });
writeFileSync(join(root, "prisma", target, "schema.prisma"), out);''')
changes['.gitignore']=read('.gitignore')+'\n/prisma/sqlite/schema.prisma\n/prisma/postgresql/schema.prisma\n/e2e/remediation/.compiled/\n'
write('docker-entrypoint.sh','''#!/bin/sh
# Only reviewed migrations. Never reset, db-push, or auto-baseline production.
set -eu
PROVIDER="${DOCURAMA_DB_PROVIDER:-sqlite}"
case "$PROVIDER" in sqlite|postgresql) ;; *) echo "Invalid database provider" >&2; exit 1 ;; esac
SCHEMA="prisma/$PROVIDER/schema.prisma"
if [ "${DOCURAMA_SKIP_MIGRATIONS:-${DOCURAMA_SKIP_DB_PUSH:-0}}" != "1" ]; then
  if [ ! -f "$SCHEMA" ]; then echo "Missing provider schema: $SCHEMA" >&2; exit 1; fi
  echo "[entrypoint] applying reviewed $PROVIDER migrations"
  if bunx prisma migrate deploy --schema "$SCHEMA"; then
    echo "[entrypoint] migrations applied"
  else
    echo "[entrypoint] ERROR: migration failed; refusing to start" >&2
    exit 1
  fi
fi
exec "$@"
''')
replace('scripts/test-entrypoint.sh','SCRATCH="$(mktemp -d)"','cd "$ROOT"\nnode scripts/schema-for.mjs sqlite\nSCRATCH="$(mktemp -d)"')
replace('scripts/test-entrypoint.sh','export SCHEMA_RESULT=0\n','grep -q "migrate deploy" "$STARTUP_ARGS"\nexport SCHEMA_RESULT=0\n')
replace('.github/workflows/e2e.yml','branches: [main, quality]','branches: [main, quality, quality-remediation-20260920]',2)
# Library-driven webhook tests run in a DIFFERENT process from the server.
replace('.github/workflows/e2e.yml','      PGURL: postgresql://docurama:docurama@localhost:5432/docurama_test','      PGURL: postgresql://docurama:docurama@localhost:5432/docurama_test\n      DOCURAMA_ALLOW_PRIVATE_WEBHOOKS: "1"')
write('scripts/initialize-migration-history.mjs',r'''import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const old = readFileSync("prisma/baselines/release-20260920.prisma");
if (createHash("sha1").update(`blob ${old.length}\0`).update(old).digest("hex") !== "c79ff956959ac6d06deb28b67f98819a7476de76") throw new Error("Release baseline mismatch");
const current = readFileSync("prisma/schema.prisma", "utf8");
const work = mkdtempSync(join(tmpdir(), "docurama-migration-plan-"));
try {
  for (const provider of ["sqlite", "postgresql"]) {
    const root = `prisma/${provider}/migrations`;
    if (existsSync(root)) throw new Error(`Refusing to rewrite migration history: ${root}`);
    const rewrite = (s) => s.replace(/(datasource\s+db\s*\{[^}]*?provider\s*=\s*")[a-z]+(")/s, `$1${provider}$2`);
    const before = join(work, `before-${provider}.prisma`), after = join(work, `after-${provider}.prisma`);
    writeFileSync(before, rewrite(old.toString("utf8"))); writeFileSync(after, rewrite(current));
    const cli = (...args) => execFileSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], {
      encoding: "utf8", env: { ...process.env, DATABASE_URL: provider === "sqlite" ? "file:/tmp/unused-migration-plan.db" : "postgresql://unused:unused@localhost:5432/unused" },
    });
    const base = cli("migrate", "diff", "--from-empty", "--to-schema-datamodel", before, "--script");
    const delta = cli("migrate", "diff", "--from-schema-datamodel", before, "--to-schema-datamodel", after, "--script");
    for (const [name, sql] of [["0_release_baseline", base], ["20260920_quality_hardening", delta]]) {
      const dir = join(root, name); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "migration.sql"), sql);
    }
    writeFileSync(join(root, "migration_lock.toml"), `provider = "${provider}"\n`);
  }
} finally { rmSync(work, { recursive: true, force: true }); }
''')
# All transformations were constructed and checked before any source file changes.
for path,text in changes.items():
    target=R/path; target.parent.mkdir(parents=True,exist_ok=True); target.write_text(text)
print('Applied',len(changes),'guarded source transformations')
