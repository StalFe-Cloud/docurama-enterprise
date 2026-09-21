import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// Intentionally not a production migration command. It operates only on a new,
// disposable CI database and restores into a DIFFERENT, new database/file.
const provider = process.argv[2];
const sourceUrl = process.env.DATABASE_URL ?? '';
const root = resolve(process.env.RUNNER_TEMP ?? '/invalid');
assert.equal(process.env.CI, 'true', 'CI fixture only');
assert.equal(process.env.DOCURAMA_VERIFICATION_DATABASE, '1');
assert(['sqlite', 'postgresql'].includes(provider));
let pg;
let sourcePath;
if (provider === 'sqlite') {
  assert(sourceUrl.startsWith('file:'));
  sourcePath = resolve(sourceUrl.slice(5));
  assert(sourcePath.startsWith(root + sep) && sourcePath.endsWith('/quality-verification.db'));
} else {
  pg = new URL(sourceUrl);
  assert.equal(pg.protocol, 'postgresql:');
  assert.equal(pg.hostname, '127.0.0.1');
  assert.equal(pg.pathname, '/docurama_verification');
  assert.equal(pg.username, 'docurama');
}
const scratch = mkdtempSync(join(root, 'quality-migration-'));
const schema = resolve('prisma', provider, 'schema.prisma');
const baselineName = '0_release_baseline';
const baselineRoot = join(scratch, 'baseline');
mkdirSync(join(baselineRoot, 'migrations', baselineName), { recursive: true });
copyFileSync(schema, join(baselineRoot, 'schema.prisma'));
copyFileSync(resolve('prisma', provider, 'migrations', 'migration_lock.toml'), join(baselineRoot, 'migrations', 'migration_lock.toml'));
copyFileSync(resolve('prisma', provider, 'migrations', baselineName, 'migration.sql'), join(baselineRoot, 'migrations', baselineName, 'migration.sql'));
const command = (file, args, env = process.env) => execFileSync(file, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });
function prisma(args, url = sourceUrl) {
  try { return command(process.execPath, ['node_modules/prisma/build/index.js', ...args], { ...process.env, DATABASE_URL: url }); }
  catch (error) { console.error(String(error.stdout ?? ''), String(error.stderr ?? '')); throw error; }
}
const open = (url) => new PrismaClient({ datasources: { db: { url } } });
const source = open(sourceUrl);
const existing = provider === 'sqlite'
  ? await source.$queryRaw`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
  : await source.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
assert.equal(existing.length, 0, 'Refuse an existing database, even in CI');
await source.$disconnect();
prisma(['migrate', 'deploy', '--schema', join(baselineRoot, 'schema.prisma')]);
const legacy = open(sourceUrl);
const digest = 'a'.repeat(64);
const payload = JSON.stringify({ id: 'legacy-public-delivery', event: 'envelope.sent', data: { code: 'DOC-UPGRADE' } });
await legacy.$executeRaw`INSERT INTO "Tenant" ("id", "name", "slug", "status") VALUES ('migrationtenant', 'Preserved tenant', 'migration-fixture', 'ACTIVE')`;
await legacy.$executeRaw`INSERT INTO "User" ("id", "email", "passwordHash", "firstName", "lastName") VALUES ('migrationuser', 'migration@example.test', 'fixture-not-a-credential', 'Shared', 'Name')`;
await legacy.$executeRaw`INSERT INTO "Envelope" ("id", "tenantId", "createdById", "publicCode", "title", "status", "sha256") VALUES ('migrationenvelope', 'migrationtenant', 'migrationuser', 'DOC-UPGRADE', 'Preserved evidence', 'COMPLETED', ${digest})`;
await legacy.$executeRaw`INSERT INTO "Recipient" ("id", "envelopeId", "name", "email", "accessToken", "status") VALUES ('migrationrecipient', 'migrationenvelope', 'Recipient fixture', 'recipient@example.test', 'migration-fixture-token-not-for-use', 'SIGNED')`;
await legacy.$executeRaw`INSERT INTO "Subscription" ("id", "tenantId", "planCode", "renewalAt", "termMonths", "carriedForwardEnvelopes") VALUES ('migrationsub', 'migrationtenant', 'STARTER', ${new Date('2027-01-31T12:00:00Z')}, 12, 2)`;
await legacy.$executeRaw`INSERT INTO "MailOutbox" ("id", "toEmail", "subject", "template", "bodyText", "attempts") VALUES ('migrationmail', 'migration@example.test', 'Preserved invitation', 'TEST', 'Exact legacy message', 2)`;
await legacy.$executeRaw`INSERT INTO "AuditEvent" ("id", "actor", "actorRole", "action", "resource", "ip") VALUES ('migrationaudit', 'Shared Name', 'MEMBER', 'legacy.audit', 'legacy-resource', 'unknown')`;
await legacy.$executeRaw`INSERT INTO "WebhookEndpoint" ("id", "tenantId", "url", "events", "secretMasked", "status") VALUES ('migrationendpoint', 'migrationtenant', 'https://example.test/hook', '*', 'fixture', 'PAUSED')`;
await legacy.$executeRaw`INSERT INTO "WebhookDelivery" ("id", "endpointId", "event", "statusCode", "durationMs", "success", "payload", "attempts") VALUES ('migrationdelivery', 'migrationendpoint', 'envelope.sent', 503, 1, ${false}, ${payload}, 2)`;

async function snapshot(client) {
  const parts = await Promise.all([
    client.$queryRaw`SELECT "id", "name", "slug", "status" FROM "Tenant" ORDER BY "id"`,
    client.$queryRaw`SELECT "id", "email", "passwordHash", "firstName", "lastName" FROM "User" ORDER BY "id"`,
    client.$queryRaw`SELECT "id", "publicCode", "title", "status", "sha256", "tenantId", "createdById" FROM "Envelope" ORDER BY "id"`,
    client.$queryRaw`SELECT "id", "envelopeId", "email", "accessToken", "status" FROM "Recipient" ORDER BY "id"`,
    client.$queryRaw`SELECT "id", "tenantId", "planCode", "renewalAt", "termMonths", "carriedForwardEnvelopes" FROM "Subscription" ORDER BY "id"`,
    client.$queryRaw`SELECT "id", "toEmail", "subject", "bodyText", "attempts", "status" FROM "MailOutbox" ORDER BY "id"`,
    client.$queryRaw`SELECT "id", "actor", "resource", "ip" FROM "AuditEvent" ORDER BY "id"`,
    client.$queryRaw`SELECT "id", "endpointId", "payload", "attempts", "statusCode" FROM "WebhookDelivery" ORDER BY "id"`,
  ]);
  for (const rows of parts) assert.equal(rows.length, 1, 'Every fixture group must actually exist');
  return JSON.stringify(parts, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
}
const before = await snapshot(legacy);
await legacy.$disconnect();
let restoreUrl;
if (provider === 'sqlite') {
  const backup = join(scratch, 'before-upgrade.db');
  const restored = join(scratch, 'restored.db');
  command('sqlite3', [sourcePath, `.backup '${backup}'`]);
  command('sqlite3', [backup, `.backup '${restored}'`]);
  restoreUrl = `file:${restored}`;
} else {
  const backup = join(scratch, 'before-upgrade.dump');
  const env = { ...process.env, PGHOST: '127.0.0.1', PGPORT: pg.port || '5432', PGUSER: 'docurama', PGPASSWORD: decodeURIComponent(pg.password) };
  command('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', backup, '--dbname', 'docurama_verification'], env);
  // createdb refuses an existing target. Never use --clean or overwrite a DB.
  command('createdb', ['docurama_verification_restore'], env);
  command('pg_restore', ['--exit-on-error', '--no-owner', '--no-privileges', '--dbname', 'docurama_verification_restore', backup], env);
  const restored = new URL(sourceUrl);
  restored.pathname = '/docurama_verification_restore';
  restoreUrl = restored.href;
}
const restore = open(restoreUrl);
assert.equal(await snapshot(restore), before, 'Native backup/restore must preserve the baseline data');
await restore.$disconnect();

for (const url of [sourceUrl, restoreUrl]) {
  prisma(['migrate', 'deploy', '--schema', schema], url);
  const upgraded = open(url);
  assert.equal(await snapshot(upgraded), before, 'Upgrade must preserve legacy records and payload bytes');
  const subscription = await upgraded.subscription.findUniqueOrThrow({ where: { id: 'migrationsub' } });
  assert.equal(subscription.usageAnchorAt, null);
  assert.equal(subscription.usagePeriodStart, null);
  assert.equal(subscription.usagePeriodEnd, null);
  const audit = await upgraded.auditEvent.findUniqueOrThrow({ where: { id: 'migrationaudit' } });
  assert.equal(audit.actorUserId, null, 'Do not infer identity from an editable display name');
  assert.equal(audit.subjectUserId, null);
  assert.equal(audit.tenantId, null);
  assert.equal((await upgraded.mailOutbox.findUniqueOrThrow({ where: { id: 'migrationmail' } })).claimToken, null);
  assert.equal((await upgraded.webhookDelivery.findUniqueOrThrow({ where: { id: 'migrationdelivery' } })).claimUntil, null);
  const migrations = await upgraded.$queryRaw`SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`;
  assert.equal(migrations.length, 2);
  const expected = createHash('sha256').update(readFileSync(resolve('prisma', provider, 'migrations', baselineName, 'migration.sql'))).digest('hex');
  assert.equal(migrations.find((entry) => entry.migration_name === baselineName)?.checksum, expected);
  await upgraded.$disconnect();
  prisma(['migrate', 'deploy', '--schema', schema], url);
  prisma(['migrate', 'diff', '--from-url', url, '--to-schema-datamodel', schema, '--exit-code'], url);
}
console.log(`${provider}: populated baseline upgrade, idempotent deployment, native backup/restore and schema-drift checks passed`);
