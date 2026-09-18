/// <reference types="bun-types" />

/**
 * MCP server E2E — /api/mcp, the JSON-RPC 2.0 surface that lets AI agents
 * query the workspace (Settings → MCP).
 *
 * Run: bun test e2e/mcp.test.ts   (run.sh wires it after seeding)
 *
 * Covers what no other suite does: the JSON-RPC handshake, tool listing with
 * the per-tenant allowlist, real tool execution against the seeded fixtures,
 * auth (401) and the tenant gate (403), per-key rate limiting (429), and the
 * RPC error codes (-32601 / -32602).
 *
 * Fixtures from e2e/seed.ts: the E2E tenant's MCP config (enabled, 4 tools,
 * 120/min), the E2E Suite Key and the cold-bucket E2E MCP Rate Key.
 *
 * Ordering contract: functional tests run first; the last three tests mutate
 * the tenant's MCP config directly (disable → allowlist → rate limit) and
 * always restore it in finally, so a re-run starts from the seeded state.
 */

import { describe, expect, test } from "bun:test";

const BASE = process.env.MAESTRO_BASE_URL ?? "http://127.0.0.1:3000";
const E2E_API_KEY = "dk_e2e_0000000000000000000000000000000000000000";
const E2E_MCP_RATE_KEY = "dk_e2e_mcp_rate_0000000000000000000000000000001";

const rpc = async (payload: unknown, headers: Record<string, string> = {}) => {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { status: res.status, json };
};

const call = (id: number, name: string, args: Record<string, unknown> = {}, key = E2E_API_KEY) =>
  rpc({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, { "X-API-Key": key });

/** tools/call results carry a JSON payload inside content[0].text. */
const payloadOf = (json: Record<string, any>) => JSON.parse(String(json.result?.content?.[0]?.text ?? "null"));

describe("MCP server (/api/mcp)", () => {
  test("GET describes the surface without auth", async () => {
    const res = await fetch(`${BASE}/api/mcp`);
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body.transport).toBe("http-json-rpc");
    expect(String(body.authentication)).toContain("X-API-Key");
  });

  test("missing and invalid API keys are rejected with 401", async () => {
    const missing = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(missing.status).toBe(401);

    const invalid = await rpc(
      { jsonrpc: "2.0", id: 2, method: "initialize" },
      { "X-API-Key": "dk_totally_wrong" },
    );
    expect(invalid.status).toBe(401);
  });

  test("initialize handshake: protocol version + server identity", async () => {
    const { status, json } = await rpc(
      { jsonrpc: "2.0", id: 1, method: "initialize" },
      { "X-API-Key": E2E_API_KEY },
    );
    expect(status).toBe(200);
    expect(json.id).toBe(1);
    expect(json.result.protocolVersion).toBe("2025-03-26");
    expect(json.result.serverInfo.name).toBe("docurama");
    expect(json.result.capabilities.tools).toBeDefined();
  });

  test("ping answers with an empty result", async () => {
    const { status, json } = await rpc({ jsonrpc: "2.0", id: 2, method: "ping" }, { "X-API-Key": E2E_API_KEY });
    expect(status).toBe(200);
    expect(json.result).toEqual({});
  });

  test("invalid JSON body is a 400, unknown method is -32601", async () => {
    const res = await fetch(`${BASE}/api/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": E2E_API_KEY },
      body: "this is not json",
    });
    expect(res.status).toBe(400);

    const { json } = await rpc(
      { jsonrpc: "2.0", id: 3, method: "workspace/panic" },
      { "X-API-Key": E2E_API_KEY },
    );
    expect(json.error.code).toBe(-32601);
    expect(String(json.error.message)).toContain("workspace/panic");
  });

  test("tools/list exposes the four seeded tools with schemas", async () => {
    const { status, json } = await rpc(
      { jsonrpc: "2.0", id: 4, method: "tools/list" },
      { "X-API-Key": E2E_API_KEY },
    );
    expect(status).toBe(200);
    const tools = (json.result.tools as { name: string; inputSchema: unknown }[]) ?? [];
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["document_verify", "envelope_detail", "envelope_list", "template_list"].sort(),
    );
    for (const t of tools) expect(t.inputSchema).toBeDefined();
  });

  test("envelope_list sees the seeded fixtures", async () => {
    const { status, json } = await call(5, "envelope_list", { status: "SENT" });
    expect(status).toBe(200);
    const data = payloadOf(json);
    expect(Number(data.total)).toBeGreaterThanOrEqual(2);
    const codes = (data.envelopes as { code: string }[]).map((e) => e.code);
    expect(codes).toContain("DOC-E2E0001");
    expect(codes).toContain("DOC-E2E0004");
  });

  test("envelope_detail by public code returns seal facts + timeline", async () => {
    const { status, json } = await call(6, "envelope_detail", { idOrCode: "DOC-E2E0002" });
    expect(status).toBe(200);
    const data = payloadOf(json);
    expect(data.status).toBe("COMPLETED");
    expect(String(data.sha256)).toMatch(/^[0-9a-f]{64}$/);
    expect(data.sealedAt).toBeTruthy();
    expect((data.timeline as unknown[]).length).toBeGreaterThan(0);
    // SECURITY: recipients never carry their signing tokens.
    const rcpts = data.recipients as Record<string, unknown>[];
    expect(rcpts.every((r) => !("accessToken" in r))).toBe(true);
  });

  test("envelope_detail for an unknown code is a graceful text miss", async () => {
    const { status, json } = await call(7, "envelope_detail", { idOrCode: "DOC-NOSUCHCODE" });
    expect(status).toBe(200);
    expect(String(json.result.content[0].text)).toContain("not found");
  });

  test("document_verify: VERIFIED on the sealed fixture, NOT_FOUND on garbage", async () => {
    const ok = await call(8, "document_verify", { code: "DOC-E2E0002" });
    const data = payloadOf(ok.json);
    expect(data.result).toBe("VERIFIED");
    expect(data.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((data.signers as unknown[]).length).toBeGreaterThan(0);

    const miss = await call(9, "document_verify", { code: "DOC-DOESNOTEXIST" });
    expect(String(miss.json.result.content[0].text)).toContain("NOT_FOUND");
  });

  test("template_list includes the seeded workspace template", async () => {
    const { status, json } = await call(10, "template_list", {});
    expect(status).toBe(200);
    const data = payloadOf(json);
    const names = (data.templates as { name: string }[]).map((t) => t.name);
    expect(names).toContain("E2E Clause Library");
  });

  test("a tool outside the allowlist is -32602, never executed", async () => {
    const { json } = await call(11, "definitely_not_a_tool", {});
    expect(json.error.code).toBe(-32602);
    expect(String(json.error.message)).toContain("not enabled");
  });

  test("disabled MCP config gates the whole endpoint with 403 (restored)", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const direct = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL ?? "file:../db/custom.db" } },
    });
    try {
      const cfg = await direct.mcpConfig.findFirst({ where: { tenant: { slug: "e2e-testing" } } });
      if (!cfg) throw new Error("MCP config fixture missing — seed first");
      await direct.mcpConfig.update({ where: { id: cfg.id }, data: { enabled: false } });

      const off = await rpc({ jsonrpc: "2.0", id: 12, method: "tools/list" }, { "X-API-Key": E2E_API_KEY });
      expect(off.status).toBe(403);
      expect(String(off.json.error)).toContain("disabled");

      await direct.mcpConfig.update({ where: { id: cfg.id }, data: { enabled: true } });
      const on = await rpc({ jsonrpc: "2.0", id: 13, method: "tools/list" }, { "X-API-Key": E2E_API_KEY });
      expect(on.status).toBe(200);
    } finally {
      await direct.mcpConfig.updateMany({ where: { tenant: { slug: "e2e-testing" } }, data: { enabled: true } });
      await direct.$disconnect();
    }
  });

  test("the allowlist filters tools/list and blocks calls (restored)", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const direct = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL ?? "file:../db/custom.db" } },
    });
    try {
      const cfg = await direct.mcpConfig.findFirst({ where: { tenant: { slug: "e2e-testing" } } });
      if (!cfg) throw new Error("MCP config fixture missing — seed first");
      // envelope_list + a name that is allowed but does not exist — enough to
      // prove both -32602 (not allowed) and -32601 (unknown tool) paths.
      await direct.mcpConfig.update({
        where: { id: cfg.id },
        data: { allowedTools: "envelope_list,ghost_tool" },
      });

      const list = await rpc({ jsonrpc: "2.0", id: 14, method: "tools/list" }, { "X-API-Key": E2E_API_KEY });
      const tools = (list.json.result.tools as { name: string }[]) ?? [];
      expect(tools.map((t) => t.name)).toEqual(["envelope_list"]);

      const blocked = await call(15, "envelope_detail", { idOrCode: "DOC-E2E0002" });
      expect(blocked.json.error.code).toBe(-32602);

      const ghost = await call(16, "ghost_tool", {});
      expect(ghost.json.error.code).toBe(-32601);
    } finally {
      await direct.mcpConfig.updateMany({
        where: { tenant: { slug: "e2e-testing" } },
        data: { allowedTools: "envelope_list,envelope_detail,document_verify,template_list" },
      });
      await direct.$disconnect();
    }
  });

  test("per-key rate limit: third request inside the window is 429 (restored)", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const direct = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL ?? "file:../db/custom.db" } },
    });
    try {
      const cfg = await direct.mcpConfig.findFirst({ where: { tenant: { slug: "e2e-testing" } } });
      if (!cfg) throw new Error("MCP config fixture missing — seed first");
      await direct.mcpConfig.update({ where: { id: cfg.id }, data: { rateLimitPerMin: 2 } });

      // The rate key's in-server bucket is cold (no other test used it), so
      // requests 1-2 pass and request 3 trips the limit.
      const r1 = await rpc({ jsonrpc: "2.0", id: 17, method: "ping" }, { "X-API-Key": E2E_MCP_RATE_KEY });
      const r2 = await rpc({ jsonrpc: "2.0", id: 18, method: "ping" }, { "X-API-Key": E2E_MCP_RATE_KEY });
      const r3 = await rpc({ jsonrpc: "2.0", id: 19, method: "ping" }, { "X-API-Key": E2E_MCP_RATE_KEY });
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r3.status).toBe(429);
      expect(String(r3.json.error)).toContain("Rate limit");
    } finally {
      await direct.mcpConfig.updateMany({
        where: { tenant: { slug: "e2e-testing" } },
        data: { rateLimitPerMin: 120 },
      });
      await direct.$disconnect();
    }
  });
});
