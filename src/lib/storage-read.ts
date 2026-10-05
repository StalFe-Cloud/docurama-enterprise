/** Read-only source I/O bounds. Cancellation destroys active bodies, never just a raced promise. */
export type StorageReadLimits = { timeoutMs?: number; maxBytes?: number; signal?: AbortSignal };
export class StorageReadError extends Error {}
type ReadBound = { signal: AbortSignal; maxBytes?: number };
function cancelled(): StorageReadError { return new StorageReadError("Stored source read was cancelled."); }
export function throwIfReadAborted(signal: AbortSignal): void {
  if (signal.aborted) throw cancelled();
}
/** Late initialization/metadata completions are observed; source readers also actively cancel I/O. */
async function settleOnAbort<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  // Observe even already-started work when cancellation was already signalled.
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(cancelled());
    signal.addEventListener("abort", aborted, { once: true });
    task.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
    if (signal.aborted) aborted();
  });
}
/** A stat has no data stream to destroy. Its late result must not start a later data read. */
export function abortableMetadata<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return settleOnAbort(task, signal);
}
export async function withStorageReadLimits<T>(limits: StorageReadLimits, read: (bound: ReadBound) => Promise<T>): Promise<T> {
  if (limits.timeoutMs !== undefined && (!Number.isSafeInteger(limits.timeoutMs) || limits.timeoutMs < 1 || limits.timeoutMs > 120_000)) {
    throw new StorageReadError("Invalid stored source deadline.");
  }
  if (limits.maxBytes !== undefined && (!Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 1)) {
    throw new StorageReadError("Invalid stored source size limit.");
  }
  const controller = new AbortController();
  let timedOut = false;
  const upstreamAbort = () => controller.abort();
  limits.signal?.addEventListener("abort", upstreamAbort, { once: true });
  if (limits.signal?.aborted) upstreamAbort();
  const timer = limits.timeoutMs === undefined ? undefined : setTimeout(() => {
    timedOut = true; controller.abort();
  }, limits.timeoutMs);
  try {
    throwIfReadAborted(controller.signal);
    // Abort bounds SDK initialization/credential wait as well as response I/O.
    // Every active body is cancelled by readLimitedByteStream; late SDK setup
    // checks the already-aborted signal before issuing a request.
    const result = await settleOnAbort(read({ signal: controller.signal, maxBytes: limits.maxBytes }), controller.signal);
    throwIfReadAborted(controller.signal);
    return result;
  } catch (error) {
    const wasAborted = controller.signal.aborted;
    controller.abort(); // Cancel request/stream also on parse or oversize errors.
    if (timedOut) throw new StorageReadError("Stored source read deadline exceeded.");
    if (wasAborted) throw cancelled();
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    limits.signal?.removeEventListener("abort", upstreamAbort);
  }
}
type ByteBody = AsyncIterable<Uint8Array> & { destroy?: () => unknown; getReader?: () => ReadableStreamDefaultReader<Uint8Array> };
/** Both Node streams and fetch bodies are actively cancelled on abort or overrun. */
export async function readLimitedByteStream(body: ByteBody, bound: ReadBound): Promise<Buffer> {
  if (!body || (typeof body[Symbol.asyncIterator] !== "function" && typeof body.getReader !== "function")) {
    throw new StorageReadError("Stored source has no readable body.");
  }
  if (typeof body.destroy !== "function" && typeof body.getReader !== "function") {
    throw new StorageReadError("Stored source body cannot be cancelled safely.");
  }
  const reader = typeof body.destroy !== "function" && typeof body.getReader === "function" ? body.getReader() : null;
  const iterator = reader ? null : body[Symbol.asyncIterator]();
  let complete = false;
  const stop = () => {
    if (typeof body.destroy === "function") body.destroy();
    else if (reader) void reader.cancel().catch(() => undefined);
  };
  const aborted = () => stop();
  bound.signal.addEventListener("abort", aborted, { once: true });
  const chunks: Buffer[] = []; let bytes = 0;
  try {
    throwIfReadAborted(bound.signal);
    while (true) {
      const item = reader ? await reader.read() : await iterator!.next();
      throwIfReadAborted(bound.signal);
      if (item.done) break;
      if (!(item.value instanceof Uint8Array)) throw new StorageReadError("Stored source contains unsupported byte chunks.");
      bytes += item.value.byteLength;
      if (bound.maxBytes !== undefined && bytes > bound.maxBytes) throw new StorageReadError("Stored source exceeds the supported size limit.");
      chunks.push(Buffer.from(item.value));
    }
    complete = true;
    return Buffer.concat(chunks, bytes);
  } finally {
    bound.signal.removeEventListener("abort", aborted);
    if (!complete) stop();
    reader?.releaseLock();
  }
}
