import { describe, expect, test } from "bun:test";
import { TransactionGate, TransactionQueueBusyError } from "../src/lib/transaction-gate";

describe("SQLite transaction admission", () => {
  test("competing callers run one at a time in FIFO order", async () => {
    const gate = new TransactionGate();
    let active = 0;
    let maximum = 0;
    const order: number[] = [];
    await Promise.all(Array.from({ length: 20 }, (_, index) => gate.run(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await Bun.sleep(1);
      order.push(index);
      active--;
    })));
    expect(maximum).toBe(1);
    expect(order).toEqual(Array.from({ length: 20 }, (_, index) => index));
  });

  test("a failed callback releases its turn", async () => {
    const gate = new TransactionGate();
    await expect(gate.run(async () => { throw new Error("fixture failure"); })).rejects.toThrow("fixture failure");
    expect(await gate.run(async () => "next transaction")).toBe("next transaction");
  });

  test("queue capacity and wait duration are bounded without stealing an active turn", async () => {
    const gate = new TransactionGate(1, 25);
    const release = await gate.acquire();
    const pending = gate.acquire().then(() => "unexpected permit", (error: unknown) => error);
    await expect(gate.acquire()).rejects.toBeInstanceOf(TransactionQueueBusyError);
    expect(await pending).toBeInstanceOf(TransactionQueueBusyError);
    let entered = false;
    const next = gate.run(async () => { entered = true; });
    await Promise.resolve();
    expect(entered).toBe(false);
    release();
    await next;
    expect(entered).toBe(true);
  });

  test("releasing an old permit twice cannot release its successor", async () => {
    const gate = new TransactionGate();
    const first = await gate.acquire();
    const waitingSecond = gate.acquire();
    first();
    const second = await waitingSecond;
    let thirdEntered = false;
    const third = gate.run(async () => { thirdEntered = true; });
    first();
    await Promise.resolve();
    expect(thirdEntered).toBe(false);
    second();
    await third;
    expect(thirdEntered).toBe(true);
  });

  test("invalid admission limits are rejected", () => {
    for (const limit of [0, -1, 1.5, Infinity, NaN, 10_001]) expect(() => new TransactionGate(limit)).toThrow();
    for (const wait of [0, -1, 1.5, Infinity, NaN, 120_001]) expect(() => new TransactionGate(1, wait)).toThrow();
  });
});
