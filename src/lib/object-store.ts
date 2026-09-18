/**
 * S3-compatible object storage — the multitenant / scale-out backend for
 * uploaded documents (STORAGE-OPTIONS.md has the full landscape).
 *
 * Design mirrors src/lib/mail.ts:
 *   - Configuration is env-driven and read AT CALL TIME (test-friendly,
 *     hot-reloadable, and a partial config degrades loudly-but-safely).
 *   - All-or-nothing: S3_BUCKET + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY
 *     must ALL be set, otherwise the app stays on the local filesystem
 *     backend and a single console.warn explains why. A half-configured
 *     production must never half-work.
 *   - forcePathStyle defaults to true when a custom endpoint is set — every
 *     self-hostable engine (SeaweedFS, MinIO, Garage, Ceph RGW) and
 *     Cloudflare R2 need it; AWS native S3 gets the default (false).
 *
 * The AWS SDK is imported LAZILY on first use: the local-filesystem default
 * never loads (or compiles, in dev) a megabyte of SDK it doesn't touch.
 *
 * Verified against SeaweedFS 4.47 (`weed server -s3`): static credentials,
 * CreateBucket/HeadBucket/Put/Get/Delete/ListObjectsV2 all work; e2e/
 * s3-seaweed.test.ts drives this module against the real binary.
 */

import type { S3Client } from "@aws-sdk/client-s3";

type S3Sdk = typeof import("@aws-sdk/client-s3");

export type S3Mode =
  | {
      configured: true;
      endpoint: string | null; // null → AWS default endpoint for the region
      bucket: string;
      region: string;
      forcePathStyle: boolean;
      autoCreateBucket: boolean;
    }
  | { configured: false };

/**
 * Parsed view of the S3_* environment. Required: S3_BUCKET,
 * S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY. Optional: S3_ENDPOINT,
 * S3_REGION (default us-east-1), S3_FORCE_PATH_STYLE (default: with a
 * custom endpoint), S3_AUTO_CREATE_BUCKET (default on).
 *
 * Pure env parsing — no SDK import happens here, so asking "which backend
 * is active?" is free (health route calls this on every probe).
 */
export function s3Mode(): S3Mode {
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  const set: Record<string, string | undefined> = {
    S3_BUCKET: bucket,
    S3_ACCESS_KEY_ID: accessKeyId,
    S3_SECRET_ACCESS_KEY: secretAccessKey,
  };
  const missing = Object.entries(set)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0 && missing.length < 3) {
    // Partial configuration is an operator error worth one clear line, not a
    // crash: stay on the local filesystem backend and say so.
    console.warn(`[storage] S3 backend partially configured (${missing.join(", ")} unset) — staying on the local filesystem backend`);
    return { configured: false };
  }
  if (!bucket || !accessKeyId || !secretAccessKey) return { configured: false };

  const endpoint = process.env.S3_ENDPOINT?.trim() || null;
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE
    ? process.env.S3_FORCE_PATH_STYLE !== "0"
    : endpoint !== null;
  return {
    configured: true,
    endpoint,
    bucket,
    region: process.env.S3_REGION?.trim() || "us-east-1",
    forcePathStyle,
    autoCreateBucket: process.env.S3_AUTO_CREATE_BUCKET !== "0",
  };
}

/* ── Lazy SDK + client cache ───────────────────────────────────────────────── */

let cachedSdk: Promise<S3Sdk> | null = null;
let cachedClient: { key: string; client: S3Client } | null = null;

function loadSdk(): Promise<S3Sdk> {
  cachedSdk ??= import("@aws-sdk/client-s3");
  return cachedSdk;
}

async function clientFor(mode: Extract<S3Mode, { configured: true }>): Promise<S3Client> {
  const key = `${mode.endpoint ?? "aws"}|${mode.region}|${mode.bucket}|${mode.forcePathStyle}`;
  if (cachedClient?.key === key) return cachedClient.client;
  const sdk = await loadSdk();
  const client = new sdk.S3Client({
    ...(mode.endpoint ? { endpoint: mode.endpoint } : {}),
    region: mode.region,
    forcePathStyle: mode.forcePathStyle,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!.trim(),
    },
  });
  cachedClient = { key, client };
  return client;
}

/** Invalidate the cached client (tests flipping env mid-process). */
export function resetS3ClientCache(): void {
  cachedClient = null;
  bucketReady = null;
}

let bucketReady: { bucket: string; endpoint: string | null; promise: Promise<void> } | null = null;

/**
 * HeadBucket, creating the bucket first when allowed (S3_AUTO_CREATE_BUCKET,
 * default on — a self-hoster pointing at a fresh SeaweedFS should not have
 * to open a shell first). Result is cached per bucket; failures clear the
 * cache so the next store attempt retries.
 */
export function ensureBucket(mode: Extract<S3Mode, { configured: true }>): Promise<void> {
  const cacheKey = mode.bucket;
  if (bucketReady?.bucket === cacheKey && bucketReady.endpoint === mode.endpoint) return bucketReady.promise;
  const promise = (async () => {
    const client = await clientFor(mode);
    const sdk = await loadSdk();
    try {
      await client.send(new sdk.HeadBucketCommand({ Bucket: mode.bucket }));
    } catch (err) {
      const name = err instanceof Error && "name" in err ? (err as { name?: string }).name : "";
      const httpStatus = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      const missing = name === "NotFound" || httpStatus === 404;
      if (!missing || !mode.autoCreateBucket) {
        bucketReady = null; // retry next time
        throw err;
      }
      try {
        await client.send(new sdk.CreateBucketCommand({ Bucket: mode.bucket }));
      } catch (createErr) {
        // Lost a race with another replica creating it concurrently.
        try {
          await client.send(new sdk.HeadBucketCommand({ Bucket: mode.bucket }));
        } catch {
          bucketReady = null;
          throw createErr;
        }
      }
    }
  })();
  bucketReady = { bucket: cacheKey, endpoint: mode.endpoint, promise };
  return promise;
}

/** Fetch an object's bytes. Throws when the key does not exist. */
export async function s3GetBytes(mode: Extract<S3Mode, { configured: true }>, key: string): Promise<Buffer> {
  const [client, sdk] = await Promise.all([clientFor(mode), loadSdk()]);
  const got = await client.send(new sdk.GetObjectCommand({ Bucket: mode.bucket, Key: key }));
  return Buffer.from(await got.Body!.transformToByteArray());
}

export async function s3PutBytes(
  mode: Extract<S3Mode, { configured: true }>,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const [client, sdk] = await Promise.all([clientFor(mode), loadSdk()]);
  await client.send(
    new sdk.PutObjectCommand({ Bucket: mode.bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function s3DeleteKey(mode: Extract<S3Mode, { configured: true }>, key: string): Promise<void> {
  const [client, sdk] = await Promise.all([clientFor(mode), loadSdk()]);
  await client.send(new sdk.DeleteObjectCommand({ Bucket: mode.bucket, Key: key }));
}

/** Batch delete (purge sweep). Nonexistent keys are not an error in S3. */
export async function s3DeleteKeys(
  mode: Extract<S3Mode, { configured: true }>,
  keys: string[],
): Promise<void> {
  if (keys.length === 0) return;
  const [client, sdk] = await Promise.all([clientFor(mode), loadSdk()]);
  await client.send(
    new sdk.DeleteObjectsCommand({
      Bucket: mode.bucket,
      Delete: { Objects: keys.map((Key) => ({ Key })) },
    }),
  );
}

export type StoredObjectMeta = { key: string; lastModified: Date; size: number };

/** Paginated prefix listing — drives the retention sweep in S3 mode. */
export async function s3ListKeys(
  mode: Extract<S3Mode, { configured: true }>,
  prefix: string,
): Promise<StoredObjectMeta[]> {
  const [client, sdk] = await Promise.all([clientFor(mode), loadSdk()]);
  const out: StoredObjectMeta[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new sdk.ListObjectsV2Command({ Bucket: mode.bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const obj of page.Contents ?? []) {
      if (!obj.Key) continue;
      out.push({
        key: obj.Key,
        lastModified: obj.LastModified ? new Date(obj.LastModified) : new Date(0),
        size: obj.Size ?? 0,
      });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}
