import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns/promises';
import ts from 'typescript';

// All servers bind 127.0.0.1. DNS is replaced only in these isolated test
// processes; no production function gains an injectable trust/verification bypass.
const scratch = mkdtempSync(join(tmpdir(), 'docurama-webhook-network-'));
const compiled = join(scratch, 'safe-webhook-http.cjs');
const childFile = join(scratch, 'local-client.cjs');
const require = createRequire(import.meta.url);
let transport;
let caFile;
let valid;
let wrongName;

function openssl(args) {
  execFileSync('openssl', args, { cwd: scratch, stdio: 'pipe', timeout: 20_000 });
}
function certificate(name, hostname) {
  openssl(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', `/CN=${hostname}`]);
  writeFileSync(join(scratch, `${name}.ext`), `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:${hostname}\n`);
  openssl(['x509', '-req', '-in', `${name}.csr`, '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', `${name}.pem`, '-days', '1', '-sha256', '-extfile', `${name}.ext`]);
  return { key: readFileSync(join(scratch, `${name}.key`)), cert: readFileSync(join(scratch, `${name}.pem`)) };
}

before(() => {
  const output = ts.transpileModule(readFileSync(resolve('src/lib/safe-webhook-http.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  writeFileSync(compiled, output.outputText);
  transport = require(compiled);
  openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-days', '1', '-sha256', '-subj', '/CN=Docurama isolated test CA', '-addext', 'basicConstraints=critical,CA:TRUE']);
  caFile = join(scratch, 'ca.pem');
  valid = certificate('valid', 'receiver.example.test');
  wrongName = certificate('wrong-name', 'wrong.example.test');
  writeFileSync(childFile, `
const dns = require('node:dns/promises');
const target = new URL(process.argv[3]);
if (process.env.DOCURAMA_LOCAL_NETWORK_TEST !== '1' || target.hostname !== 'receiver.example.test') throw new Error('Local fixture only');
let lookups = 0;
dns.lookup = async () => [{ address: ++lookups === 1 ? '127.0.0.1' : '127.0.0.2', family: 4 }];
process.env.NODE_ENV = 'production';
process.env.DOCURAMA_WEBHOOK_INTERNAL_ORIGINS = target.origin;
delete process.env.DOCURAMA_ALLOW_PRIVATE_WEBHOOKS;
const { postWebhook } = require(process.argv[2]);
postWebhook(target.href, '{"fixture":"payload"}', { host: 'wrong.example.test', HOST: 'also-wrong.example.test', 'content-length': '1' })
.then((result) => console.log(JSON.stringify({ ok: true, statusCode: result.statusCode, lookups })),
(error) => console.log(JSON.stringify({ ok: false, error: String(error.message || error), code: error.code, lookups })));
`);
});

after(() => { rmSync(scratch, { recursive: true, force: true }); });

function invoke(runtime, url, trust = true) {
  const env = { ...process.env, DOCURAMA_LOCAL_NETWORK_TEST: '1', NODE_TLS_REJECT_UNAUTHORIZED: '1' };
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'NODE_USE_ENV_PROXY']) delete env[key];
  if (trust) env.NODE_EXTRA_CA_CERTS = caFile; else delete env.NODE_EXTRA_CA_CERTS;
  return new Promise((resolveResult, reject) => {
    const child = spawn(runtime === 'node' ? process.execPath : 'bun', [childFile, compiled, url], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let errors = '';
    child.stdout.setEncoding('utf8').on('data', (part) => { output += part; });
    child.stderr.setEncoding('utf8').on('data', (part) => { errors += part; });
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`Fixture client exceeded its deadline: ${errors}`)); }, 14_000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) { reject(new Error(`Fixture client exited ${code}: ${errors}`)); return; }
      try { resolveResult(JSON.parse(output.trim().split('\n').at(-1))); }
      catch { reject(new Error(`Invalid fixture output: ${output} ${errors}`)); }
    });
  });
}

async function receiver(options, mode, work) {
  const received = [];
  const handler = (request, response) => {
    let body = '';
    request.setEncoding('utf8').on('data', (part) => { body += part; });
    request.on('end', () => {
      received.push({ host: request.headers.host, body, servername: request.socket.servername });
      response.on('error', () => undefined);
      if (mode === 'redirect') {
        response.writeHead(302, { location: '/redirect-must-not-be-followed' });
        response.end();
      } else if (mode === 'oversized') {
        response.writeHead(200, { 'content-length': 512 * 1024 });
        response.end(Buffer.alloc(512 * 1024));
      } else if (mode === 'stalled') {
        response.writeHead(200);
        response.write('partial');
      } else { response.end('accepted'); }
    });
  };
  const server = options ? https.createServer(options, handler) : http.createServer(handler);
  await new Promise((resolveReady, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveReady); });
  const address = server.address();
  const url = `${options ? 'https' : 'http'}://receiver.example.test:${address.port}/hooks`;
  try { await work(url, received); }
  finally {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
}

// These checks perform no outbound connections.
test('private, mapped, link-local, metadata and reserved addresses are rejected', () => {
  for (const ip of ['0.0.0.0', '10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '168.63.129.16', '192.0.2.1', '198.18.0.1', '224.0.0.1', '255.255.255.255', '::', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:c0a8:101', '2001:db8::1', '2002:7f00:1::', '3fff::1']) {
    assert.equal(transport.isPublicAddress(ip), false, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(transport.isPublicAddress(ip), true, ip);
});

test('URL credentials, fragments, alternate loopback notation and unapproved ports fail closed', async () => {
  const saved = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.DOCURAMA_WEBHOOK_INTERNAL_ORIGINS;
    delete process.env.DOCURAMA_WEBHOOK_ALLOWED_PORTS;
    for (const url of ['http://8.8.8.8/hook', 'ftp://8.8.8.8/hook', 'https://user:pass@8.8.8.8/hook', 'https://8.8.8.8/#fragment', 'https://127.1/hook', 'https://0x7f000001/hook', 'https://[::ffff:7f00:1]/hook', 'https://service.internal/hook', 'https://8.8.8.8:8443/hook']) {
      await assert.rejects(transport.resolveWebhookTarget(url), undefined, url);
    }
  } finally {
    for (const key of ['NODE_ENV', 'DOCURAMA_WEBHOOK_INTERNAL_ORIGINS', 'DOCURAMA_WEBHOOK_ALLOWED_PORTS']) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});

test('mixed public/private DNS answers are rejected before connection', async () => {
  const original = dns.lookup;
  dns.lookup = async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }];
  try { await assert.rejects(transport.resolveWebhookTarget('https://mixed.example.test'), /exclusively to public/); }
  finally { dns.lookup = original; }
});

test('cancellation applies before and during DNS resolution', async () => {
  const original = dns.lookup;
  let calls = 0;
  dns.lookup = async () => { calls++; return new Promise(() => undefined); };
  try {
    const early = AbortSignal.abort(new Error('cancelled before DNS'));
    await assert.rejects(transport.resolveWebhookTarget('https://cancel.example.test', early), /cancelled before DNS/);
    assert.equal(calls, 0);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('cancelled during DNS')), 20);
    try { await assert.rejects(transport.resolveWebhookTarget('https://cancel.example.test', controller.signal), /cancelled during DNS/); }
    finally { clearTimeout(timer); }
    assert.equal(calls, 1);
  } finally { dns.lookup = original; }
});

for (const runtime of ['node', 'bun']) {
  test(`${runtime}: TLS uses the original hostname and the validated IP without resolving again`, async () => {
    await receiver(valid, 'normal', async (url, received) => {
      const result = await invoke(runtime, url);
      assert.equal(result.ok, true, result.error);
      assert.equal(result.lookups, 1);
      assert.equal(received.length, 1);
      assert.equal(received[0].host, new URL(url).host);
      assert.equal(received[0].body, '{"fixture":"payload"}');
      assert.equal(received[0].servername, 'receiver.example.test');
    });
  });
  test(`${runtime}: a trusted certificate for the wrong hostname is rejected`, async () => {
    await receiver(wrongName, 'normal', async (url, received) => {
      assert.equal((await invoke(runtime, url)).ok, false);
      assert.equal(received.length, 0);
    });
  });
  test(`${runtime}: an untrusted certificate authority is rejected`, async () => {
    await receiver(valid, 'normal', async (url, received) => {
      assert.equal((await invoke(runtime, url, false)).ok, false);
      assert.equal(received.length, 0);
    });
  });
  test(`${runtime}: redirects are not followed`, async () => {
    await receiver(null, 'redirect', async (url, received) => {
      assert.equal((await invoke(runtime, url)).ok, false);
      assert.equal(received.length, 1);
    });
  });
  test(`${runtime}: oversized response bodies are bounded without resending the payload`, async () => {
    await receiver(null, 'oversized', async (url, received) => {
      assert.equal((await invoke(runtime, url)).ok, true);
      assert.equal(received.length, 1);
    });
  });
  test(`${runtime}: a stalled response cannot outlive the transport deadline`, async () => {
    await receiver(null, 'stalled', async (url, received) => {
      const started = Date.now();
      assert.equal((await invoke(runtime, url)).ok, false);
      assert(Date.now() - started < 13_000);
      assert.equal(received.length, 1);
    });
  });
}
