import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { postgresConfiguration, withScratch } from './isolation.mjs';

test('owned PostgreSQL mode requires explicit disposable CI declaration', () => {
  assert.throws(() => postgresConfiguration({ DATABASE_URL: 'postgres://localhost/production' }), /requires/);
  const base = { CI: 'true', E2E_REMOTE_DISPOSABLE: '1', E2E_DATABASE_URL: 'postgres://localhost/docurama_e2e' };
  assert.equal(postgresConfiguration(base).databaseUrl, base.E2E_DATABASE_URL);
  assert.throws(() => postgresConfiguration({ ...base, E2E_DATABASE_URL: 'postgres://localhost/production' }), /Refusing/);
  assert.throws(() => postgresConfiguration({ ...base, E2E_BASE_URL: 'https://foreign.invalid' }), /Refusing/);
});

test('unconfirmed owned process cleanup retains scratch sentinel; normal cleanup removes scratch', async () => {
  let retained, removed;
  try {
    await assert.rejects(withScratch(async (scratch) => {
      retained = scratch.directory;
      await writeFile(join(retained, 'sentinel'), 'retain until confirmed exit');
      scratch.retain = true;
      throw new Error('unconfirmed exit');
    }), /unconfirmed/);
    assert.equal(await readFile(join(retained, 'sentinel'), 'utf8'), 'retain until confirmed exit');
    await withScratch(async (scratch) => { removed = scratch.directory; });
    await assert.rejects(access(removed));
  } finally { if (retained) await rm(retained, { recursive: true, force: true }); }
});
