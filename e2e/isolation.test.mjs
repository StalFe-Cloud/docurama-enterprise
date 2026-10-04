import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, access, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

// Import lazily so a missing implementation is an assertion failure in RED.
async function support() {
  let api;
  try { api = await import('./isolation.mjs'); } catch {}
  assert.ok(api, 'E2E isolation support must exist');
  return api;
}

test('success and failure leave repository database sentinel unchanged; cleanup owns only scratch', async () => {
  const { withScratch } = await support();
  const repo = await mkdtemp(join(tmpdir(), 'e2e-sentinel-'));
  const sentinel = join(repo, 'custom.db');
  await writeFile(sentinel, 'do not mutate');
  try {
    for (const fail of [false, true]) {
      let owned;
      const result = withScratch(async (scratch) => {
        owned = scratch.directory;
        assert.notEqual(scratch.database, sentinel);
        await writeFile(scratch.database, 'suite mutations');
        if (fail) throw new Error('suite failure');
      });
      if (fail) await assert.rejects(result, /suite failure/); else await result;
      assert.equal(await readFile(sentinel, 'utf8'), 'do not mutate');
      await assert.rejects(access(owned), { code: 'ENOENT' });
    }
  } finally { await rm(repo, { recursive: true, force: true }); }
});

test('concurrent runs get unique database paths and do not remove each other', async () => {
  const { withScratch } = await support();
  await withScratch(async (a) => {
    await writeFile(a.database, 'first');
    await withScratch(async (b) => {
      assert.notEqual(a.database, b.database);
      await writeFile(b.database, 'second');
      assert.equal(await readFile(a.database, 'utf8'), 'first');
    });
    assert.equal(await readFile(a.database, 'utf8'), 'first');
  });
});

test('migration receives only fresh scratch schema/database; migration failure preserves repository sentinel', async () => {
  const { withScratch, initializeScratch } = await support();
  assert.equal(typeof initializeScratch, 'function', 'scratch initialization must be separately verifiable');
  const repo = await mkdtemp(join(tmpdir(), 'e2e-migration-sentinel-'));
  await mkdir(join(repo, 'prisma/sqlite/migrations'), { recursive: true });
  await mkdir(join(repo, 'db'));
  await writeFile(join(repo, 'db/custom.db'), 'repository sentinel');
  await writeFile(join(repo, 'prisma/schema.prisma'), 'schema sentinel');
  await writeFile(join(repo, 'prisma/sqlite/migrations/migration_lock.toml'), 'provider = "sqlite"');
  try {
    for (const fail of [false, true]) {
      const run = withScratch(async (scratch) => {
        await initializeScratch(repo, scratch, async (schema, databaseUrl) => {
          assert.equal(await readFile(schema, 'utf8'), 'schema sentinel');
          assert.equal(databaseUrl, `file:${scratch.database.replaceAll('\\', '/')}`);
          await writeFile(scratch.database, 'migrated schema');
          if (fail) throw new Error('migration failure');
        });
        assert.equal(await readFile(scratch.fixture, 'utf8'), 'migrated schema');
      });
      if (fail) await assert.rejects(run, /migration failure/); else await run;
      assert.equal(await readFile(join(repo, 'db/custom.db'), 'utf8'), 'repository sentinel');
    }
  } finally { await rm(repo, { recursive: true, force: true }); }
});

test('local mode refuses external database and endpoint overrides before any work', async () => {
  const { configuration } = await support();
  for (const env of [
    { E2E_DATABASE_URL: 'file:../db/custom.db' },
    { E2E_DATABASE_URL: 'postgresql://localhost/production' },
    { E2E_BASE_URL: 'https://production.example' },
    { E2E_BASE_URL: 'http://127.0.0.1:3000/login' },
    { E2E_START_SERVER: '0' },
  ]) assert.throws(() => configuration(env), /refus|requires|origin/i);
  assert.equal(configuration({ DATABASE_URL: 'file:../db/custom.db' }).remote, false);
});

test('requested local port collisions fail instead of attaching a listening server', async () => {
  const { reserveEndpoint } = await support();
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(reserveEndpoint(`http://127.0.0.1:${server.address().port}`), /in use|EADDRINUSE/);
    const lease = await reserveEndpoint();
    assert.match(lease.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    await lease.release();
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('remote mode requires explicit disposable CI declaration and rejects non-loopback or non-test targets', async () => {
  const { configuration } = await support();
  const env = { CI: 'true', E2E_START_SERVER: '0', E2E_REMOTE_DISPOSABLE: '1',
    E2E_DATABASE_URL: 'postgresql://docurama:secret@localhost:5432/docurama_test',
    E2E_BASE_URL: 'http://127.0.0.1:3030' };
  assert.equal(configuration(env).remote, true);
  for (const override of [{ CI: '' }, { E2E_REMOTE_DISPOSABLE: '' },
    { E2E_DATABASE_URL: 'postgresql://localhost/production' },
    { E2E_DATABASE_URL: 'file:../db/custom.db' },
    { E2E_BASE_URL: 'https://production.example' }]) {
    assert.throws(() => configuration({ ...env, ...override }), /refus|requires/i);
  }
});

test('full local Windows lifecycle fails closed without a process-tree ownership primitive', async () => {
  const { assertLocalPlatform } = await support();
  assert.equal(typeof assertLocalPlatform, 'function', 'unsupported process ownership must fail closed');
  assert.throws(() => assertLocalPlatform('win32'), /Windows|ownership/i);
  assert.doesNotThrow(() => assertLocalPlatform('linux'));
});

test('child environment removes external integration configuration and pins owned storage/database', async () => {
  const { isolatedEnvironment } = await support();
  assert.equal(typeof isolatedEnvironment, 'function', 'integration configuration must be scrubbed centrally');
  const scratch = { database: '/owned/suite.db', fixture: '/owned/fixture.db', directory: '/owned' };
  const source = { DATABASE_URL: 'file:/user.db', STORAGE_DIR: '/user/storage', PATH: '/tool/bin', E2E_SKIP_BROWSER: '1', E2E_SKIP_S3: '0',
    AWS_PROFILE: 'production', S3_BUCKET: 'production', STRIPE_SECRET_KEY: 'secret', OPENAI_API_KEY: 'secret',
    ANTHROPIC_API_KEY: 'secret', TURNSTILE_SECRET_KEY: 'secret', SSO_TXN_SECRET: 'secret', ZAI_API_KEY: 'secret',
    NODE_OPTIONS: '--require dotenv/config', BUN_OPTIONS: '--preload user-code.ts', GITHUB_TOKEN: 'secret',
    NPM_TOKEN: 'secret', SMTP_PASSWORD: 'secret', UNRECOGNIZED_PROVIDER_SECRET: 'secret',
    EVIDENCE_PORTAL_URL: 'https://production.example', REKOR_WITNESS: 'on', SMTP_URL: 'smtp://production.example' };
  const result = isolatedEnvironment(source, scratch);
  for (const key of ['AWS_PROFILE','S3_BUCKET','STRIPE_SECRET_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY',
    'TURNSTILE_SECRET_KEY','SSO_TXN_SECRET','ZAI_API_KEY','EVIDENCE_PORTAL_URL','NODE_OPTIONS','BUN_OPTIONS',
    'GITHUB_TOKEN','NPM_TOKEN','SMTP_PASSWORD','UNRECOGNIZED_PROVIDER_SECRET']) assert.equal(result[key], undefined);
  assert.equal(result.DATABASE_URL, 'file:/owned/suite.db');
  assert.equal(result.PATH, source.PATH);
  assert.equal(result.E2E_SKIP_BROWSER, '1');
  assert.equal(result.SMTP_URL, '');
  assert.equal(result.REKOR_WITNESS, 'off');
  assert.equal(result.E2E_SKIP_S3, '0', 'the runner must not suppress a requested S3 tier');
});

test('configured Seaweed requires Linux kernel ownership support; no binary remains optional', async () => {
  const { assertS3LifecycleSafe } = await support();
  assert.equal(typeof assertS3LifecycleSafe, 'function', 'required S3 tier needs an explicit safety failure');
  assert.throws(() => assertS3LifecycleSafe('/owned/tools/weed', 'win32'), /Seaweed|ownership|blocked/);
  assert.doesNotThrow(() => assertS3LifecycleSafe('/owned/tools/weed', 'linux'));
  assert.doesNotThrow(() => assertS3LifecycleSafe('', 'win32'));
});

test('Windows suite launcher chooses Git Bash instead of WSL and rejects relative command overrides', async () => {
  const { bashExecutable } = await support();
  assert.equal(typeof bashExecutable, 'function', 'explicit Bash selection must exist');
  assert.equal(bashExecutable({}, 'win32'), 'C:\\Program Files\\Git\\bin\\bash.exe');
  assert.equal(bashExecutable({ E2E_BASH_BIN: 'D:\\Tools\\Git\\bin\\bash.exe' }, 'win32'), 'D:\\Tools\\Git\\bin\\bash.exe');
  assert.throws(() => bashExecutable({ E2E_BASH_BIN: 'bash.exe' }, 'win32'), /absolute/);
});
