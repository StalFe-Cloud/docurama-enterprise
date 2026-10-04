import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { writeFile, readFile } from 'node:fs/promises';
import { reserveEndpoint, stopOwnedProcess, withScratch } from './isolation.mjs';

async function support() {
  let api;
  try { api = await import('./seaweed-isolation.mjs'); } catch {}
  assert.ok(api, 'Seaweed isolation support must exist');
  return api;
}

test('fixture config and environment cannot inherit external storage or preload settings', async () => {
  const { seaweedEnvironment, localFilerConfiguration } = await support();
  const env = seaweedEnvironment({ PATH: '/tools', HOME: '/foreign', NODE_OPTIONS: '--require secret',
    WEED_S3_ENDPOINT: 'https://foreign', WEED_LEVELDB2_ENABLED: 'false', SENTRY_DSN: 'foreign', AWS_ACCESS_KEY_ID: 'foreign' }, '/owned');
  assert.equal(env.HOME, '/owned');
  assert.equal(env.PATH, '/tools');
  for (const key of ['NODE_OPTIONS', 'WEED_S3_ENDPOINT', 'WEED_LEVELDB2_ENABLED', 'SENTRY_DSN', 'AWS_ACCESS_KEY_ID']) assert.equal(env[key], undefined);
  assert.match(localFilerConfiguration('/owned'), /\[leveldb2\]\nenabled = true/);
  assert.match(localFilerConfiguration('/owned'), /owned/);
});

test('all eight ports are independently leased and avoid a foreign listener', async () => {
  const { reserveFixturePorts } = await support();
  const foreign = await reserveEndpoint();
  let leases;
  try {
    leases = await reserveFixturePorts();
    assert.equal(leases.length, 8);
    assert.equal(new Set(leases.map((entry) => entry.port)).size, 8);
    for (const entry of leases) {
      assert.notEqual(entry.port, foreign.port);
      await assert.rejects(reserveEndpoint(entry.url), /EADDRINUSE/);
    }
  } finally {
    for (const lease of leases ?? []) await lease.release();
    await foreign.release();
  }
});

test('kernel ownership proves all listeners belong to owned child; foreign listener is never probed', { skip: process.platform !== 'linux' ? 'requires Linux /proc live ownership proof' : false }, async () => {
  const { reserveFixturePorts, socketsOwnedBy } = await support();
  const leases = await reserveFixturePorts();
  const ports = leases.map((entry) => entry.port);
  for (const lease of leases) await lease.release();
  let writes = 0;
  const foreign = net.createServer((socket) => { writes++; socket.destroy(); });
  await new Promise((resolve) => foreign.listen(0, '127.0.0.1', resolve));
  const child = spawn(process.execPath, ['--eval',
    `let ready=0;for(const port of ${JSON.stringify(ports)})require('node:net').createServer(s=>s.end()).listen(port,'127.0.0.1',()=>{if(++ready===8)console.log('ready')});`],
    { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('owned listener fixture readiness timed out')), 5000);
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
      child.once('exit', () => { clearTimeout(timeout); reject(new Error('owned listener fixture exited before readiness')); });
      child.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
    });
    assert.equal(await socketsOwnedBy(child.pid, ports), true);
    assert.equal(await socketsOwnedBy(child.pid, [foreign.address().port, ...ports.slice(1)]), false);
    assert.equal(writes, 0, 'ownership checks must not send a network probe to foreign listener');
  } finally {
    await stopOwnedProcess(child);
    await new Promise((resolve) => foreign.close(resolve));
  }
});

test('failed listener startup cannot authorize probes and leaves foreign listener untouched', { skip: process.platform !== 'linux' ? 'requires Linux /proc live ownership proof' : false }, async () => {
  const { reserveFixturePorts, socketsOwnedBy } = await support();
  const leases = await reserveFixturePorts();
  const ports = leases.map((entry) => entry.port);
  let writes = 0;
  const foreign = net.createServer((socket) => { writes++; socket.destroy(); });
  await new Promise((resolve) => foreign.listen(0, '127.0.0.1', resolve));
  for (const lease of leases) await lease.release();
  const attempted = [foreign.address().port, ...ports.slice(1)];
  const child = spawn(process.execPath, ['--eval',
    `for(const port of ${JSON.stringify(attempted)})require('node:net').createServer().once('error',()=>process.exit(42)).listen(port,'127.0.0.1');`],
    { detached: true, stdio: 'ignore' });
  try {
    const code = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('failed startup fixture exit timed out')), 5000);
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
      child.once('exit', (code) => { clearTimeout(timeout); resolve(code); });
    });
    assert.equal(code, 42);
    assert.equal(await socketsOwnedBy(child.pid, attempted), false);
    assert.equal(writes, 0);
    assert.equal(foreign.listening, true);
  } finally {
    await stopOwnedProcess(child);
    await new Promise((resolve) => foreign.close(resolve));
  }
});

test('proc parser accepts only loopback LISTEN sockets held by exact process inode', async () => {
  const { ownedLoopbackPorts } = await support();
  assert.equal(typeof ownedLoopbackPorts, 'function', 'proc parser must be independently verifiable');
  const header = 'sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode';
  const row = (address, state, inode) => ` 0: ${address} 00000000:0000 ${state} 00000000:00000000 00:00000000 00000000 1000 0 ${inode} 1`;
  const table = [header, row('0100007F:7531', '0A', '111'), row('0100007F:7532', '0A', '222'),
    row('00000000:7533', '0A', '111'), row('0100007F:7534', '01', '111')].join('\n');
  assert.deepEqual([...ownedLoopbackPorts(table, new Set(['111']))], [30001]);
  assert.deepEqual([...ownedLoopbackPorts(table, new Set(['222']))], [30002]);
  assert.deepEqual([...ownedLoopbackPorts(table, new Set())], []);
  assert.deepEqual([...ownedLoopbackPorts(header + '\nmalformed row\n', new Set(['111']))], []);
});

test('pre-existing derived Unix socket paths refuse startup and preserve their sentinel', async () => {
  const { grpcSocketPaths, assertSocketPathsUnused } = await support();
  assert.equal(typeof grpcSocketPaths, 'function');
  assert.equal(typeof assertSocketPathsUnused, 'function');
  await withScratch(async (scratch) => {
    const paths = grpcSocketPaths([31001, 31002, 31003, 31004], scratch.directory);
    assert.equal(paths.length, 4);
    await assertSocketPathsUnused(paths);
    await writeFile(paths[0], 'foreign socket sentinel');
    await assert.rejects(assertSocketPathsUnused(paths), /existing|refus/i);
    assert.equal(await readFile(paths[0], 'utf8'), 'foreign socket sentinel');
  });
});

test('fixture exit timeout escalates only owned process and never authorizes deletion before exit', async () => {
  const { terminateFixture } = await support();
  const calls = [];
  let resolveExit;
  const proc = { exitCode: null, exited: new Promise((resolve) => { resolveExit = resolve; }),
    kill(signal) { calls.push(signal); if (signal === 'SIGKILL') { this.exitCode = 137; resolveExit(137); } } };
  await terminateFixture(proc, 5);
  assert.deepEqual(calls, ['SIGTERM', 'SIGKILL']);
  assert.equal(proc.exitCode, 137);
  const stuck = { exitCode: null, exited: new Promise(() => {}), kill() {} };
  await assert.rejects(terminateFixture(stuck, 5), /retain|exit|cleanup/);
});
