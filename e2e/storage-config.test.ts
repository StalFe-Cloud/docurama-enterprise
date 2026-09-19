import { afterEach, expect, test } from "bun:test";
import { s3Mode, s3PutBytes, resetS3ClientCache } from "../src/lib/object-store";

const keys = ["S3_BUCKET", "S3_ENDPOINT", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_SESSION_TOKEN", "S3_CREDENTIALS_MODE", "S3_SERVER_SIDE_ENCRYPTION", "S3_SSE_KMS_KEY_ID"];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
function clear() { for (const key of keys) delete process.env[key]; resetS3ClientCache(); }
afterEach(() => { clear(); for (const key of keys) { if (original[key] !== undefined) process.env[key] = original[key]; } });

test("partial S3 configuration cannot silently fall back to local storage", () => {
  clear();
  expect(s3Mode()).toEqual({ configured: false });
  process.env.S3_BUCKET = "tenant-documents";
  expect(() => s3Mode()).toThrow("complete static credential pair");
  process.env.S3_CREDENTIALS_MODE = "default";
  expect(s3Mode()).toMatchObject({ configured: true, credentialsMode: "default" });
  process.env.S3_ACCESS_KEY_ID = "incomplete";
  expect(() => s3Mode()).toThrow("must be unset");
});

test("KMS configuration requires an explicit key and the aws:kms mode", () => {
  clear(); process.env.S3_BUCKET = "tenant-documents"; process.env.S3_CREDENTIALS_MODE = "default";
  process.env.S3_SERVER_SIDE_ENCRYPTION = "aws:kms";
  expect(() => s3Mode()).toThrow("S3_SSE_KMS_KEY_ID");
  process.env.S3_SSE_KMS_KEY_ID = "arn:aws:kms:eu-west-3:123456789012:key/test";
  expect(s3Mode()).toMatchObject({ configured: true, serverSideEncryption: "aws:kms", kmsKeyId: process.env.S3_SSE_KMS_KEY_ID });
  process.env.S3_SERVER_SIDE_ENCRYPTION = "AES256";
  expect(() => s3Mode()).toThrow("requires aws:kms");
});

test("S3 object uploads carry the configured KMS key on the actual HTTP request", async () => {
  clear();
  let seen: Headers | undefined;
  const stub = Bun.serve({ port: 0, async fetch(req) { seen = req.headers; await req.arrayBuffer(); return new Response(null, { status: 200 }); } });
  try {
    Object.assign(process.env, { S3_BUCKET: "tenant-documents", S3_ENDPOINT: `http://127.0.0.1:${stub.port}`, S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test", S3_SERVER_SIDE_ENCRYPTION: "aws:kms", S3_SSE_KMS_KEY_ID: "arn:aws:kms:eu-west-3:123456789012:key/test" });
    const mode = s3Mode(); if (!mode.configured) throw new Error("Expected S3 mode");
    await s3PutBytes(mode, "tenants/test/document.pdf", Buffer.from("test"), "application/pdf");
    expect(seen?.get("x-amz-server-side-encryption")).toBe("aws:kms");
    expect(seen?.get("x-amz-server-side-encryption-aws-kms-key-id")).toBe(process.env.S3_SSE_KMS_KEY_ID);
  } finally { stub.stop(true); }
});
