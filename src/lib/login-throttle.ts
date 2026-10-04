import { createHash } from "node:crypto";
type Bucket = { attempts: number; until: number };
const state = globalThis as typeof globalThis & { __docuramaLoginBuckets?: Map<string, Bucket> };
const buckets = state.__docuramaLoginBuckets ??= new Map<string, Bucket>();
/** Bounded per-process defense; shared ingress limits are still required for replicas. */
export function allowLoginAttempt(email: string, ip: string, now = Date.now()): boolean {
  for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key);
  const keys = [{ key: `account:${email}`, limit: 20 }];
  if (ip !== "unknown") keys.push({ key: `ip:${ip}`, limit: 100 });
  for (const { key, limit } of keys) {
    const digest = createHash("sha256").update(key).digest("hex");
    let bucket = buckets.get(digest);
    if (!bucket) {
      if (buckets.size >= 10000) return false;
      bucket = { attempts: 0, until: now + 5 * 60_000 };
      buckets.set(digest, bucket);
    }
    if (++bucket.attempts > limit) return false;
  }
  return true;
}
