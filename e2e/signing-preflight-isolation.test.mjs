import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { withScratch, initializeScratch, isolatedEnvironment } from './isolation.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const exec = promisify(execFile);

test('actual signing route rejects invalid render/consent and preserves atomic state', { timeout: 90000 }, async () => {
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    try { await access(join(root, name)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new Error(`Refusing dotenv file ${name} in owned SQLite fixture`);
  }
  const sentinel = await readFile(join(root, 'db/custom.db'));
  let owned;
  try { await withScratch(async (scratch) => {
    owned = scratch.directory;
    const env = isolatedEnvironment(process.env, scratch);
    await initializeScratch(root, scratch, (schema, DATABASE_URL) => exec(process.execPath,
      [...(process.versions.bun ? ['--no-env-file'] : []), join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', schema],
      { cwd: root, env: { ...env, DATABASE_URL } }));
    const nonce = randomBytes(32).toString('hex');
    await writeFile(join(scratch.directory, 'signing-route-owner'), nonce, { flag: 'wx' });
    const { stdout, stderr } = await exec(process.execPath,
      ['--no-env-file', join(root, 'e2e/signing-preflight-fixture.mjs')],
      { cwd: root, env: { ...env, E2E_SIGNING_FIXTURE_NONCE: nonce }, timeout: 60000 });
    if (stderr) process.stderr.write(stderr);
    assert.match(stdout, /SIGNING_ROUTE_ISOLATION_OK/);
    process.stdout.write(stdout);
  }); } finally {
    await assert.rejects(access(owned), { code: 'ENOENT' });
    assert.deepEqual(await readFile(join(root, 'db/custom.db')), sentinel);
    console.log(JSON.stringify({ originalDbSha256: createHash('sha256').update(sentinel).digest('hex'), originalDbUnchanged: true, ownedScratchRemoved: true }));
  }
});
