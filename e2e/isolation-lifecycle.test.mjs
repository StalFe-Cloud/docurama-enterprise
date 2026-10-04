import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { postgresConfiguration, withScratch } from './isolation.mjs';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { isolatedEnvironment, stopOwnedProcess } from './isolation.mjs';

const fixtureProcess = () => Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });

test('actual Node child receives the heap budget without ambient preloads', async () => {
  const { ownedServerArguments, waitForOwnedCommand } = await import('./server-lifecycle.mjs');
  const env = isolatedEnvironment({ ...process.env, NODE_OPTIONS: '--require foreign-preload', BUN_OPTIONS: '--preload foreign' },
    { directory: '/unused', database: '/unused/db', fixture: '/unused/fixture' });
  const child = spawn(process.execPath, [...ownedServerArguments().slice(0, -1), '--eval',
    'console.log(JSON.stringify({argv:process.execArgv,heapLimit:require("node:v8").getHeapStatistics().heap_size_limit,preload:process.env.NODE_OPTIONS??null}))'],
    { env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  try {
    await waitForOwnedCommand(child);
    const proof = JSON.parse(output);
    assert.equal(proof.argv[0], '--max-old-space-size=4096');
    assert.ok(proof.heapLimit >= 4096 * 1024 * 1024);
    assert.equal(proof.preload, null);
  } finally { await stopOwnedProcess(child); }
});

test('actual owned server exit rejects suite while unrelated fixture remains alive', async () => {
  const { waitForOwnedCommand } = await import('./server-lifecycle.mjs');
  const options = { detached: process.platform !== 'win32', stdio: 'ignore',
    env: isolatedEnvironment(process.env, { directory: '/unused', database: '/unused/db', fixture: '/unused/fixture' }) };
  const suite = spawn(process.execPath, ['--eval', 'setInterval(()=>{},1000)'], options);
  const foreign = spawn(process.execPath, ['--eval', 'setInterval(()=>{},1000)'], options);
  const server = spawn(process.execPath, ['--eval', 'setTimeout(()=>process.exit(77),150)'], options);
  try {
    await assert.rejects(waitForOwnedCommand(suite, server), /Owned dev server exited during suite \(77\)/);
    assert.equal(suite.exitCode, null);
    assert.equal(foreign.exitCode, null);
    assert.equal(process.kill(foreign.pid, 0), true);
  } finally {
    await Promise.all([stopOwnedProcess(suite), stopOwnedProcess(server), stopOwnedProcess(foreign)]);
  }
});

test('owned server launch has explicit heap budget and preserves sanitized runtime environment', async () => {
  const { ownedServerArguments } = await import('./server-lifecycle.mjs');
  assert.deepEqual(ownedServerArguments(), ['--max-old-space-size=4096', 'e2e/start-server.mjs']);
  const { isolatedEnvironment } = await import('./isolation.mjs');
  const env = isolatedEnvironment({ NODE_OPTIONS: '--require foreign-preload', BUN_OPTIONS: '--preload foreign', PATH: '/tools' }, { directory: '/owned', database: '/owned/suite.db', fixture: '/owned/fixture.db' });
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.BUN_OPTIONS, undefined);
});

test('owned server restart exit promptly rejects active suite and detaches only owned listeners', async () => {
  const { waitForOwnedCommand } = await import('./server-lifecycle.mjs');
  const suite = fixtureProcess(), server = fixtureProcess(), foreign = fixtureProcess();
  foreign.on('exit', () => {});
  const pending = waitForOwnedCommand(suite, server);
  server.exitCode = 77;
  server.emit('exit', 77, null);
  await assert.rejects(pending, /Owned dev server exited during suite \(77\)/);
  assert.equal(suite.listenerCount('exit'), 0);
  assert.equal(server.listenerCount('exit'), 0);
  assert.equal(foreign.listenerCount('exit'), 1);
  assert.equal(foreign.exitCode, null);
});

test('successful suite leaves server running; an already exited server refuses further suite work', async () => {
  const { waitForOwnedCommand } = await import('./server-lifecycle.mjs');
  const suite = fixtureProcess(), server = fixtureProcess();
  const pending = waitForOwnedCommand(suite, server);
  suite.exitCode = 0;
  suite.emit('exit', 0, null);
  await pending;
  assert.equal(server.exitCode, null);
  assert.equal(server.listenerCount('exit'), 0);
  server.exitCode = 77;
  await assert.rejects(waitForOwnedCommand(fixtureProcess(), server), /Owned dev server exited during suite \(77\)/);
});

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
