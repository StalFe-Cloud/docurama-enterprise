import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { withScratch, initializeScratch, isolatedEnvironment } from './isolation.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const exec = promisify(execFile);
const migrate = (schema, DATABASE_URL) => exec(process.execPath,
  [join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', schema],
  { cwd: root, env: { ...isolatedEnvironment(process.env, { directory: dirname(schema), database: join(dirname(schema), 'suite.db'), fixture: join(dirname(schema), 'fixture.db') }), DATABASE_URL } });

test('real provider migrations initialize concurrent owned databases without touching repo DB', async () => {
  const sentinel = await readFile(join(root, 'db/custom.db'));
  const paths = [];
  await Promise.all([1, 2].map(() => withScratch(async (scratch) => {
    paths.push(scratch.database);
    await initializeScratch(root, scratch, migrate);
    const db = await readFile(scratch.database);
    assert.equal(db.subarray(0, 16).toString(), 'SQLite format 3\0');
    assert.deepEqual(await readFile(scratch.fixture), db);
  })));
  assert.notEqual(paths[0], paths[1]);
  for (const path of paths) await assert.rejects(access(path), { code: 'ENOENT' });
  assert.deepEqual(await readFile(join(root, 'db/custom.db')), sentinel);
});

test('real migration failure removes owned scratch and preserves repository DB and migrations', async () => {
  const sentinel = await readFile(join(root, 'db/custom.db'));
  const migration = join(root, 'prisma/sqlite/migrations/0_release_baseline/migration.sql');
  const originalMigration = await readFile(migration);
  let owned;
  await assert.rejects(withScratch(async (scratch) => {
    owned = scratch.directory;
    await initializeScratch(root, scratch, async (schema, url) => {
      // Corrupt only the copied migration, never a tracked repository file.
      const names = (await readdir(join(scratch.directory, 'migrations'), { withFileTypes: true }))
        .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
      await writeFile(join(scratch.directory, 'migrations', names[0], 'migration.sql'), 'THIS IS INVALID SQL;');
      await migrate(schema, url);
    });
  }), /Command failed/);
  await assert.rejects(access(owned), { code: 'ENOENT' });
  assert.deepEqual(await readFile(join(root, 'db/custom.db')), sentinel);
  assert.deepEqual(await readFile(migration), originalMigration);
});
