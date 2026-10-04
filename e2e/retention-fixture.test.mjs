import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { createRetentionFixture, deleteRetentionFixture } from './retention-fixture.ts';
import { withScratch, initializeScratch, isolatedEnvironment } from './isolation.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const exec = promisify(execFile);

test('retention fixture initializes empty SQLite and cleans only its own evidence rows', { timeout: 90000 }, async () => {
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    try { await access(join(root, name)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new Error(`Refusing dotenv file ${name} in owned SQLite fixture`);
  }
  const sentinel = await readFile(join(root, 'db/custom.db'));
  let owned;
  await withScratch(async (scratch) => {
    owned = scratch.directory;
    const env = isolatedEnvironment(process.env, scratch);
    await initializeScratch(root, scratch, (schema, DATABASE_URL) => exec(process.execPath,
      [...(process.versions.bun ? ['--no-env-file'] : []), join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', schema],
      { cwd: root, env: { ...env, DATABASE_URL } }));
    const client = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
    try {
      assert.equal(await client.member.count(), 0);
      assert.equal(await client.envelope.count(), 0);
      const upload = (key) => ({ storageKey: key, byteSize: 40, sha256: 'a'.repeat(64) });
      const fixture = await createRetentionFixture(client, 'synthetic-retention', 'doc_orphan', upload('own/orphan'), 'doc_evidence', upload('own/evidence'));
      const unrelated = await createRetentionFixture(client, 'synthetic-unrelated', 'doc_other_orphan', upload('other/orphan'), 'doc_other_evidence', upload('other/evidence'));
      assert.equal(await client.member.count({ where: { tenantId: fixture.tenantId, userId: fixture.userId } }), 1);
      assert.equal(await client.document.count({ where: { tenantId: fixture.tenantId } }), 2);
      assert.equal((await client.envelope.findUniqueOrThrow({ where: { id: fixture.envelopeId } })).documentId, 'doc_evidence');
      assert.equal(await client.envelope.count({ where: { documentId: 'doc_orphan' } }), 0);
      // Match the sweep's prior orphan deletion before fixture cleanup.
      await client.document.delete({ where: { id: 'doc_orphan' } });
      await deleteRetentionFixture(client, fixture);
      assert.equal(await client.tenant.count({ where: { id: fixture.tenantId } }), 0);
      assert.equal(await client.user.count({ where: { id: fixture.userId } }), 0);
      assert.equal(await client.document.count({ where: { tenantId: fixture.tenantId } }), 0);
      assert.equal(await client.envelope.count({ where: { id: unrelated.envelopeId, documentId: 'doc_other_evidence' } }), 1);
      assert.equal(await client.document.count({ where: { tenantId: unrelated.tenantId } }), 2);
      assert.equal(await client.member.count({ where: { id: unrelated.memberId } }), 1);
      await deleteRetentionFixture(client, unrelated);
    } finally { await client.$disconnect(); }
  });
  await assert.rejects(access(owned), { code: 'ENOENT' });
  assert.deepEqual(await readFile(join(root, 'db/custom.db')), sentinel);
});
