#!/usr/bin/env node
import { access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { configuration, postgresConfiguration, reserveEndpoint, withScratch, initializeScratch, stopOwnedProcess as stop, isolatedEnvironment, bashExecutable, assertLocalPlatform } from './isolation.mjs';
import { socketsOwnedBy } from './seaweed-isolation.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let active;
let stopping = false;

function start(command, args, env, stdio = 'inherit') {
  if (stopping) throw new Error('E2E interrupted');
  return spawn(command, args, { cwd: root, env, stdio, detached: process.platform !== 'win32' });
}

async function command(command, args, env) {
  const child = start(command, args, env);
  active = child;
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} failed (${signal ?? code})`)));
    });
  } finally {
    await stop(child);
    active = undefined;
  }
}

export async function runIsolated({ ownedPostgres = false } = {}) {
  const config = ownedPostgres ? postgresConfiguration(process.env) : configuration(process.env);
  const ownsServer = ownedPostgres || !config.remote;
  if (ownsServer) assertLocalPlatform();
  if (ownsServer && process.platform !== 'linux') throw new Error('Owned server requires Linux socket ownership proof');
  // Next itself loads dotenv independently of Bun. Fail closed rather than
  // letting repository credentials/configuration leak into the E2E server.
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    try { await access(join(root, name)); } catch { continue; }
    throw new Error(`Refusing ${name}: run E2E in a clean checkout without dotenv files`);
  }
  await withScratch(async (scratch) => {
    let server, lease;
    const env = isolatedEnvironment(process.env, scratch);
    let log = '';
    let stream;
    try {
      // Reserve the requested port before migration, refusing foreign listeners.
      if (ownsServer) lease = await reserveEndpoint(ownedPostgres ? process.env.E2E_BASE_URL : config.url);
      if (!config.remote) await initializeScratch(root, scratch, async (schema, databaseUrl) => {
        await command(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', schema], { ...env, DATABASE_URL: databaseUrl });
      });
      if (config.remote) env.DATABASE_URL = config.databaseUrl;
      env.E2E_BASE_URL = ownsServer ? lease.url : config.url;
      env.NEXTAUTH_URL = env.E2E_BASE_URL;
      console.log(`E2E isolated endpoint: ${env.E2E_BASE_URL}; scratch: ${scratch.directory}`);
      if (ownsServer) {
        await lease.release(); lease = undefined;
        const port = new URL(env.E2E_BASE_URL).port;
        stream = createWriteStream(join(scratch.directory, 'server.log'));
        server = start(process.execPath, ['e2e/start-server.mjs'], { ...env, PORT: port }, ['ignore', 'pipe', 'pipe']);
        let startupError;
        server.on('error', (error) => { startupError = error; });
        for (const pipe of [server.stdout, server.stderr]) pipe.on('data', (data) => {
          stream.write(data); log = (log + data.toString()).slice(-65536);
        });
        // Next's ready message proves our child bound the requested endpoint.
        // Merely receiving HTTP from another process is never sufficient.
        const deadline = Date.now() + 120000;
        while (!/Ready in/i.test(log.replace(/\x1b\[[0-9;]*m/g, '')) || !await socketsOwnedBy(server.pid, [Number(port)])) {
          if (stopping) throw new Error('E2E interrupted');
          if (startupError) throw startupError;
          if (server.exitCode !== null || server.signalCode !== null) throw new Error('Owned dev server exited before readiness');
          if (Date.now() > deadline) throw new Error('Owned dev server readiness timed out');
          await delay(200);
        }
      }
      await command(bashExecutable(env), [join(root, config.remote ? 'e2e/remote-suites.sh' : 'e2e/suites.sh')], env);
    } catch (error) {
      if (log) console.error(log);
      throw error;
    } finally {
      const cleanup = await Promise.allSettled([lease?.release(), stop(active), stop(server)]);
      if (stream) await new Promise((resolve) => stream.end(resolve));
      const failed = cleanup.find((result) => result.status === 'rejected');
      if (failed) { scratch.retain = true; throw failed.reason; }
    }
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (stopping) return;
  stopping = true;
  // Let the normal command rejection/finally path remove only owned files.
  void stop(active).catch((error) => console.error(error.message));
  process.exitCode = signal === 'SIGINT' ? 130 : 143;
});

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  runIsolated().catch((error) => { console.error(`E2E refused/failed: ${error.message}`); process.exitCode = process.exitCode || 1; });
}
