import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { TransactionGate, TransactionQueueBusyError } from "@/lib/transaction-gate";

const runtime = globalThis as typeof globalThis & {
  __docuramaSqliteTransactionGates?: Map<string, TransactionGate>;
};

function sqliteGate(): TransactionGate | null {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) return null;
  const gates = runtime.__docuramaSqliteTransactionGates ??= new Map();
  let gate = gates.get(url);
  if (!gate) {
    gate = new TransactionGate();
    gates.set(url, gate);
  }
  return gate;
}

/** Callbacks contain database work only: a serialization conflict can replay
 * the callback. Do not nest this helper; pass the existing transaction client.
 * The SQLite turn is process-local admission control, NOT a distributed lock.
 * Serializable isolation and conditional writes remain mandatory on both DBs. */
export async function serializableTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const transact = () => db.$transaction(work, {
        isolationLevel: "Serializable",
        maxWait: 10_000,
        timeout: 20_000,
      });
      const gate = sqliteGate();
      return await (gate ? gate.run(transact) : transact());
    } catch (error) {
      if (error instanceof TransactionQueueBusyError) {
        throw new Response(JSON.stringify({ error: error.message }), {
          status: 503,
          headers: { "content-type": "application/json", "retry-after": "1" },
        });
      }
      const code = (error as { code?: string })?.code;
      // Retry only known rolled-back conflicts. Unknown transport/commit errors
      // must not replay potentially committed business effects.
      if (attempt >= 5 || !["P2034", "P2002"].includes(code ?? "")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 * 2 ** attempt));
    }
  }
}
