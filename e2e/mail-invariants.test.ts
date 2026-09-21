/// <reference types="bun-types" />
import { beforeAll, afterAll, expect, test } from "bun:test";
import { createServer, type Server, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { processOutbox } from "../src/lib/mail";
import { db } from "../src/lib/db";

const database = process.env.DATABASE_URL ?? "";
if (process.env.DOCURAMA_VERIFICATION_DATABASE !== "1" ||
    !(database.startsWith("file:") && database.includes("quality-verification") ||
      database.startsWith("postgresql:") && new URL(database).pathname === "/docurama_verification")) {
  throw new Error("Mail invariants require the explicitly opted-in disposable verification DB");
}
const direct = new PrismaClient();
const ids: string[] = [];
const messages: string[] = [];
const connections = new Set<Socket>();
let server: Server;
let acceptCode = 250;
let blockedId: string | undefined;
let barrier: Promise<void> | undefined;
let notify: (() => void) | undefined;
const oldSmtp = process.env.SMTP_URL;

beforeAll(async () => {
  server = createServer((socket) => {
    connections.add(socket);
    socket.once("close", () => connections.delete(socket));
    socket.on("error", () => undefined);
    socket.setEncoding("utf8");
    socket.write("220 fixture.test ESMTP\r\n");
    let buffer = "";
    let data = false;
    let lines: string[] = [];
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let end: number;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") {
            data = false;
            const message = lines.join("\r\n");
            lines = [];
            messages.push(message);
            const code = acceptCode;
            if (blockedId && message.includes(`<${blockedId}@outbox.docurama>`)) {
              notify?.();
              void barrier?.then(() => { if (!socket.destroyed) socket.write(`${code} fixture response\r\n`); });
            } else socket.write(`${code} fixture response\r\n`);
          } else lines.push(line.startsWith("..") ? line.slice(1) : line);
        } else {
          const command = line.split(" ")[0].toUpperCase();
          if (["EHLO", "HELO"].includes(command)) socket.write("250-fixture.test\r\n250 SIZE 1000000\r\n");
          else if (command === "DATA") { data = true; socket.write("354 End with a dot\r\n"); }
          else if (command === "QUIT") socket.end("221 goodbye\r\n");
          else socket.write("250 OK\r\n");
        }
      }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TCP fixture missing");
  process.env.SMTP_URL = `smtp://127.0.0.1:${address.port}?tls=off`;
});
afterAll(async () => {
  if (oldSmtp === undefined) delete process.env.SMTP_URL; else process.env.SMTP_URL = oldSmtp;
  for (const socket of connections) socket.destroy();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await direct.mailOutbox.deleteMany({ where: { id: { in: ids } } });
  await direct.$disconnect();
  await db.$disconnect();
});
async function queued() {
  const id = randomUUID();
  ids.push(id);
  return direct.mailOutbox.create({ data: { id, toEmail: "fixture@example.test", subject: `Mail invariant ${id}`,
    template: "TEST", bodyText: "Fixture-only message", createdAt: new Date(0) } });
}
const received = (id: string) => messages.filter((message) => message.includes(`<${id}@outbox.docurama>`));

// No remote email provider is involved: the SMTP endpoint above is local only.
test("competing processors send one claimed mail row exactly once in the no-crash case", async () => {
  const row = await queued();
  await Promise.all([processOutbox(100), processOutbox(100)]);
  expect(received(row.id)).toHaveLength(1);
  const saved = await direct.mailOutbox.findUniqueOrThrow({ where: { id: row.id } });
  expect(saved.status).toBe("SENT");
  expect(saved.attempts).toBe(1);
  expect(saved.claimToken).toBeNull();
});

test("a lost acknowledgement is retried with the same Message-ID after backoff", async () => {
  const row = await queued();
  acceptCode = 451;
  try { await processOutbox(100); } finally { acceptCode = 250; }
  const failed = await direct.mailOutbox.findUniqueOrThrow({ where: { id: row.id } });
  expect(failed.status).toBe("QUEUED");
  expect(failed.attempts).toBe(1);
  expect(failed.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  await processOutbox(100);
  expect(received(row.id)).toHaveLength(1);
  await direct.mailOutbox.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(0) } });
  await processOutbox(100);
  expect(received(row.id)).toHaveLength(2);
  expect((await direct.mailOutbox.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("SENT");
});

test("active claims are respected; expired claims are recovered", async () => {
  const row = await queued();
  await direct.mailOutbox.update({ where: { id: row.id }, data: { attempts: 1, claimToken: "prior-worker", claimUntil: new Date(Date.now() + 60_000) } });
  await processOutbox(100);
  expect(received(row.id)).toHaveLength(0);
  await direct.mailOutbox.update({ where: { id: row.id }, data: { claimUntil: new Date(0) } });
  await processOutbox(100);
  expect(received(row.id)).toHaveLength(1);
  expect((await direct.mailOutbox.findUniqueOrThrow({ where: { id: row.id } })).attempts).toBe(2);
});

test("an exhausted abandoned job is terminal, never sent again", async () => {
  const row = await queued();
  await direct.mailOutbox.update({ where: { id: row.id }, data: { attempts: 5, claimToken: "abandoned", claimUntil: new Date(0) } });
  await processOutbox(100);
  expect(received(row.id)).toHaveLength(0);
  const saved = await direct.mailOutbox.findUniqueOrThrow({ where: { id: row.id } });
  expect(saved.status).toBe("FAILED");
  expect(saved.claimToken).toBeNull();
  expect(saved.nextAttemptAt).toBeNull();
});

test("a stale sender cannot overwrite its successor's committed state", async () => {
  const row = await queued();
  blockedId = row.id;
  let release!: () => void;
  barrier = new Promise<void>((resolve) => { release = resolve; });
  let arrived!: () => void;
  const arrival = new Promise<void>((resolve) => { arrived = resolve; });
  notify = arrived;
  const processing = processOutbox(100);
  try {
    await Promise.race([arrival, Bun.sleep(10_000).then(() => { throw new Error("SMTP fixture never saw the target message"); })]);
    await direct.mailOutbox.update({ where: { id: row.id }, data: { status: "SENT", attempts: 2, claimToken: "successor-token", lastError: "successor-marker" } });
  } finally { release(); blockedId = undefined; notify = undefined; barrier = undefined; }
  await processing;
  const saved = await direct.mailOutbox.findUniqueOrThrow({ where: { id: row.id } });
  expect(saved.attempts).toBe(2);
  expect(saved.claimToken).toBe("successor-token");
  expect(saved.lastError).toBe("successor-marker");
});
