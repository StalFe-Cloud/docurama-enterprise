/// <reference types="bun-types" />
import { beforeAll, afterAll, expect, test } from "bun:test";
import { createServer, type Server, type Socket } from "node:net";
import { randomUUID, createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPasswordAsync } from "../src/lib/password-async";
import { shiftUtcMonth } from "../src/lib/monthly-period";

const database = process.env.DATABASE_URL ?? "";
if (process.env.CI !== "true" || process.env.DOCURAMA_VERIFICATION_DATABASE !== "1" ||
    !database.startsWith("file:") || !database.includes("quality-verification-runtime")) {
  throw new Error("This test requires the disposable CI verification volume");
}
const BASE = "http://127.0.0.1:3031";
const db = new PrismaClient();
const messages: string[] = [];
const deliveries: Array<{ body: string; headers: Headers }> = [];
const connections = new Set<Socket>();
let smtp: Server;
let receiver: ReturnType<typeof Bun.serve>;

async function waitFor(check: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await Bun.sleep(250);
  }
  throw new Error(`Timed out: ${label}`);
}
async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(BASE + path, { method: "POST", headers: {
    "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}),
  }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

beforeAll(async () => {
  smtp = createServer((socket) => {
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
          if (line === ".") { messages.push(lines.join("\r\n")); lines = []; data = false; socket.write("250 accepted\r\n"); }
          else lines.push(line.startsWith("..") ? line.slice(1) : line);
        } else {
          const command = line.split(" ")[0].toUpperCase();
          if (command === "EHLO" || command === "HELO") socket.write("250-fixture.test\r\n250 SIZE 1000000\r\n");
          else if (command === "DATA") { data = true; socket.write("354 End with a dot\r\n"); }
          else if (command === "QUIT") socket.end("221 goodbye\r\n");
          else if (["MAIL", "RCPT", "RSET", "NOOP"].includes(command)) socket.write("250 OK\r\n");
          else socket.write("502 unsupported\r\n");
        }
      }
    });
  });
  await new Promise<void>((resolve, reject) => { smtp.once("error", reject); smtp.listen(3502, "127.0.0.1", resolve); });
  receiver = Bun.serve({ hostname: "127.0.0.1", port: 3501, async fetch(req) {
    deliveries.push({ body: await req.text(), headers: req.headers });
    return new Response("accepted");
  } });
});
afterAll(async () => {
  receiver?.stop(true);
  for (const socket of connections) socket.destroy();
  if (smtp) await new Promise<void>((resolve) => smtp.close(() => resolve()));
  await db.$disconnect();
});

test("production login and signing reach the local SMTP and webhook receivers", async () => {
  const id = randomUUID();
  const tenant = await db.tenant.create({ data: { name: "Runtime CI fixture", slug: `runtime-${id}`, planCode: "STARTER", status: "ACTIVE" } });
  const password = "DisposableRuntimeFixture123!";
  const user = await db.user.create({ data: { email: `runtime-${id}@example.test`, firstName: "Runtime", lastName: "Fixture",
    passwordHash: await hashPasswordAsync(password), status: "ACTIVE", activeTenantId: tenant.id } });
  await db.member.create({ data: { tenantId: tenant.id, userId: user.id, role: "OWNER", status: "ACTIVE" } });
  const now = new Date();
  await db.subscription.create({ data: { tenantId: tenant.id, planCode: "STARTER", provider: "manual", renewalAt: shiftUtcMonth(now, 1),
    usageAnchorAt: now, usagePeriodStart: now, usagePeriodEnd: shiftUtcMonth(now, 1), paymentAnchorAt: now } });
  const secret = `fixture-${id}`;
  const endpoint = await db.webhookEndpoint.create({ data: { tenantId: tenant.id, url: "http://127.0.0.1:3501/hooks", events: "*", secret, secretMasked: "fixture" } });
  const login = await post("/api/auth/login", { email: user.email, password });
  expect(login.status).toBe(200);
  expect(typeof login.body.token).toBe("string");
  const token = login.body.token as string;
  const sent = await post("/api/workspace/envelopes", { op: "send", data: { title: `Runtime ${id}`, recipients: [{ name: "CI Signer", email: "signer@example.test" }] } }, token);
  expect(sent.status).toBe(200);
  const envelope = await db.envelope.findFirstOrThrow({ where: { tenantId: tenant.id }, include: { recipients: true } });
  const signer = envelope.recipients[0];
  await waitFor(async () => messages.some((message) => message.includes(signer.accessToken!)), "SMTP invitation");
  expect((await post(`/api/sign/${signer.accessToken}`, { op: "view" })).status).toBe(200);
  const signed = await post(`/api/sign/${signer.accessToken}`, { op: "sign", name: "CI Signer" });
  expect(signed.status).toBe(200);
  expect(signed.body.envelopeStatus).toBe("COMPLETED");
  await waitFor(async () => deliveries.some((delivery) => {
    const payload = JSON.parse(delivery.body);
    return payload.event === "envelope.completed" && payload.data.code === envelope.publicCode;
  }), "completion webhook");
  const completion = deliveries.find((delivery) => {
    const payload = JSON.parse(delivery.body);
    return payload.event === "envelope.completed" && payload.data.code === envelope.publicCode;
  })!;
  expect(completion.headers.get("x-docurama-signature")).toBe(`sha256=${createHmac("sha256", secret).update(completion.body).digest("hex")}`);
  expect(completion.headers.get("x-docurama-delivery")).toBe(JSON.parse(completion.body).id);

  // No HTTP call or direct dispatcher invocation follows these inserts.
  // Only the application's periodic production worker can drain them.
  const deliveryId = randomUUID();
  const body = JSON.stringify({ id: deliveryId, event: "envelope.sent", data: { code: "DOC-WORKER", title: "Worker fixture", status: "SENT" } });
  await db.webhookDelivery.create({ data: { id: deliveryId, endpointId: endpoint.id, event: "envelope.sent", payload: body,
    statusCode: 0, durationMs: 0, success: false, attempts: 0, nextAttemptAt: new Date(0) } });
  const mail = await db.mailOutbox.create({ data: { toEmail: "worker@example.test", template: "TEST", subject: `Worker ${deliveryId}`, bodyText: `Worker-only delivery ${deliveryId}` } });
  await waitFor(async () => {
    const [m, h] = await Promise.all([db.mailOutbox.findUniqueOrThrow({ where: { id: mail.id } }), db.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } })]);
    return m.status === "SENT" && h.success;
  }, "worker-only queued deliveries");
  expect(messages.filter((message) => message.includes(`<${mail.id}@outbox.docurama>`))).toHaveLength(1);
  expect(deliveries.filter((delivery) => delivery.headers.get("x-docurama-delivery") === deliveryId)).toHaveLength(1);
  expect((await db.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } })).claimToken).toBeNull();
});
