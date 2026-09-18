/**
 * Server-start hook (Next.js instrumentation) — boots the background worker.
 *
 * The worker is a single in-process loop, every WORKER_INTERVAL_MS:
 *   1. processOutbox()              — drain due SMTP mail
 *   2. retryFailedDeliveries()      — re-POST failed webhooks whose backoff elapsed
 *   3. renewDueSubscriptions()      — roll elapsed billing terms forward,
 *                                     carrying unused envelopes (capped)
 *
 * Scale-out honesty: this design assumes ONE long-lived app instance (the
 * documented single-node topology). When the app tier goes multi-replica
 * (PRODUCTION-PLAN §9), set DOCURAMA_WORKER=off on all but one replica, or
 * move both passes to an external cron/queue worker — the functions in
 * src/lib/mail.ts and src/lib/webhooks.ts are self-contained and
 * side-effect-only through the database, so lifting them out is mechanical.
 *
 * Escape hatches:
 *   DOCURAMA_WORKER=off   — don't start the loop at all (tests, stateless
 *                           replicas, or an operator who runs the passes
 *                           externally via a cron route).
 * Everything the worker does is also triggered inline on the request paths
 * that produce the work, so correctness never depends on the loop alone.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __docuramaWorker?: boolean };
  if (g.__docuramaWorker) return;
  if (process.env.DOCURAMA_WORKER === "off") return;
  g.__docuramaWorker = true;

  const [{ processOutbox }, { retryFailedDeliveries }, { renewDueSubscriptions }] = await Promise.all([
    import("@/lib/mail"),
    import("@/lib/webhooks"),
    import("@/lib/billing"),
  ]);

  const WORKER_INTERVAL_MS = 30_000;

  const tick = async () => {
    try {
      const mail = await processOutbox(20);
      if (mail.processed > 0) {
        console.log(`[worker] mail: ${mail.sent} sent, ${mail.deferred} deferred, ${mail.failed} failed`);
      }
    } catch (err) {
      console.warn("[worker] mail pass failed:", err);
    }
    try {
      const hooks = await retryFailedDeliveries(10);
      if (hooks.retried > 0) {
        console.log(`[worker] webhooks: ${hooks.retried} retried, ${hooks.recovered} recovered`);
      }
    } catch (err) {
      console.warn("[worker] webhook pass failed:", err);
    }
    try {
      const renewals = await renewDueSubscriptions(20);
      if (renewals.length > 0) {
        console.log(`[worker] billing: ${renewals.length} subscription(s) renewed, ${renewals.reduce((n, r) => n + r.carriedForward, 0)} envelopes carried forward`);
      }
    } catch (err) {
      console.warn("[worker] billing pass failed:", err);
    }
  };

  // First pass shortly after boot (lets the server accept connections first),
  // then a steady cadence. Unref'd: the loop never keeps the process alive.
  const boot = setTimeout(() => void tick(), 5_000);
  boot.unref?.();
  const loop = setInterval(() => void tick(), WORKER_INTERVAL_MS);
  loop.unref?.();
  console.log("[worker] background worker started (mail + webhook retries + subscription renewals)");
}
