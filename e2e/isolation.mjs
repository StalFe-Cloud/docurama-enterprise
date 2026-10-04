import { mkdtemp, rm, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute, win32 } from 'node:path';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

function loopbackOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Refusing endpoint: requires a plain http://127.0.0.1 loopback origin');
  }
  return url.origin;
}

export function configuration(env) {
  const remote = env.E2E_START_SERVER === '0';
  if (remote) {
    if (env.CI !== 'true' || env.E2E_REMOTE_DISPOSABLE !== '1' || !env.E2E_DATABASE_URL || !env.E2E_BASE_URL) {
      throw new Error('Remote mode requires CI=true, E2E_REMOTE_DISPOSABLE=1 and explicit owned CI database/endpoint');
    }
    const db = new URL(env.E2E_DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(db.protocol) ||
        !['localhost', '127.0.0.1'].includes(db.hostname) ||
        !/^\/[a-zA-Z0-9_]+_(test|e2e)$/.test(db.pathname)) {
      throw new Error('Refusing remote database: requires loopback PostgreSQL database named *_test or *_e2e');
    }
    return { remote, url: loopbackOrigin(env.E2E_BASE_URL), databaseUrl: env.E2E_DATABASE_URL };
  }
  if (env.E2E_DATABASE_URL) throw new Error('Refusing local E2E_DATABASE_URL override; the runner owns its fresh scratch database');
  if (env.E2E_START_SERVER && env.E2E_START_SERVER !== '1') throw new Error('Refusing invalid E2E_START_SERVER');
  return { remote, url: env.E2E_BASE_URL ? loopbackOrigin(env.E2E_BASE_URL) : undefined };
}

export function postgresConfiguration(env) {
  return configuration({ ...env, E2E_START_SERVER: '0', E2E_BASE_URL: env.E2E_BASE_URL || 'http://127.0.0.1:0' });
}

export function isolatedEnvironment(source, scratch) {
  const env = {};
  // Carry only process/tool discovery and explicit test controls. An unknown
  // provider, credential or runtime preload variable cannot enter a child.
  const runtime = new Set(['PATH','PATHEXT','SYSTEMROOT','WINDIR','COMSPEC','TEMP','TMP','HOME',
    'USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)',
    'XDG_CACHE_HOME','XDG_CONFIG_HOME','LANG','LC_ALL','TERM','COLORTERM','NO_COLOR','TZ',
    'CI','CHROME_BIN','WEED_BIN','UPDATE_BASELINES']);
  const controls = new Set(['E2E_BASE_URL','E2E_DATABASE_URL','E2E_START_SERVER','E2E_REMOTE_DISPOSABLE',
    'E2E_BASH_BIN','E2E_SKIP_SEED','E2E_SKIP_TSC','E2E_SKIP_API','E2E_SKIP_MAIL','E2E_SKIP_BILLING',
    'E2E_SKIP_SSO','E2E_SKIP_BOTGUARD','E2E_SKIP_S3','E2E_SKIP_BROWSER','E2E_SKIP_VISUAL']);
  for (const [name, value] of Object.entries(source)) {
    if (runtime.has(name.toUpperCase()) || controls.has(name)) env[name] = value;
  }
  return { ...env, DATABASE_URL: `file:${scratch.database.replaceAll('\\', '/')}`,
    E2E_FIXTURE_DB: scratch.fixture, STORAGE_DIR: join(scratch.directory, 'storage'),
    REKOR_WITNESS: 'off', DOCURAMA_WORKER: 'off', NEXT_PUBLIC_DEMO_MODE: 'true',
    NEXT_TELEMETRY_DISABLED: '1',
    DOCURAMA_ALLOW_PRIVATE_WEBHOOKS: '1', NEXTAUTH_SECRET: 'disposable-e2e-session-secret-only',
    SMTP_URL: '', PAYMENT_PROVIDER: 'manual', NODE_ENV: 'development' };
}

export function bashExecutable(env, platform = process.platform) {
  if (!env.E2E_BASH_BIN) return platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
  if (!(platform === 'win32' ? win32.isAbsolute(env.E2E_BASH_BIN) : isAbsolute(env.E2E_BASH_BIN))) {
    throw new Error('E2E_BASH_BIN requires an absolute executable path');
  }
  return env.E2E_BASH_BIN;
}

export function assertLocalPlatform(platform = process.platform) {
  if (platform === 'win32') {
    throw new Error('Full local E2E is unsupported on Windows: crash-safe child-tree ownership is unavailable; run in isolated Linux CI/VM instead');
  }
}

export function assertS3LifecycleSafe(weedBinary, platform = process.platform) {
  if (weedBinary && platform !== 'linux') {
    throw new Error('Required SeaweedFS E2E tier blocked: Linux /proc endpoint/process ownership support is required');
  }
}

// Only the directory returned by mkdtemp is ever removed. No caller-supplied
// database path is accepted, even if its name appears disposable.
export async function withScratch(run) {
  const directory = await mkdtemp(join(tmpdir(), 'docurama-e2e-'));
  const scratch = { directory, database: join(directory, 'suite.db'), fixture: join(directory, 'fixture.db'), retain: false };
  try { return await run(scratch); }
  finally {
    if (scratch.retain) console.error(`Owned process cleanup failed; retaining scratch: ${directory}`);
    else await rm(directory, { recursive: true, force: true });
  }
}

export async function initializeScratch(root, scratch, migrate) {
  const schema = join(scratch.directory, 'schema.prisma');
  await writeFile(schema, await readFile(join(root, 'prisma/schema.prisma')));
  await cp(join(root, 'prisma/sqlite/migrations'), join(scratch.directory, 'migrations'), { recursive: true });
  await migrate(schema, `file:${scratch.database.replaceAll('\\', '/')}`);
  await cp(scratch.database, scratch.fixture);
}

export async function reserveEndpoint(requested) {
  const url = requested ? new URL(loopbackOrigin(requested)) : undefined;
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(url ? Number(url.port || 80) : 0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  return { port, url: `http://127.0.0.1:${port}`,
    release: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

export async function stopOwnedProcess(child) {
  if (!child?.pid) return;
  // The caller passes only children it spawned in a dedicated POSIX process
  // group. Never locate or terminate services by executable name or port.
  if (process.platform === 'win32') {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolve, reject) => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], (error) => {
      if (error && child.exitCode === null && child.signalCode === null) reject(error); else resolve();
    }));
  } else {
    // An exited parent can still have live children in its owned group.
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    if (child.exitCode === null && child.signalCode === null) {
      await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(3000)]);
    }
    try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    const deadline = Date.now() + 5000;
    while (true) {
      try { process.kill(-child.pid, 0); }
      catch (error) { if (error.code === 'ESRCH') break; throw error; }
      if (Date.now() > deadline) throw new Error('Owned process group remains alive; refusing scratch cleanup');
      await delay(50);
    }
  }
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise((resolve) => child.once('exit', resolve));
  }
}
