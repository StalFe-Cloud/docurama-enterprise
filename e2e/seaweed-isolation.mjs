import { readdir, readlink, readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { reserveEndpoint, isolatedEnvironment } from './isolation.mjs';

export function seaweedEnvironment(source, directory) {
  const env = isolatedEnvironment(source, { directory, database: join(directory, 'unused.db'), fixture: join(directory, 'unused-fixture.db') });
  return { ...env, HOME: directory, USERPROFILE: directory, XDG_CONFIG_HOME: directory, XDG_CACHE_HOME: directory,
    TMPDIR: directory, TMP: directory, TEMP: directory };
}

export function localFilerConfiguration(directory) {
  return `[leveldb2]\nenabled = true\ndir = ${JSON.stringify(join(directory, 'filer-store'))}\n`;
}

export async function reserveFixturePorts() {
  const leases = [];
  try {
    // Four HTTP and four explicitly assigned gRPC listeners; no +1/+10000 assumptions.
    for (let i = 0; i < 8; i++) leases.push(await reserveEndpoint());
    return leases;
  } catch (error) {
    await Promise.all(leases.map((lease) => lease.release()));
    throw error;
  }
}

export function grpcSocketPaths(ports, root = '/tmp') {
  return ['master', 'volume', 'filer', 's3'].map((service, index) => join(root, `seaweedfs-${service}-grpc-${ports[index]}.sock`));
}

export async function assertSocketPathsUnused(paths) {
  for (const path of paths) {
    try { await lstat(path); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new Error(`Refusing existing derived fixture socket path: ${path}`);
  }
}

export function ownedLoopbackPorts(table, socketInodes) {
  const owned = new Set();
  for (const line of table.split('\n').slice(1)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 10 || fields[3] !== '0A' || !socketInodes.has(fields[9])) continue;
    const [address, hexPort] = fields[1].split(':');
    if (address === '0100007F' && /^[0-9A-Fa-f]{4}$/.test(hexPort)) owned.add(parseInt(hexPort, 16));
  }
  return owned;
}

// /proc/<exact spawned pid>/fd proves which sockets the fixture holds. Its
// network table alone is insufficient: that table includes foreign processes.
// No HTTP requests, unrelated command lines or provider credentials are read.
export async function socketsOwnedBy(pid, ports) {
  if (process.platform !== 'linux') throw new Error('Seaweed fixture requires Linux /proc socket ownership support');
  if (!Number.isSafeInteger(pid) || pid < 1 || !ports.length ||
      ports.some((port) => !Number.isSafeInteger(port) || port < 1 || port > 65535)) {
    throw new Error('Invalid owned fixture PID/ports');
  }
  let descriptors;
  try { descriptors = await readdir(`/proc/${pid}/fd`); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  const inodes = new Set();
  for (const descriptor of descriptors) {
    try {
      const target = await readlink(`/proc/${pid}/fd/${descriptor}`);
      const match = /^socket:\[(\d+)\]$/.exec(target);
      if (match) inodes.add(match[1]);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  let table;
  try { table = await readFile(`/proc/${pid}/net/tcp`, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  const owned = ownedLoopbackPorts(table, inodes);
  return ports.every((port) => owned.has(port));
}

export async function terminateFixture(proc, graceMs = 3000) {
  if (proc.exitCode !== null) { await proc.exited; return; }
  proc.kill('SIGTERM');
  if (await Promise.race([proc.exited.then(() => true), delay(graceMs).then(() => false)])) return;
  proc.kill('SIGKILL');
  if (!await Promise.race([proc.exited.then(() => true), delay(graceMs).then(() => false)])) {
    throw new Error('Owned fixture did not exit; refusing cleanup and retaining scratch data');
  }
}
