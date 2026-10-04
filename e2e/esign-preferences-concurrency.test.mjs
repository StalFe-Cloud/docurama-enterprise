import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { ensureEsignPreferences } from '../src/lib/esign-preferences.ts';
import { withScratch, initializeScratch, isolatedEnvironment } from './isolation.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const exec = promisify(execFile);

test('real fresh SQLite first reads converge on one preference row and preserve stored policy', { timeout: 90000 }, async () => {
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
      const tenant = await client.tenant.create({ data: { name: 'Synthetic preference race', slug: 'synthetic-preference-race' } });
      const rows = await Promise.all(Array.from({ length: 12 }, () => ensureEsignPreferences(tenant.id, client.esignPreferences)));
      assert.equal(new Set(rows.map((row) => row.id)).size, 1);
      assert.ok(rows.every((row) => row.tenantId === tenant.id));
      assert.equal(await client.esignPreferences.count({ where: { tenantId: tenant.id } }), 1);
      const stored = await client.esignPreferences.update({ where: { tenantId: tenant.id }, data: {
        requireReauth: true, part11Mode: true, consentText: 'Reviewed synthetic consent', consentVersion: 'fixture-v9',
      } });
      const again = await Promise.all(Array.from({ length: 12 }, () => ensureEsignPreferences(tenant.id, client.esignPreferences)));
      for (const row of again) assert.deepEqual(row, stored);
      // Capture the real provider's P2002 metadata, then inject that exact
      // conflict into the loser path while reading the genuine stored row.
      let conflict;
      try { await client.esignPreferences.create({ data: { tenantId: tenant.id } }); }
      catch (error) { conflict = error; }
      assert.equal(conflict?.code, 'P2002');
      assert.deepEqual(await ensureEsignPreferences(tenant.id, {
        upsert: async () => { throw conflict; },
        findUnique: (args) => client.esignPreferences.findUnique(args),
      }), stored);
    } finally { await client.$disconnect(); }
  });
  await assert.rejects(access(owned), { code: 'ENOENT' });
  assert.deepEqual(await readFile(join(root, 'db/custom.db')), sentinel);
});
