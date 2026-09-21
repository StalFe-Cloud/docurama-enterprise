/** One awaited chain, including startup and asynchronous error reporting. */
export function startWorkerLoop(
  tick: () => Promise<void>,
  options: { initialDelayMs: number; intervalMs: number; onError?: (error: unknown) => void | Promise<void> },
): () => void {
  const { initialDelayMs, intervalMs } = options;
  if (!Number.isSafeInteger(initialDelayMs) || initialDelayMs < 0 || initialDelayMs > 2_147_483_647) throw new RangeError("Invalid worker initial delay");
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0 || intervalMs > 2_147_483_647) throw new RangeError("Invalid worker interval");
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (delay: number) => {
    if (stopped) return;
    timer = setTimeout(() => { void run(); }, delay);
    timer.unref?.();
  };
  const run = async () => {
    if (stopped) return;
    try { await tick(); }
    catch (error) {
      try { if (options.onError) await options.onError(error); else console.warn("[worker] pass failed", error); }
      catch (reportError) { try { console.warn("[worker] error reporter failed", reportError); } catch { /* Best effort. */ } }
    } finally { schedule(intervalMs); }
  };
  schedule(initialDelayMs);
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
