/** Process-local admission control, not a replacement for database isolation.
 * SQLite has one writer. Starting many interactive transactions concurrently
 * can exhaust the query engine's worker threads while the lock holder waits.
 * A FIFO turn lets the holder complete; database locks still protect other
 * processes. Never put network requests inside a held transaction turn. */
export class TransactionQueueBusyError extends Error {
  constructor() {
    super("Database transaction queue is busy. Retry shortly.");
    this.name = "TransactionQueueBusyError";
  }
}

type Waiter = { grant: () => void; timer: ReturnType<typeof setTimeout> };

export class TransactionGate {
  private active = false;
  private readonly waiters: Waiter[] = [];

  constructor(private readonly capacity = 64, private readonly waitMs = 10_000) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 10_000 ||
        !Number.isSafeInteger(waitMs) || waitMs < 1 || waitMs > 120_000) {
      throw new Error("Invalid transaction admission limits");
    }
  }

  private releaseOnce(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) {
        clearTimeout(next.timer);
        next.grant();
      } else {
        this.active = false;
      }
    };
  }

  async acquire(): Promise<() => void> {
    if (!this.active) {
      this.active = true;
      return this.releaseOnce();
    }
    if (this.waiters.length >= this.capacity) throw new TransactionQueueBusyError();
    return new Promise<() => void>((resolve, reject) => {
      const waiter: Waiter = {
        grant: () => resolve(this.releaseOnce()),
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index < 0) return;
          this.waiters.splice(index, 1);
          reject(new TransactionQueueBusyError());
        }, this.waitMs),
      };
      this.waiters.push(waiter);
    });
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await work();
    } finally {
      release();
    }
  }
}
