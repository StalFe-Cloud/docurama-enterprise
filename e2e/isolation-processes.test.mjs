import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';

async function fixture() {
  const child = spawn(process.execPath, ['--eval',
    'require("node:net").createServer(s=>s.end("fixture")).listen(0,"127.0.0.1",function(){console.log(this.address().port)})'],
    { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  const port = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stdout.once('data', (data) => resolve(Number(data.toString().trim())));
  });
  return { child, port };
}

function connect(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('error', reject);
    socket.once('connect', () => { socket.destroy(); resolve(); });
  });
}

test('cleanup stops only the spawned fixture; an unrelated listening fixture survives', async () => {
  const support = await import('./isolation.mjs');
  assert.equal(typeof support.stopOwnedProcess, 'function', 'owned process cleanup must be verifiable');
  const foreign = await fixture();
  const owned = await fixture();
  try {
    await support.stopOwnedProcess(owned.child);
    await assert.rejects(connect(owned.port), /ECONNREFUSED/);
    await connect(foreign.port);
  } finally {
    await support.stopOwnedProcess(owned.child);
    await support.stopOwnedProcess(foreign.child);
  }
});
