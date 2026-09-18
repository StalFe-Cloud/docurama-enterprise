/**
 * Storage rules for uploaded documents.
 *
 * Ported from the reference app's `preview_store.py` and `upload_validation.py`.
 * Kept out of the API layer for the same reason it was kept out there: the
 * storage policy lives in one place and can be exercised without standing up
 * the web framework.
 *
 * Two rules carry the security weight and neither is negotiable:
 *  1. Every path/key is built from an id this service minted, matched against
 *     a regex, and joined under a root we control. A traversal payload cannot
 *     survive the regex, so it never reaches `path.join` or an object key.
 *  2. The PDF magic bytes are checked on the first chunk, before a single byte
 *     is persisted. A client-declared filename or MIME type proves nothing.
 *
 * Two interchangeable backends sit behind the same policy:
 *   - local filesystem under STORAGE_DIR (default, zero-config, single node)
 *   - S3-compatible object storage (S3_* env — SeaweedFS, MinIO, Garage,
 *     Ceph RGW, AWS S3, Cloudflare R2…), the scale-out / multitenant path.
 * The `storageKey` persisted on the Document row is the SAME relative key on
 * both backends (`documents/{tenantId}/{docId}.pdf`), so a tree can be lifted
 * from disk to object storage with a plain recursive copy.
 */

import { createHash, randomBytes } from "crypto";
import { createWriteStream } from "fs";
import { mkdir, rm, readdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import {
  s3Mode,
  ensureBucket,
  s3GetBytes,
  s3PutBytes,
  s3DeleteKey,
  s3DeleteKeys,
  s3ListKeys,
  type S3Mode,
} from "@/lib/object-store";

/** Uploads are working files for the builder, not envelope records. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Orphaned uploads (never attached to an envelope) expire after a day. */
export const UPLOAD_TTL_SECONDS = 24 * 60 * 60;

/** Content check. A filename extension is not evidence of what a file contains. */
const PDF_MAGIC = Buffer.from("%PDF-", "latin1");

/** doc_<32 hex>, as minted by newDocId(). Anything else cannot reach the filesystem. */
export const DOC_ID_RE = /^doc_[0-9a-f]{32}$/;

/**
 * Tenant ids are Prisma cuids. The regex is deliberately an allowlist of the
 * characters a cuid can contain rather than a cuid grammar: it has to reject
 * `.`, `/` and `\` to make traversal impossible, and being slightly permissive
 * about length costs nothing, while a too-strict grammar would break the day
 * the id generator changes. A valid id is still not an authorisation - callers
 * scope their queries by tenant as well.
 */
export const TENANT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const DOCUMENT_DIR_NAME = "documents";

/** Root of the storage tree. Relative values resolve against the process cwd. */
export function storageDir(): string {
  return path.resolve(process.env.STORAGE_DIR || "./storage");
}

/** Which backend document bytes live on. Reported by /api/health. */
export type StorageBackend = "local" | "s3";

export function storageBackendMode(): StorageBackend {
  return s3Mode().configured ? "s3" : "local";
}

function activeS3(): Extract<S3Mode, { configured: true }> | null {
  const mode = s3Mode();
  return mode.configured ? mode : null;
}

export function isValidTenantId(tenantId: string | null | undefined): boolean {
  return !!tenantId && TENANT_ID_RE.test(tenantId);
}

export function isValidDocId(docId: string | null | undefined): boolean {
  return !!docId && DOC_ID_RE.test(docId);
}

export function newDocId(): string {
  return `doc_${randomBytes(16).toString("hex")}`;
}

/** Per-tenant directory. Throws rather than returning a path for a bad id. */
export function documentRoot(tenantId: string): string {
  if (!isValidTenantId(tenantId)) throw new Error("Invalid tenant id");
  return path.join(storageDir(), DOCUMENT_DIR_NAME, tenantId);
}

/**
 * The key persisted on the Document row. Relative to STORAGE_DIR so the
 * absolute path never leaves the server and the tree can be relocated.
 */
export function documentStorageKey(docId: string, tenantId: string): string {
  if (!isValidDocId(docId)) throw new Error("Invalid document id");
  if (!isValidTenantId(tenantId)) throw new Error("Invalid tenant id");
  return `${DOCUMENT_DIR_NAME}/${tenantId}/${docId}.pdf`;
}

/** Resolve an absolute path, refusing ids this service did not mint. */
export function documentPath(docId: string, tenantId: string): string {
  const root = documentRoot(tenantId);
  if (!isValidDocId(docId)) throw new Error("Invalid document id");
  const resolved = path.join(root, `${docId}.pdf`);
  // Belt and braces. The regexes already make this unreachable, but a path that
  // escaped its root would be the one bug worth catching twice.
  if (!resolved.startsWith(root + path.sep)) throw new Error("Resolved path escaped the storage root");
  return resolved;
}

/** Resolve a stored key back to an absolute path, re-validating both segments. */
export function resolveStorageKey(storageKey: string): string {
  const parts = storageKey.split("/");
  if (parts.length !== 3 || parts[0] !== DOCUMENT_DIR_NAME) throw new Error("Invalid storage key");
  const docId = parts[2].endsWith(".pdf") ? parts[2].slice(0, -4) : "";
  return documentPath(docId, parts[1]);
}

export function looksLikePdf(firstChunk: Uint8Array | Buffer): boolean {
  if (!firstChunk || firstChunk.length < PDF_MAGIC.length) return false;
  return Buffer.from(firstChunk.buffer, firstChunk.byteOffset, PDF_MAGIC.length).equals(PDF_MAGIC);
}

/**
 * Read one document's bytes through the active backend. Callers never touch
 * the filesystem (or the SDK) directly — this is the single read path for
 * page renders, evidence exports and OCR analysis.
 */
export async function readDocumentBytes(docId: string, tenantId: string): Promise<Buffer> {
  if (!isValidDocId(docId)) throw new Error("Invalid document id");
  if (!isValidTenantId(tenantId)) throw new Error("Invalid tenant id");
  const key = documentStorageKey(docId, tenantId);
  const mode = activeS3();
  if (mode) return s3GetBytes(mode, key);
  return readFile(documentPath(docId, tenantId));
}

/** Read by the storageKey persisted on the Document row (either backend). */
export async function readStoredBytes(storageKey: string): Promise<Buffer> {
  const mode = activeS3();
  if (mode) {
    // Same shape check resolveStorageKey applies, without needing a path.
    const parts = storageKey.split("/");
    if (parts.length !== 3 || parts[0] !== DOCUMENT_DIR_NAME) throw new Error("Invalid storage key");
    return s3GetBytes(mode, storageKey);
  }
  return readFile(resolveStorageKey(storageKey));
}

/** Why an upload was refused. The route maps these onto status codes. */
export type UploadRejection = "EMPTY" | "TOO_LARGE" | "NOT_A_PDF" | "WRITE_FAILED";

export class UploadError extends Error {
  reason: UploadRejection;
  constructor(reason: UploadRejection, message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface StoredUpload {
  docId: string;
  storageKey: string;
  absolutePath: string;
  byteSize: number;
  sha256: string;
}

/**
 * Stream an upload to storage, hashing as it goes.
 *
 * The size cap is enforced mid-stream rather than from a Content-Length header,
 * because a header is a claim and the bytes are the fact; a lying header would
 * otherwise let an oversized body fill the disk (local) or be uploaded (S3).
 * On any failure the local partial file is removed; in S3 mode a rejected
 * upload is never Put at all — the object store only ever sees a complete,
 * validated document.
 */
export async function storeUpload(
  source: AsyncIterable<Uint8Array>,
  tenantId: string,
  docId: string = newDocId(),
): Promise<StoredUpload> {
  const mode = activeS3();
  if (mode) return storeUploadS3(mode, source, tenantId, docId);
  return storeUploadLocal(source, tenantId, docId);
}

async function storeUploadLocal(
  source: AsyncIterable<Uint8Array>,
  tenantId: string,
  docId: string,
): Promise<StoredUpload> {
  const absolutePath = documentPath(docId, tenantId);
  await mkdir(path.dirname(absolutePath), { recursive: true });

  const hash = createHash("sha256");
  const handle = createWriteStream(absolutePath);
  let byteSize = 0;
  let checkedMagic = false;

  const write = (chunk: Uint8Array) =>
    new Promise<void>((resolve, reject) => {
      handle.write(chunk, (err) => (err ? reject(err) : resolve()));
    });

  try {
    for await (const chunk of source) {
      if (chunk.length === 0) continue;

      if (!checkedMagic) {
        // First bytes decide it. Rejecting here means an impostor payload is
        // refused before anything of it is persisted.
        if (!looksLikePdf(chunk)) {
          throw new UploadError("NOT_A_PDF", "Upload rejected: payload is not a PDF (magic bytes missing).");
        }
        checkedMagic = true;
      }

      byteSize += chunk.length;
      if (byteSize > MAX_UPLOAD_BYTES) {
        throw new UploadError("TOO_LARGE", `Upload exceeds the ${MAX_UPLOAD_BYTES} byte limit.`);
      }

      hash.update(chunk);
      await write(chunk);
    }

    if (byteSize === 0) throw new UploadError("EMPTY", "Upload rejected: empty body.");

    await new Promise<void>((resolve, reject) => {
      handle.end(() => resolve());
      handle.on("error", reject);
    });

    return {
      docId,
      storageKey: documentStorageKey(docId, tenantId),
      absolutePath,
      byteSize,
      sha256: hash.digest("hex"),
    };
  } catch (err) {
    handle.destroy();
    await rm(absolutePath, { force: true }).catch(() => undefined);
    if (err instanceof UploadError) throw err;
    throw new UploadError("WRITE_FAILED", "Upload could not be written to storage.");
  }
}

/**
 * S3 variant of storeUpload. Same validation semantics — magic bytes on the
 * first chunk decide before anything is persisted, the size cap aborts
 * mid-stream, the hash is computed as chunks arrive. Only then does a single
 * PutObject land the object, so a rejected upload leaves no trace.
 *
 * Buffers up to MAX_UPLOAD_BYTES in memory rather than spooling to a temp
 * file: 50 MiB of peak memory per concurrent upload is a fair trade for not
 * writing validated bytes to the node's disk on the way to object storage.
 */
async function storeUploadS3(
  mode: Extract<S3Mode, { configured: true }>,
  source: AsyncIterable<Uint8Array>,
  tenantId: string,
  docId: string,
): Promise<StoredUpload> {
  const storageKey = documentStorageKey(docId, tenantId);
  const hash = createHash("sha256");
  const chunks: Buffer[] = [];
  let byteSize = 0;
  let checkedMagic = false;

  try {
    for await (const chunk of source) {
      if (chunk.length === 0) continue;

      if (!checkedMagic) {
        if (!looksLikePdf(chunk)) {
          throw new UploadError("NOT_A_PDF", "Upload rejected: payload is not a PDF (magic bytes missing).");
        }
        checkedMagic = true;
      }

      byteSize += chunk.length;
      if (byteSize > MAX_UPLOAD_BYTES) {
        throw new UploadError("TOO_LARGE", `Upload exceeds the ${MAX_UPLOAD_BYTES} byte limit.`);
      }

      hash.update(chunk);
      chunks.push(Buffer.from(chunk));
    }

    if (byteSize === 0) throw new UploadError("EMPTY", "Upload rejected: empty body.");

    await ensureBucket(mode);
    await s3PutBytes(mode, storageKey, Buffer.concat(chunks), "application/pdf");

    return {
      docId,
      storageKey,
      absolutePath: `s3://${mode.bucket}/${storageKey}`,
      byteSize,
      sha256: hash.digest("hex"),
    };
  } catch (err) {
    if (err instanceof UploadError) throw err;
    throw new UploadError("WRITE_FAILED", "Upload could not be written to object storage.");
  }
}

/** Remove a document's bytes. Missing files are not an error - deletion is idempotent. */
export async function deleteDocumentFile(docId: string, tenantId: string): Promise<void> {
  const mode = activeS3();
  if (mode) {
    if (!isValidDocId(docId) || !isValidTenantId(tenantId)) return;
    await s3DeleteKey(mode, documentStorageKey(docId, tenantId)).catch(() => undefined);
    return;
  }
  await rm(documentPath(docId, tenantId), { force: true }).catch(() => undefined);
}

export interface PurgeResult {
  scanned: number;
  removed: number;
}

/**
 * Drop uploads that were never attached to an envelope so working files cannot
 * accumulate forever.
 *
 * Attachment, not age alone, is the test: a document that backs a sent envelope
 * is evidence and must survive however old it is. Anything in storage whose row
 * is gone is orphaned by definition and goes too.
 *
 * Local mode walks the tree with readdir; S3 mode lists the `documents/`
 * prefix. Same rules, same semantics, either backend.
 */
export async function purgeExpired(ttlSeconds: number = UPLOAD_TTL_SECONDS): Promise<PurgeResult> {
  const mode = activeS3();
  if (mode) return purgeExpiredS3(mode, ttlSeconds);

  const cutoff = Date.now() - ttlSeconds * 1000;
  const root = path.join(storageDir(), DOCUMENT_DIR_NAME);
  const result: PurgeResult = { scanned: 0, removed: 0 };

  let tenants: string[];
  try {
    tenants = await readdir(root);
  } catch {
    return result; // Nothing stored yet.
  }

  for (const tenantId of tenants) {
    if (!isValidTenantId(tenantId)) continue;
    let files: string[];
    try {
      files = await readdir(path.join(root, tenantId));
    } catch {
      continue;
    }

    for (const name of files) {
      if (!name.startsWith("doc_") || !name.endsWith(".pdf")) continue;
      const docId = name.slice(0, -4);
      if (!isValidDocId(docId)) continue;

      const filePath = path.join(root, tenantId, name);
      result.scanned++;
      try {
        const info = await stat(filePath);
        if (info.mtimeMs >= cutoff) continue;
      } catch {
        continue;
      }

      const row = await db.document
        .findUnique({ where: { id: docId }, select: { id: true, _count: { select: { envelopes: true } } } })
        .catch(() => null);
      if (row && row._count.envelopes > 0) continue;

      await rm(filePath, { force: true }).catch(() => undefined);
      if (row) await db.document.delete({ where: { id: docId } }).catch(() => undefined);
      result.removed++;
    }
  }

  return result;
}

async function purgeExpiredS3(
  mode: Extract<S3Mode, { configured: true }>,
  ttlSeconds: number,
): Promise<PurgeResult> {
  const cutoff = Date.now() - ttlSeconds * 1000;
  const result: PurgeResult = { scanned: 0, removed: 0 };

  let objects;
  try {
    objects = await s3ListKeys(mode, `${DOCUMENT_DIR_NAME}/`);
  } catch {
    return result; // Backend unreachable — nothing to sweep, no reason to crash.
  }

  const doomed: string[] = [];
  for (const obj of objects) {
    const parts = obj.key.split("/");
    if (parts.length !== 3 || parts[0] !== DOCUMENT_DIR_NAME) continue;
    const name = parts[2];
    if (!name.startsWith("doc_") || !name.endsWith(".pdf")) continue;
    const docId = name.slice(0, -4);
    if (!isValidDocId(docId) || !isValidTenantId(parts[1])) continue;

    result.scanned++;
    if (obj.lastModified.getTime() >= cutoff) continue;

    const row = await db.document
      .findUnique({ where: { id: docId }, select: { id: true, _count: { select: { envelopes: true } } } })
      .catch(() => null);
    if (row && row._count.envelopes > 0) continue;

    doomed.push(obj.key);
    if (row) await db.document.delete({ where: { id: docId } }).catch(() => undefined);
  }

  if (doomed.length > 0) {
    await s3DeleteKeys(mode, doomed).catch(() => undefined);
    result.removed = doomed.length;
  }
  return result;
}

/**
 * Storage reachability probe for /api/health and the admin restore drill:
 * proves the WRITE path, not just that a directory exists. Local backend
 * writes+removes a probe file; S3 backend round-trips a probe object.
 */
export async function storageHealthProbe(): Promise<{
  backend: StorageBackend;
  ok: boolean;
  error?: string;
}> {
  const backend = storageBackendMode();
  try {
    if (backend === "s3") {
      const mode = s3Mode();
      if (!mode.configured) throw new Error("unreachable");
      const probeKey = `.health-probe`;
      const body = Buffer.from(`${Date.now()}
`);
      await ensureBucket(mode);
      await s3PutBytes(mode, probeKey, body, "text/plain");
      const back = await s3GetBytes(mode, probeKey);
      if (!back.equals(body)) throw new Error("probe round-trip mismatch");
      await s3DeleteKey(mode, probeKey);
    } else {
      const dir = storageDir();
      const probe = path.join(dir, ".health-probe");
      await mkdir(dir, { recursive: true });
      await writeFile(probe, `${Date.now()}
`);
      await rm(probe, { force: true });
    }
    return { backend, ok: true };
  } catch (err) {
    return { backend, ok: false, error: err instanceof Error ? err.message : "not writable" };
  }
}
