/// <reference types="bun-types" />

/**
 * Rekor witnessing E2E — neutral third-party anchoring of the portal
 * transparency key, exercised against a local mock Rekor log (hermetic: no
 * egress, deterministic, CI-safe) with the real lib code paths.
 *
 * Run: bun test e2e/rekor.test.ts   (run.sh wires it after transparency)
 *
 * Split of labor:
 *  - in-process lib calls (same process as the tests, DATABASE_URL from
 *    run.sh) drive witnessing against the mock log and its offline path;
 *  - HTTP against the dev server (BASE) proves the wiring: the checkpoint
 *    and proof endpoints serve the witness block from the row.
 *
 * The dev server itself runs with REKOR_WITNESS=off in the suite (run.sh),
 * so its lazy checkpoint attempts never depend on external egress.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHash, createPublicKey, verify as nodeVerify } from "crypto";
import { PrismaClient } from "@prisma/client";
import { canonicalJson } from "../src/lib/canonical-json";
import {
  witnessPortalKey, witnessPortalKeyLazily, getPortalKeyWitness, verifyWitness,
  WITNESS_STATEMENT_FORMAT,
} from "../src/lib/rekor";
import { getOrCreatePortalKey, portalKeyFingerprint } from "../src/lib/transparency";

const BASE = process.env.MAESTRO_BASE_URL ?? "http://127.0.0.1:3000";
const sha256hex = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL ?? "file:../db/custom.db" } },
});

/* ── A miniature Rekor: hashedrekord in, entry + inclusion proof out ───────── */

type SubmittedEntry = {
  kind: string;
  apiVersion: string;
  spec: {
    data: { hash: { algorithm: string; value: string } };
    signature: { content: string; publicKey: { content: string } };
  };
};

const submitted: SubmittedEntry[] = [];
let mockRekor: ReturnType<typeof Bun.serve> | null = null;
const mockUrl = () => `http://127.0.0.1:${mockRekor!.port}`;

beforeAll(() => {
  mockRekor = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "POST" && url.pathname === "/api/v1/log/entries") {
        const entry = (await req.json()) as SubmittedEntry;
        submitted.push(entry);
        const uuid = sha256hex(canonicalJson(entry));
        const logIndex = submitted.length - 1;
        const record = {
          [uuid]: {
            body: Buffer.from(canonicalJson(entry), "utf8").toString("base64"),
            integratedTime: Math.floor(Date.now() / 1000),
            logID: "mock-rekor-log",
            logIndex,
            verification: {
              inclusionProof: {
                checkpoint: `mock-rekor - transparent checkpoint ${submitted.length}`,
                hashes: [sha256hex(`leaf-${logIndex}`)],
                logIndex,
                rootHash: sha256hex(`root-${logIndex}`),
                treeSize: submitted.length,
              },
            },
          },
        };
        return new Response(JSON.stringify(record), { status: 201, headers: { "content-type": "application/json" } });
      }
      if (req.method === "GET" && url.pathname === "/api/v1/log/entries") {
        const idx = Number(url.searchParams.get("logIndex"));
        const entry = submitted[idx];
        if (!entry) return new Response("{}", { status: 404 });
        const uuid = sha256hex(canonicalJson(entry));
        const record = {
          [uuid]: {
            body: Buffer.from(canonicalJson(entry), "utf8").toString("base64"),
            integratedTime: Math.floor(Date.now() / 1000),
            logID: "mock-rekor-log",
            logIndex: idx,
            verification: {
              inclusionProof: {
                checkpoint: `mock-rekor - transparent checkpoint ${submitted.length}`,
                hashes: [sha256hex(`leaf-${idx}`)],
                logIndex: idx,
                rootHash: sha256hex(`root-${idx}`),
                treeSize: submitted.length,
              },
            },
          },
        };
        return new Response(JSON.stringify(record), { headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    },
  });
});

afterAll(async () => {
  mockRekor?.stop(true);
  await db.$disconnect();
});

const wipeWitness = () => db.rekorWitness.deleteMany({});

/* ── Witnessing against the mock log ───────────────────────────────────────── */

describe("rekor witnessing (mock log, in-process lib)", () => {
  test("portal key is witnessed with a valid hashedrekord", async () => {
    await wipeWitness();
    submitted.length = 0;
    process.env.REKOR_API_URL = mockUrl();
    delete process.env.REKOR_WITNESS; // suite default is off for the server; the lib call must run

    const result = await witnessPortalKey();
    if (!result.pushed) throw new Error(`expected push, got: ${result.reason}`);
    const w = result.witness;

    // The mock received exactly one valid hashedrekord.
    expect(submitted.length).toBe(1);
    const entry = submitted[0];
    expect(entry.kind).toBe("hashedrekord");
    expect(entry.apiVersion).toBe("0.0.1");
    expect(entry.spec.data.hash.algorithm).toBe("sha256");

    // The entry commits to the statement hash, and the statement signature
    // verifies under the portal key — re-derived exactly like a monitor.
    const key = await getOrCreatePortalKey();
    const statementBytes = Buffer.from(canonicalJson(w.statement), "utf8");
    expect(entry.spec.data.hash.value).toBe(sha256hex(statementBytes));
    expect(w.statementHash).toBe(sha256hex(statementBytes));
    expect(
      nodeVerify("sha256", statementBytes, createPublicKey(key.publicKeyPem), Buffer.from(entry.spec.signature.content, "base64")),
    ).toBe(true);
    // The publicKey in the entry is the portal key itself (self-witnessing).
    expect(Buffer.from(entry.spec.signature.publicKey.content, "base64").toString("utf8")).toBe(key.publicKeyPem);

    // The row carries what a monitor needs, and it self-verifies.
    expect(w.statement.format).toBe(WITNESS_STATEMENT_FORMAT);
    expect(w.statement.keyFingerprint).toBe(portalKeyFingerprint(key.publicKeyPem));
    expect(w.logIndex).toBe(0);
    expect(w.inclusionProof).not.toBeNull();
    expect((w.inclusionProof as { treeSize?: number }).treeSize).toBe(1);
    expect(verifyWitness(w, key.publicKeyPem)).toEqual({ ok: true });
  });

  test("re-witnessing is idempotent (no log growth)", async () => {
    const before = submitted.length;
    const result = await witnessPortalKey();
    expect(result.pushed).toBe(true);
    expect(submitted.length).toBe(before); // no second entry
    const stored = await getPortalKeyWitness();
    expect(stored?.entryUUID).toBe(result.pushed ? result.witness.entryUUID : undefined);
  });

  test("verifyWitness rejects a tampered statement", async () => {
    const w = await getPortalKeyWitness();
    if (!w) throw new Error("witness missing");
    const key = await getOrCreatePortalKey();
    const tampered = { ...w, statement: { ...w.statement, createdAt: "2000-01-01T00:00:00.000Z" } };
    const verdict = verifyWitness(tampered, key.publicKeyPem);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("hash mismatch");
    // And the honest one still verifies.
    expect(verifyWitness(w, key.publicKeyPem).ok).toBe(true);
  });

  test("lazy witnessing creates the row when absent, then stands down", async () => {
    await wipeWitness();
    const result = await witnessPortalKeyLazily(); // row absent + mock reachable → witnesses
    expect(result).toBeUndefined(); // fire-and-forget by contract
    const w = await getPortalKeyWitness();
    expect(w).not.toBeNull();
    const count = submitted.length;
    await witnessPortalKeyLazily(); // row now present → no attempt
    expect(submitted.length).toBe(count);
  });

  test("offline Rekor degrades to unwitnessed without throwing", async () => {
    await wipeWitness();
    const previousUrl = process.env.REKOR_API_URL;
    process.env.REKOR_API_URL = "http://127.0.0.1:9"; // nothing listens there
    try {
      const result = await witnessPortalKey();
      expect(result.pushed).toBe(false);
      expect(String((result as { reason: string }).reason)).toContain("unreachable");
      expect(await getPortalKeyWitness()).toBeNull();
    } finally {
      process.env.REKOR_API_URL = previousUrl ?? mockUrl();
    }
  });

  test("REKOR_WITNESS=off disables witnessing entirely", async () => {
    await wipeWitness();
    process.env.REKOR_WITNESS = "off";
    try {
      const result = await witnessPortalKey();
      expect(result.pushed).toBe(false);
      expect(String((result as { reason: string }).reason)).toContain("disabled");
      await witnessPortalKeyLazily();
      expect(await getPortalKeyWitness()).toBeNull();
    } finally {
      delete process.env.REKOR_WITNESS;
    }
  });
});

/* ── Wiring: the public endpoints serve the witness from the row ───────────── */

describe("rekor witness on the public endpoints (dev server)", () => {
  test("checkpoint carries the witness block once the row exists", async () => {
    // Ensure a witness exists for the shared db, from the in-process lib.
    if (!(await getPortalKeyWitness())) {
      process.env.REKOR_API_URL = mockUrl();
      const r = await witnessPortalKey();
      if (!r.pushed) throw new Error(r.reason);
    }

    const res = await fetch(`${BASE}/api/transparency/checkpoint`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { witness?: { entryUUID: string; statementHash: string } };
    const w = await getPortalKeyWitness();
    expect(body.witness?.entryUUID).toBe(w?.entryUUID);
    expect(body.witness?.statementHash).toBe(w?.statementHash);
  });

  test("inclusion proof endpoint carries the witness block", async () => {
    const res = await fetch(`${BASE}/api/transparency/proof/DOC-E2EATST`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { witness?: { logIndex: number } };
    expect(typeof body.witness?.logIndex).toBe("number");
  });

  test("without a witness row the checkpoint stays clean (TOFU-only)", async () => {
    await wipeWitness();
    const res = await fetch(`${BASE}/api/transparency/checkpoint`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { witness?: unknown; checkpoint?: { signature: string } };
    expect(body.witness).toBeUndefined();
    expect(typeof body.checkpoint?.signature).toBe("string"); // TOFU flow intact
  });

  test("the witness op is platform-admin only", async () => {
    const res = await fetch(`${BASE}/api/transparency/witness`, { method: "POST" });
    expect([401, 403]).toContain(res.status);
  });
});
