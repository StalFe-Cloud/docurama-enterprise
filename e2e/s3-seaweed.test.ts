/// <reference types="bun-types" />

/**
 * S3 object-storage backend E2E — src/lib/document-store.ts (S3 branch) and
 * src/lib/object-store.ts against a REAL SeaweedFS instance (`weed server
 * -s3`), hermetic: the binary is spawned locally on scratch ports, nothing
 * egresses, and the suite is skipped entirely unless S3_E2E=1 and a weed
 * binary is available (run.sh wires both; CI without the binary skips).
 *
 * Run: S3_E2E=1 WEED_BIN=/path/to/weed \
 *      DATABASE_URL=file:/tmp/… bun test e2e/s3-seaweed.test.ts
 *
 * (Own process, like mail.test.ts: it owns DATABASE_URL and the S3_* env,
 * both read at call time by design.)
 *
 * Covers the behaviours operators depend on:
 *  1. env parsing — full config engages S3, partial config degrades to local;
 *  2. uploads land as S3 objects, byte-exact through both read helpers, and
 *     NOTHING leaks to the local STORAGE_DIR (the routing actually routes);
 *  3. every rejection class (NOT_A_PDF / TOO_LARGE / EMPTY) leaves no object;
 *  4. deletion is idempotent; the retention sweep deletes orphaned uploads
 *     but never a document that backs a sent envelope;
 *  5. the storage health probe round-trips through the bucket;
 *  6. S3_AUTO_CREATE_BUCKET=0 surfaces a missing bucket as WRITE_FAILED
 *     instead of silently creating state.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { cpSync, mkdtempSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { createHash } from "node:crypto";
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";

const RUN_S3_E2E = process.env.S3_E2E === "1";
const WEED_BIN = process.env.WEED_BIN || "weed";

/* ── Scratch database (set BEFORE importing the lib: @/lib/db pins it) ─────── */

const SCRATCH = "/tmp/docurama-s3-test.db";
const STORAGE_SCRATCH = mkdtempSync(path.join(tmpdir(), "docurama-s3-storage-"));

if (RUN_S3_E2E) {
  cpSync("db/custom.db", SCRATCH, { force: true });
  process.env.DATABASE_URL = `file:${SCRATCH}`;
  process.env.STORAGE_DIR = STORAGE_SCRATCH;
}

const db = RUN_S3_E2E ? new PrismaClient({ datasources: { db: { url: `file:${SCRATCH}` } } }) : null;

/* ── SeaweedFS lifecycle ───────────────────────────────────────────────────── */

/** Grab a free TCP port (bind :0, read it, release). Small race, fine here. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

type Weed = { s3Port: number; dataDir: string; proc: ReturnType<typeof Bun.spawn> };

async function startWeed(): Promise<Weed> {
  const s3Port = await freePort();
  const dataDir = mkdtempSync(path.join(tmpdir(), "docurama-weed-"));
  // `-ip=127.0.0.1` is load-bearing: without it the filer advertises the LAN
  // IP and volume-server uploads refuse (observed live on 4.47).
  const proc = Bun.spawn(
    [
      WEED_BIN, "server",
      `-dir=${dataDir}`,
      "-ip=127.0.0.1", "-ip.bind=127.0.0.1",
      `-master.port=${s3Port + 1}`,
      `-volume.port=${s3Port + 2}`,
      `-filer.port=${s3Port + 3}`,
      `-s3`, `-s3.port=${s3Port}`,
      "-master.volumeSizeLimitMB=1024",
    ],
    { stdin: "ignore", stdout: "ignore", stderr: "ignore" },
  );

  // Readiness = a REAL S3 exchange (HeadBucket/CreateBucket round-trip), not
  // an HTTP ping: the gateway answers TCP before the filer/volume wiring is
  // complete, and a plain GET / + sleep race was observed failing the first
  // PutObject under load. The probe bucket is separate from the suite's own
  // bucket so the auto-create test still starts from a missing bucket.
  const probeClient = new S3Client({
    endpoint: `http://127.0.0.1:${s3Port}`,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: "probe", secretAccessKey: "probe" },
  });
  const deadline = Date.now() + 45_000;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`weed exited early with code ${proc.exitCode}`);
    try {
      await probeClient.send(new HeadBucketCommand({ Bucket: "docurama-e2e-ready" }));
      return { s3Port, dataDir, proc };
    } catch (err) {
      lastErr = err;
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status === 404) {
        // Gateway is speaking S3 — prove the write path, then ready.
        try {
          await probeClient.send(new CreateBucketCommand({ Bucket: "docurama-e2e-ready" }));
          await probeClient.send(new HeadBucketCommand({ Bucket: "docurama-e2e-ready" }));
          return { s3Port, dataDir, proc };
        } catch (createErr) {
          lastErr = createErr;
        }
      }
    }
    await Bun.sleep(400);
  }
  throw new Error(`SeaweedFS S3 gateway never became ready: ${lastErr}`);
}

let weed: Weed | null = null;
let lib: typeof import("../src/lib/document-store") | null = null;
let objectStore: typeof import("../src/lib/object-store") | null = null;

const BUCKET = "docurama-e2e";

function configureS3Env(bucket: string, autoCreate: string) {
  process.env.S3_ENDPOINT = `http://127.0.0.1:${weed!.s3Port}`;
  process.env.S3_BUCKET = bucket;
  process.env.S3_ACCESS_KEY_ID = "docurama-e2e";
  process.env.S3_SECRET_ACCESS_KEY = "docurama-e2e-secret";
  process.env.S3_REGION = "us-east-1";
  process.env.S3_AUTO_CREATE_BUCKET = autoCreate;
  objectStore?.resetS3ClientCache();
}

const TENANT = "cltesttenant01"; // matches TENANT_ID_RE

const expectedSha = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n9\n%%EOF\n",
  "latin1",
);

async function* chunksOf(buf: Buffer, size = 64 * 1024): AsyncIterable<Uint8Array> {
  for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size);
}

/* ── Suite ─────────────────────────────────────────────────────────────────── */

describe.skipIf(!RUN_S3_E2E)("S3 backend configuration (s3Mode)", () => {
  test("full config engages S3; partial config degrades to local", async () => {
    objectStore = await import("../src/lib/object-store");
    const { s3Mode } = objectStore;

    configureS3Env(BUCKET, "1");
    let mode = s3Mode();
    expect(mode.configured).toBe(true);
    if (mode.configured) {
      expect(mode.endpoint).toBe(`http://127.0.0.1:${weed!.s3Port}`);
      expect(mode.bucket).toBe(BUCKET);
      expect(mode.forcePathStyle).toBe(true);
      expect(mode.autoCreateBucket).toBe(true);
    }

    // Partial: drop the secret → local backend, no half-working S3.
    const saved = process.env.S3_SECRET_ACCESS_KEY;
    delete process.env.S3_SECRET_ACCESS_KEY;
    mode = s3Mode();
    expect(mode.configured).toBe(false);
    process.env.S3_SECRET_ACCESS_KEY = saved;

    // Nothing configured at all → local.
    for (const k of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_REGION", "S3_AUTO_CREATE_BUCKET"]) {
      delete process.env[k as keyof typeof process.env];
    }
    objectStore.resetS3ClientCache();
    mode = s3Mode();
    expect(mode.configured).toBe(false);
  });
});

describe.skipIf(!RUN_S3_E2E)("S3 document storage against real SeaweedFS", () => {
  beforeAll(async () => {
    lib = await import("../src/lib/document-store");
    objectStore = await import("../src/lib/object-store");
    configureS3Env(BUCKET, "1");
  });

  test("storeUpload creates the missing bucket, stores byte-exact, and never touches local disk", async () => {
    const { storeUpload, readDocumentBytes, readStoredBytes, storageBackendMode } = lib!;
    expect(storageBackendMode()).toBe("s3");

    const docId = "doc_" + "ab12cd34".repeat(4);
    const stored = await storeUpload(chunksOf(PDF), TENANT, docId);
    expect(stored.docId).toBe(docId);
    expect(stored.storageKey).toBe(`documents/${TENANT}/${docId}.pdf`);
    expect(stored.byteSize).toBe(PDF.length);
    expect(stored.sha256).toBe(expectedSha(PDF));
    expect(stored.absolutePath).toBe(`s3://${BUCKET}/${stored.storageKey}`);

    // Byte-exact through both read helpers.
    expect(await readDocumentBytes(docId, TENANT)).toEqual(PDF);
    expect(await readStoredBytes(stored.storageKey)).toEqual(PDF);

    // Routing is real: the local STORAGE_DIR stayed empty.
    expect(readdirSync(STORAGE_SCRATCH)).toEqual([]);

    // The object exists under the exact key (raw listing, no lib help).
    const mode = objectStore!.s3Mode();
    if (!mode.configured) throw new Error("s3 mode expected");
    const keys = await objectStore!.s3ListKeys(mode, `documents/${TENANT}/`);
    expect(keys.map((k) => k.key)).toContain(stored.storageKey);
    expect(keys.every((k) => k.lastModified.getTime() > 0)).toBe(true);

    // Leave the bucket as this test found it: later counts are exact.
    await lib!.deleteDocumentFile(docId, TENANT);
  });

  test("rejections never persist an object (NOT_A_PDF / TOO_LARGE / EMPTY)", async () => {
    const { storeUpload, UploadError } = lib!;
    const mode = objectStore!.s3Mode();
    if (!mode.configured) throw new Error("s3 mode expected");

    const before = (await objectStore!.s3ListKeys(mode, "documents/")).length;

    // Not a PDF.
    try {
      await storeUpload(chunksOf(Buffer.from("<html>not a pdf</html>")), TENANT);
      throw new Error("should have been rejected");
    } catch (err) {
      expect(err instanceof UploadError && err.reason === "NOT_A_PDF").toBe(true);
    }

    // Over the 50 MiB cap: a stream that lies via a small first chunk, then
    // keeps yielding (the cap must abort mid-stream, not trust a header).
    try {
      const header = Buffer.from("%PDF-1.4\n");
      async function* liar() {
        yield header;
        const mb = Buffer.alloc(1024 * 1024, 0x61);
        for (let i = 0; i < 51; i++) yield mb;
      }
      await storeUpload(liar(), TENANT);
      throw new Error("should have been rejected");
    } catch (err) {
      expect(err instanceof UploadError && err.reason === "TOO_LARGE").toBe(true);
    }

    // Empty body.
    try {
      await storeUpload(chunksOf(Buffer.alloc(0)), TENANT);
      throw new Error("should have been rejected");
    } catch (err) {
      expect(err instanceof UploadError && err.reason === "EMPTY").toBe(true);
    }

    const after = await objectStore!.s3ListKeys(mode, "documents/");
    expect(after.length).toBe(before); // nothing new landed
  });

  test("deleteDocumentFile is idempotent and removes the object", async () => {
    const { storeUpload, deleteDocumentFile, readDocumentBytes } = lib!;
    const docId = "doc_" + "99887766".repeat(4);
    await storeUpload(chunksOf(PDF), TENANT, docId);
    await deleteDocumentFile(docId, TENANT);
    await deleteDocumentFile(docId, TENANT); // second call: no error
    let rejected = false;
    try {
      await readDocumentBytes(docId, TENANT);
    } catch {
      rejected = true; // NoSuchKey / 404 from the backend
    }
    expect(rejected).toBe(true);
  });

  test("retention sweep deletes orphaned uploads but never envelope-backed evidence", async () => {
    const { storeUpload, purgeExpired } = lib!;

    // FK-safe: rows must hang off real tenant/user records from the seed db.
    const member = await db!.member.findFirst({ select: { userId: true, tenantId: true } });
    expect(member).toBeTruthy();
    const dbTenant = member!.tenantId;

    // Orphan: a Document row with no envelope.
    const orphanId = "doc_" + "0a0b0c0d".repeat(4);
    const orphan = await storeUpload(chunksOf(PDF), TENANT, orphanId);
    await db!.document.create({
      data: {
        id: orphanId,
        tenantId: dbTenant,
        uploadedById: member!.userId,
        filename: "orphan.pdf",
        storageKey: orphan.storageKey,
        byteSize: orphan.byteSize,
        mimeType: "application/pdf",
        pageCount: 1,
        sha256: orphan.sha256,
      },
    });

    // Evidence: a Document row backing a real seeded envelope. Borrow ANY
    // envelope (documentId is restored afterwards, null included) — the old
    // filter `{ documentId: { not: null } }` silently depended on leftover
    // E2E fixture rows in the committed db, which a fresh prisma re-seed
    // legitimately wipes; the sweep must equally protect a document that
    // backs an envelope which never had one.
    const docId = "doc_" + "1e2f3a4b".repeat(4);
    const evidence = await storeUpload(chunksOf(PDF), dbTenant, docId);
    await db!.document.create({
      data: {
        id: docId,
        tenantId: dbTenant,
        uploadedById: member!.userId,
        filename: "evidence.pdf",
        storageKey: evidence.storageKey,
        byteSize: evidence.byteSize,
        mimeType: "application/pdf",
        pageCount: 1,
        sha256: evidence.sha256,
      },
    });
    const envelope = await db!.envelope.findFirst({
      select: { id: true, documentId: true },
    });
    expect(envelope).toBeTruthy();
    await db!.envelope.update({ where: { id: envelope!.id }, data: { documentId: docId } });

    try {
      // ttl 0 + a beat of sleep: both objects are "old", only attachment
      // can save the envelope-backed one.
      await Bun.sleep(50);
      const res = await purgeExpired(0);
      expect(res.scanned).toBeGreaterThanOrEqual(2);
      expect(res.removed).toBe(1);

      // Orphan: row + object gone.
      expect(await db!.document.findUnique({ where: { id: orphanId } })).toBeNull();
      const mode = objectStore!.s3Mode();
      if (!mode.configured) throw new Error("s3 mode expected");
      const keys = (await objectStore!.s3ListKeys(mode, "documents/")).map((k) => k.key);
      expect(keys).not.toContain(orphan.storageKey);

      // Evidence: row + object intact.
      expect(await db!.document.findUnique({ where: { id: docId } })).toBeTruthy();
      expect(keys).toContain(evidence.storageKey);
    } finally {
      await db!.envelope
        .update({ where: { id: envelope!.id }, data: { documentId: envelope!.documentId } })
        .catch(() => undefined);
      await db!.document.delete({ where: { id: docId } }).catch(() => undefined);
      const mode = objectStore!.s3Mode();
      if (mode.configured) await objectStore!.s3DeleteKey(mode, evidence.storageKey).catch(() => undefined);
    }
  });

  test("storage health probe round-trips through the bucket", async () => {
    const { storageHealthProbe } = lib!;
    const probe = await storageHealthProbe();
    expect(probe.backend).toBe("s3");
    expect(probe.ok).toBe(true);
  });

  test("S3_AUTO_CREATE_BUCKET=0 surfaces a missing bucket as WRITE_FAILED", async () => {
    const { storeUpload, UploadError } = lib!;
    configureS3Env("docurama-e2e-fresh-bucket", "0");
    try {
      await storeUpload(chunksOf(PDF), TENANT);
      throw new Error("should have failed");
    } catch (err) {
      expect(err instanceof UploadError && err.reason === "WRITE_FAILED").toBe(true);
    } finally {
      configureS3Env(BUCKET, "1");
    }
  });
});

/* ── Lifecycle ─────────────────────────────────────────────────────────────── */

beforeAll(async () => {
  if (!RUN_S3_E2E) return;
  if (!(await Bun.which(WEED_BIN))) {
    throw new Error(
      `S3_E2E=1 but the SeaweedFS binary was not found (WEED_BIN=${WEED_BIN}). ` +
        `Download it from https://github.com/seaweedfs/seaweedfs/releases or unset S3_E2E to skip.`,
    );
  }
  objectStore = await import("../src/lib/object-store");
  weed = await startWeed();
  configureS3Env(BUCKET, "1");
}, 60_000);

afterAll(async () => {
  if (weed) {
    weed.proc.kill(9); // scratch data — no reason to wait for graceful stop
    await Promise.race([weed.proc.exited, Bun.sleep(3000)]);
    rmSync(weed.dataDir, { recursive: true, force: true });
  }
  if (existsSync(SCRATCH)) rmSync(SCRATCH, { force: true });
  rmSync(STORAGE_SCRATCH, { recursive: true, force: true });
  await db?.$disconnect();
}, 30_000);
