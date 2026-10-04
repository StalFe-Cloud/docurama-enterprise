/// <reference types="bun-types" />
/** Real, local SeaweedFS integration. S3_E2E=1 requires a working fixture;
 * setup failures fail the suite rather than silently switching to local disk. */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { S3Client, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { assertS3LifecycleSafe } from "./isolation.mjs";
import { reserveFixturePorts, socketsOwnedBy, terminateFixture, grpcSocketPaths, assertSocketPathsUnused, seaweedEnvironment, localFilerConfiguration } from "./seaweed-isolation.mjs";

const RUN_S3_E2E = process.env.S3_E2E === "1";
const WEED_BIN = process.env.WEED_BIN || "weed";
if (RUN_S3_E2E) assertS3LifecycleSafe(WEED_BIN);
/** Bun.spawn on Windows drops backslashes from arguments (weed sees
 * -mdir="C:Users…" and exits 255), and file: URLs are cleaner with '/'.
 * Everything that crosses a process boundary uses forward slashes. */
const posix = (p: string) => p.replace(/\\/g, "/");
const SCRATCH_DIR = mkdtempSync(path.join(tmpdir(), "docurama-s3-test-"));
const SCRATCH = path.join(SCRATCH_DIR, "fixture.db");
const STORAGE_SCRATCH = mkdtempSync(path.join(tmpdir(), "docurama-s3-storage-"));
if (RUN_S3_E2E) {
  if (!process.env.E2E_FIXTURE_DB) throw new Error("S3 E2E requires the migrated scratch fixture from e2e/run.sh");
  cpSync(process.env.E2E_FIXTURE_DB, SCRATCH);
  process.env.DATABASE_URL = `file:${posix(SCRATCH)}`;
  process.env.STORAGE_DIR = posix(STORAGE_SCRATCH);
}
const db = RUN_S3_E2E ? new PrismaClient({ datasources: { db: { url: `file:${posix(SCRATCH)}` } } }) : null;

type Weed = { s3Port: number; dataDir: string; proc: ReturnType<typeof Bun.spawn>;
  accessKeyId: string; secretAccessKey: string; logsDone: Promise<void>[] };
async function startWeed(): Promise<Weed> {
  const leases = await reserveFixturePorts();
  const ports = leases.map((lease) => lease.port);
  const [s3Port, masterPort, volumePort, filerPort, masterGrpc, volumeGrpc, filerGrpc, s3Grpc] = ports;
  const unreleased = [...leases];
  let dataDir = "";
  let proc: ReturnType<typeof Bun.spawn> | undefined;
  let probe: S3Client | undefined;
  let logTail = "";
  const logsDone: Promise<void>[] = [];
  const accessKeyId = randomBytes(16).toString("hex");
  const secretAccessKey = randomBytes(32).toString("hex");
  const capture = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        logTail = (logTail + Buffer.from(value).toString("utf8")).slice(-65536);
      }
    } finally { reader.releaseLock(); }
  };
  let lastError: unknown;
  try {
    dataDir = mkdtempSync(path.join(tmpdir(), "docurama-weed-"));
    const executable = Bun.which(WEED_BIN);
    if (!executable) throw new Error("Configured SeaweedFS executable is unavailable");
    // Shadow every configuration file this server loads before global search
    // paths can contribute external storage/auth settings. Child HOME and cwd
    // also point at this owned directory; WEED_* settings are scrubbed.
    writeFileSync(path.join(dataDir, "filer.toml"), localFilerConfiguration(dataDir));
    for (const name of ["security.toml", "master.toml"]) writeFileSync(path.join(dataDir, name), "# isolated fixture\n");
    const config = path.join(dataDir, "s3.json");
    writeFileSync(config, JSON.stringify({ identities: [{ name: "isolated-e2e",
      credentials: [{ accessKey: accessKeyId, secretKey: secretAccessKey }],
      actions: ["Admin", "Read", "List", "Tagging", "Write"] }] }), { mode: 0o600 });
    // Seaweed derives additional Unix gRPC names from these ports. Refuse
    // pre-existing paths instead of letting its startup unlink a foreign file.
    await assertSocketPathsUnused(grpcSocketPaths([masterGrpc, volumeGrpc, filerGrpc, s3Grpc]));
    // Port handoff can race. No network request is authorized until the kernel
    // proves this exact spawned PID owns ALL eight loopback listener sockets.
    while (unreleased.length) await unreleased.pop()!.release();
    const launched = Bun.spawn([executable, `-config_dir=${posix(dataDir)}`, "server", `-dir=${posix(dataDir)}`, "-ip=127.0.0.1", "-ip.bind=127.0.0.1",
      `-master.port=${masterPort}`, `-volume.port=${volumePort}`, `-filer.port=${filerPort}`,
      `-master.port.grpc=${masterGrpc}`, `-volume.port.grpc=${volumeGrpc}`, `-filer.port.grpc=${filerGrpc}`,
      "-s3", `-s3.port=${s3Port}`, `-s3.port.grpc=${s3Grpc}`, `-s3.config=${posix(config)}`,
      `-filer.localSocket=${posix(path.join(dataDir, "filer.sock"))}`,
      `-s3.localSocket=${posix(path.join(dataDir, "s3.sock"))}`,
      "-s3.port.iceberg=0", "-s3.port.lance=0", "-master.telemetry=false", "-master.volumeSizeLimitMB=1024"],
      { cwd: dataDir, env: seaweedEnvironment(process.env, dataDir), stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    proc = launched;
    logsDone.push(capture(launched.stdout).catch((error) => { logTail += `stdout capture: ${error}`; }),
      capture(launched.stderr).catch((error) => { logTail += `stderr capture: ${error}`; }));
    probe = new S3Client({ endpoint: `http://127.0.0.1:${s3Port}`, region: "us-east-1",
      forcePathStyle: true, maxAttempts: 1, credentials: { accessKeyId, secretAccessKey } });
    const requireOwnership = async () => {
      if (proc!.exitCode !== null || !await socketsOwnedBy(proc!.pid, ports)) {
        throw new Error("Owned SeaweedFS listener proof lost; refusing S3 request");
      }
    };
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (proc.exitCode !== null) throw new Error(`SeaweedFS exited early: ${proc.exitCode}`);
      if (!await socketsOwnedBy(proc.pid, ports)) { await Bun.sleep(400); continue; }
      try {
        await requireOwnership();
        await probe.send(new HeadBucketCommand({ Bucket: "docurama-e2e-ready" }), { abortSignal: AbortSignal.timeout(2000) });
        return { s3Port, dataDir, proc, accessKeyId, secretAccessKey, logsDone };
      } catch (error) {
        lastError = error;
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
          try {
            await requireOwnership();
            await probe.send(new CreateBucketCommand({ Bucket: "docurama-e2e-ready" }), { abortSignal: AbortSignal.timeout(2000) });
            await requireOwnership();
            await probe.send(new HeadBucketCommand({ Bucket: "docurama-e2e-ready" }), { abortSignal: AbortSignal.timeout(2000) });
            return { s3Port, dataDir, proc, accessKeyId, secretAccessKey, logsDone };
          } catch (createError) { lastError = createError; }
        }
      }
      await Bun.sleep(400);
    }
    throw new Error(`SeaweedFS S3 gateway never became ready: ${lastError}`);
  } catch (error) {
    if (proc) await terminateFixture(proc); // If exit cannot be confirmed, retain data.
    await Promise.all(logsDone);
    if (logTail) console.error(logTail);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    throw error;
  } finally {
    probe?.destroy();
    while (unreleased.length) await unreleased.pop()!.release();
  }
}

let weed: Weed | null = null;
let lib: typeof import("../src/lib/document-store");
let objectStore: typeof import("../src/lib/object-store");
let startup: Promise<void> | undefined;
const BUCKET = "docurama-e2e";
const TENANT = "cltesttenant01";
function configureS3Env(bucket: string, autoCreate: string) {
  if (!weed) throw new Error("SeaweedFS fixture has not completed initialization");
  process.env.S3_ENDPOINT = `http://127.0.0.1:${weed.s3Port}`;
  process.env.S3_BUCKET = bucket;
  process.env.S3_ACCESS_KEY_ID = weed.accessKeyId;
  process.env.S3_SECRET_ACCESS_KEY = weed.secretAccessKey;
  process.env.S3_REGION = "us-east-1";
  process.env.S3_AUTO_CREATE_BUCKET = autoCreate;
  objectStore?.resetS3ClientCache();
}
function setup(): Promise<void> {
  return startup ??= (async () => {
    if (!RUN_S3_E2E) return;
    if (!Bun.which(WEED_BIN)) throw new Error(`S3_E2E=1 requires the SeaweedFS binary: ${WEED_BIN}`);
    objectStore = await import("../src/lib/object-store");
    weed = await startWeed();
    configureS3Env(BUCKET, "1");
    lib = await import("../src/lib/document-store");
  })();
}

// Register root lifecycle before nested suites. Each nested fixture also awaits
// the same startup promise, so Bun versions with different hook ordering cannot
// run configureS3Env while weed is still null.
beforeAll(setup, 60_000);
afterAll(async () => {
  objectStore?.resetS3ClientCache();
  await db?.$disconnect();
  if (RUN_S3_E2E && lib) await (await import("../src/lib/db")).db.$disconnect();
  if (weed) {
    await terminateFixture(weed.proc);
    await Promise.all(weed.logsDone);
    rmSync(weed.dataDir, { recursive: true, force: true });
  }
  rmSync(SCRATCH_DIR, { recursive: true, force: true });
  rmSync(STORAGE_SCRATCH, { recursive: true, force: true });
}, 30_000);

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n9\n%%EOF\n", "latin1");
async function* chunksOf(bytes: Buffer): AsyncIterable<Uint8Array> {
  for (let index = 0; index < bytes.length; index += 64 * 1024) yield bytes.subarray(index, index + 64 * 1024);
}

describe.skipIf(!RUN_S3_E2E)("S3 backend configuration (s3Mode)", () => {
  beforeAll(setup, 60_000);
  test("full config engages S3; partial config fails closed", async () => {
    configureS3Env(BUCKET, "1");
    const mode = objectStore.s3Mode();
    expect(mode.configured).toBe(true);
    if (!mode.configured) throw new Error("S3 mode expected");
    expect(mode.endpoint).toBe(`http://127.0.0.1:${weed!.s3Port}`);
    expect(mode.bucket).toBe(BUCKET);
    expect(mode.forcePathStyle).toBe(true);
    expect(mode.autoCreateBucket).toBe(true);
    const saved = process.env.S3_SECRET_ACCESS_KEY;
    try {
      delete process.env.S3_SECRET_ACCESS_KEY;
      expect(() => objectStore.s3Mode()).toThrow("complete static credential pair");
    } finally { process.env.S3_SECRET_ACCESS_KEY = saved; }
    for (const key of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_REGION", "S3_AUTO_CREATE_BUCKET"]) delete process.env[key];
    objectStore.resetS3ClientCache();
    expect(objectStore.s3Mode().configured).toBe(false);
  });
});

describe.skipIf(!RUN_S3_E2E)("S3 document storage against real SeaweedFS", () => {
  beforeAll(async () => { await setup(); configureS3Env(BUCKET, "1"); }, 60_000);
  test("storeUpload creates the missing bucket, stores byte-exact, and never touches local disk", async () => {
    expect(lib.storageBackendMode()).toBe("s3");
    const docId = "doc_" + "ab12cd34".repeat(4);
    const stored = await lib.storeUpload(chunksOf(PDF), TENANT, docId);
    expect(stored.docId).toBe(docId);
    expect(stored.storageKey).toBe(`documents/${TENANT}/${docId}.pdf`);
    expect(stored.byteSize).toBe(PDF.length);
    expect(stored.sha256).toBe(createHash("sha256").update(PDF).digest("hex"));
    expect(stored.absolutePath).toBe(`s3://${BUCKET}/${stored.storageKey}`);
    expect(await lib.readDocumentBytes(docId, TENANT)).toEqual(PDF);
    expect(await lib.readStoredBytes(stored.storageKey)).toEqual(PDF);
    expect(readdirSync(STORAGE_SCRATCH)).toEqual([]);
    const mode = objectStore.s3Mode();
    if (!mode.configured) throw new Error("S3 mode expected");
    const keys = await objectStore.s3ListKeys(mode, `documents/${TENANT}/`);
    expect(keys.map((item) => item.key)).toContain(stored.storageKey);
    expect(keys.every((item) => item.lastModified.getTime() > 0)).toBe(true);
    await lib.deleteDocumentFile(docId, TENANT);
  });

  test("rejections never persist an object (NOT_A_PDF / TOO_LARGE / EMPTY)", async () => {
    const mode = objectStore.s3Mode();
    if (!mode.configured) throw new Error("S3 mode expected");
    const before = (await objectStore.s3ListKeys(mode, "documents/")).length;
    async function assertRejected(stream: AsyncIterable<Uint8Array>, reason: string) {
      let failure: unknown;
      try { await lib.storeUpload(stream, TENANT); } catch (error) { failure = error; }
      expect(failure instanceof lib.UploadError && failure.reason === reason).toBe(true);
    }
    await assertRejected(chunksOf(Buffer.from("<html>not a pdf</html>")), "NOT_A_PDF");
    async function* excessive() {
      yield Buffer.from("%PDF-1.4\n");
      const mb = Buffer.alloc(1024 * 1024, 0x61);
      for (let index = 0; index < 51; index++) yield mb;
    }
    await assertRejected(excessive(), "TOO_LARGE");
    await assertRejected(chunksOf(Buffer.alloc(0)), "EMPTY");
    expect((await objectStore.s3ListKeys(mode, "documents/")).length).toBe(before);
  });

  test("deleteDocumentFile is idempotent and removes the object", async () => {
    const docId = "doc_" + "99887766".repeat(4);
    await lib.storeUpload(chunksOf(PDF), TENANT, docId);
    await lib.deleteDocumentFile(docId, TENANT);
    await lib.deleteDocumentFile(docId, TENANT);
    await expect(lib.readDocumentBytes(docId, TENANT)).rejects.toThrow();
  });

  test("retention sweep deletes orphaned uploads but never envelope-backed evidence", async () => {
    const member = await db!.member.findFirstOrThrow({ select: { userId: true, tenantId: true } });
    const orphanId = "doc_" + "0a0b0c0d".repeat(4);
    const orphan = await lib.storeUpload(chunksOf(PDF), TENANT, orphanId);
    await db!.document.create({ data: { id: orphanId, tenantId: member.tenantId, uploadedById: member.userId,
      filename: "orphan.pdf", storageKey: orphan.storageKey, byteSize: orphan.byteSize, mimeType: "application/pdf", pageCount: 1, sha256: orphan.sha256 } });
    const docId = "doc_" + "1e2f3a4b".repeat(4);
    const evidence = await lib.storeUpload(chunksOf(PDF), member.tenantId, docId);
    await db!.document.create({ data: { id: docId, tenantId: member.tenantId, uploadedById: member.userId,
      filename: "evidence.pdf", storageKey: evidence.storageKey, byteSize: evidence.byteSize, mimeType: "application/pdf", pageCount: 1, sha256: evidence.sha256 } });
    const envelope = await db!.envelope.findFirstOrThrow({ select: { id: true, documentId: true } });
    await db!.envelope.update({ where: { id: envelope.id }, data: { documentId: docId } });
    try {
      await Bun.sleep(50);
      const result = await lib.purgeExpired(0);
      expect(result.scanned).toBeGreaterThanOrEqual(2);
      expect(result.removed).toBe(1);
      expect(await db!.document.findUnique({ where: { id: orphanId } })).toBeNull();
      const mode = objectStore.s3Mode();
      if (!mode.configured) throw new Error("S3 mode expected");
      const keys = (await objectStore.s3ListKeys(mode, "documents/")).map((item) => item.key);
      expect(keys).not.toContain(orphan.storageKey);
      expect(keys).toContain(evidence.storageKey);
      expect(await db!.document.findUnique({ where: { id: docId } })).not.toBeNull();
    } finally {
      await db!.envelope.update({ where: { id: envelope.id }, data: { documentId: envelope.documentId } });
      await db!.document.deleteMany({ where: { id: { in: [docId, orphanId] } } });
      await lib.deleteDocumentFile(docId, member.tenantId);
      await lib.deleteDocumentFile(orphanId, TENANT);
    }
  });

  test("storage health probe round-trips through the bucket", async () => {
    const probe = await lib.storageHealthProbe();
    expect(probe.backend).toBe("s3");
    expect(probe.ok).toBe(true);
  });

  test("S3_AUTO_CREATE_BUCKET=0 surfaces a missing bucket as WRITE_FAILED", async () => {
    configureS3Env("docurama-e2e-fresh-bucket", "0");
    let failure: unknown;
    try { await lib.storeUpload(chunksOf(PDF), TENANT); } catch (error) { failure = error; }
    finally { configureS3Env(BUCKET, "1"); }
    expect(failure instanceof lib.UploadError && failure.reason === "WRITE_FAILED").toBe(true);
  });
});
