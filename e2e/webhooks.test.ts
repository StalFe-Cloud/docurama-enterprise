/// <reference types="bun-types" />

/**
 * Webhook dispatcher E2E — src/lib/webhooks.ts against a local HTTP receiver
 * (Bun.serve) plus one full-path check through the real dev server: an
 * envelope sent over the workspace API must produce a signed webhook at the
 * tenant's registered endpoint.
 *
 * Run: bun test e2e/webhooks.test.ts   (run.sh wires it after mcp)
 *
 * Hermetic: the receiver is 127.0.0.1, the E2E tenant's endpoint exists only
 * for the lifetime of this file, and the dev server in the suite runs with
 * DOCURAMA_WORKER=off so retry passes are driven explicitly by the tests.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHmac } from "crypto";
import { PrismaClient } from "@prisma/client";
import {
  dispatchEnvelopeEvent,
  retryFailedDeliveries,
  signPayload,
  webhookBackoffMs,
} from "../src/lib/webhooks";

const BASE = process.env.MAESTRO_BASE_URL ?? "http://127.0.0.1:3000";
const E2E_USER_EMAIL = "e2e@docurama.eu";
const E2E_USER_PASSWORD = "e2ePass1234!";
const SECRET = "whsec_e2e_dispatcher_test";

type Received = {
  headers: Record<string, string>;
  body: string;
  at: number;
};

const received: Received[] = [];
let respondWith = 200;
let receiver: ReturnType<typeof Bun.serve>;

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL ?? "file:../db/custom.db" } },
});

let tenantId = "";
let endpointId = "";

beforeAll(async () => {
  receiver = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      received.push({
        headers: Object.fromEntries(req.headers.entries()),
        body: await req.text(),
        at: Date.now(),
      });
      return new Response("ok", { status: respondWith });
    },
  });

  const tenant = await db.tenant.findUnique({ where: { slug: "e2e-testing" } });
  if (!tenant) throw new Error("e2e-testing tenant missing — run the seed first");
  tenantId = tenant.id;

  // Own namespace: clean slate from any earlier run of this file.
  await db.webhookEndpoint.deleteMany({ where: { tenantId, url: { startsWith: "http://127.0.0.1:" } } });
  const ep = await db.webhookEndpoint.create({
    data: {
      tenantId,
      url: `http://127.0.0.1:${receiver.port}/hooks`,
      events: "envelope.sent|envelope.completed",
      status: "ACTIVE",
      secret: SECRET,
      secretMasked: "••••••test",
    },
  });
  endpointId = ep.id;
});

afterAll(async () => {
  await db.webhookEndpoint.deleteMany({ where: { id: endpointId } }).catch(() => undefined);
  receiver.stop(true);
  await db.$disconnect();
});

const clearReceived = () => received.splice(0, received.length);

describe("dispatch + HMAC contract", () => {
  test("delivers a signed POST the receiver can verify", async () => {
    clearReceived();
    const res = await dispatchEnvelopeEvent(tenantId, "envelope.sent", {
      code: "DOC-HOOK01",
      title: "Dispatcher contract",
      status: "SENT",
      recipientCount: 1,
    });
    expect(res.endpoints).toBe(1);
    expect(res.delivered).toBe(1);

    const got = received.find((r) => r.headers["x-docurama-event"] === "envelope.sent");
    expect(got).toBeDefined();

    // The exact contract a receiver verifies: HMAC-SHA256 over raw bytes.
    const expected = `sha256=${createHmac("sha256", SECRET).update(got!.body, "utf8").digest("hex")}`;
    expect(got!.headers["x-docurama-signature"]).toBe(expected);
    expect(got!.headers["x-docurama-delivery"]).toMatch(/^[0-9a-f-]{36}$/);

    const payload = JSON.parse(got!.body) as { id: string; event: string; createdAt: string; data: Record<string, unknown> };
    expect(payload.event).toBe("envelope.sent");
    expect(payload.id).toBe(got!.headers["x-docurama-delivery"]);
    expect(payload.data.code).toBe("DOC-HOOK01");
    expect(String(payload.data.tenantId)).toBe("undefined"); // internal ids never leak

    const delivery = await db.webhookDelivery.findFirst({
      where: { endpointId, event: "envelope.sent" },
      orderBy: { at: "desc" },
    });
    expect(delivery?.success).toBe(true);
    expect(delivery?.statusCode).toBe(200);
    expect(delivery?.payload).toBe(got!.body); // the snapshot is byte-identical
  });

  test("unsubscribed events never POST", async () => {
    clearReceived();
    const res = await dispatchEnvelopeEvent(tenantId, "envelope.voided", {
      code: "DOC-HOOK02",
      title: "Not subscribed",
      status: "VOIDED",
    });
    expect(res.endpoints).toBe(0);
    expect(received.length).toBe(0);
  });

  test("signPayload degenerates to null without a secret", () => {
    expect(signPayload(null, "x")).toBeNull();
    expect(signPayload(undefined, "x")).toBeNull();
  });
});

describe("failure handling + retry pass", () => {
  test("a 500 records the failure, then the retry recovers byte-identically", async () => {
    clearReceived();
    respondWith = 500;
    try {
      const res = await dispatchEnvelopeEvent(tenantId, "envelope.completed", {
        code: "DOC-HOOK03",
        title: "Retry recovery",
        status: "COMPLETED",
        sha256: "a".repeat(64),
      });
      expect(res.failed).toBe(1);

      const failed = await db.webhookDelivery.findFirst({
        where: { endpointId, event: "envelope.completed" },
        orderBy: { at: "desc" },
      });
      expect(failed?.success).toBe(false);
      expect(failed?.statusCode).toBe(500);
      expect(failed?.attempts).toBe(1);
      expect(failed?.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now());
      const originalBody: string = failed?.payload ?? "";
      expect(originalBody.length).toBeGreaterThan(0); // the snapshot exists

      // Not due yet → nothing retried.
      expect((await retryFailedDeliveries(10)).retried).toBe(0);

      // Backoff elapses; the receiver heals.
      await db.webhookDelivery.update({
        where: { id: failed!.id },
        data: { nextAttemptAt: new Date(Date.now() - 1000) },
      });
      respondWith = 200;
      const retry = await retryFailedDeliveries(10);
      expect(retry.retried).toBe(1);
      expect(retry.recovered).toBe(1);

      const recovered = await db.webhookDelivery.findUnique({ where: { id: failed!.id } });
      expect(recovered?.success).toBe(true);
      expect(recovered?.attempts).toBe(2);

      // Byte-identical retry: the receiver saw the same body (and the same
      // HMAC) twice — the delivery id header pins both attempts together.
      const bodies = received
        .filter((r) => r.headers["x-docurama-event"] === "envelope.completed")
        .map((r) => r.body);
      expect(bodies.length).toBe(2);
      expect(bodies[0]).toBe(bodies[1]);
      expect(bodies[0]).toBe(originalBody);
    } finally {
      respondWith = 200;
    }
  });

  test("backoff schedule: 1m → 5m → 15m, capped at 30m", () => {
    expect(webhookBackoffMs(1)).toBe(60_000);
    expect(webhookBackoffMs(2)).toBe(300_000);
    expect(webhookBackoffMs(3)).toBe(900_000);
    expect(webhookBackoffMs(4)).toBe(1_800_000);
    expect(webhookBackoffMs(5)).toBe(1_800_000);
  });
});

describe("full path: envelope send over HTTP fires the webhook", () => {
  test("workspace send → signed envelope.sent at the receiver", async () => {
    clearReceived();
    const TITLE = "Webhook full-path probe";

    const login = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: E2E_USER_EMAIL, password: E2E_USER_PASSWORD }),
    });
    expect(login.status).toBe(200);
    const token = String(((await login.json()) as { token?: string }).token);

    try {
      const send = await fetch(`${BASE}/api/workspace/envelopes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          op: "send",
          data: {
            title: TITLE,
            recipients: [{ name: "Webhook Probe", email: "webhook-probe@docurama.eu", role: "SIGNER" }],
          },
        }),
      });
      expect(send.status).toBe(200);

      // The dispatch is fire-and-forget post-commit; poll briefly.
      let got: Received | undefined;
      for (let i = 0; i < 40 && !got; i++) {
        await new Promise((r) => setTimeout(r, 250));
        got = received.find((r) => r.headers["x-docurama-event"] === "envelope.sent");
      }
      expect(got).toBeDefined();
      const payload = JSON.parse(got!.body) as { event: string; data: { code?: string; title?: string } };
      expect(payload.event).toBe("envelope.sent");
      expect(payload.data.title).toBe(TITLE);
      expect(payload.data.code).toMatch(/^DOC-[0-9A-F]{8}$/);
      const expected = `sha256=${createHmac("sha256", SECRET).update(got!.body, "utf8").digest("hex")}`;
      expect(got!.headers["x-docurama-signature"]).toBe(expected);
    } finally {
      // Leave the tenant as found: remove the probe envelope + its mail.
      const probe = await db.envelope.findFirst({ where: { tenantId, title: TITLE } });
      if (probe) {
        await db.envelopeEvent.deleteMany({ where: { envelopeId: probe.id } });
        await db.recipient.deleteMany({ where: { envelopeId: probe.id } });
        await db.envelope.delete({ where: { id: probe.id } });
      }
      await db.mailOutbox.deleteMany({ where: { toEmail: "webhook-probe@docurama.eu" } });
    }
  });
});
