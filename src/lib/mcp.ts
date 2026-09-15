/**
 * MCP (Model Context Protocol) server surface.
 *
 * /api/mcp speaks JSON-RPC 2.0 over HTTP (streamable transport): a single
 * POST endpoint handling initialize / tools/list / tools/call. Tools execute
 * REAL queries against the API key's workspace, gated by the tenant's MCP
 * configuration (enabled + per-tool allowlist + per-key rate limit).
 */

import { db } from "@/lib/db";
import { publicRecipient, iso } from "@/lib/serializers";

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  scope: string; // minimum ApiKey scope required
};

export const MCP_TOOLS: McpTool[] = [
  {
    name: "envelope_list",
    description: "List envelopes in the workspace with status, code, title and dates. Filter by status, paginate with page/perPage.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["SENT", "PARTIALLY_SIGNED", "COMPLETED", "VOIDED", "DECLINED"], description: "Optional status filter" },
        page: { type: "number", description: "1-based page (default 1)" },
        perPage: { type: "number", description: "Items per page, 5-50 (default 10)" },
      },
    },
    scope: "READONLY",
  },
  {
    name: "envelope_detail",
    description: "Get one envelope by id or public code (DOC-XXXXXX) with recipients and the full audit event timeline.",
    inputSchema: {
      type: "object",
      properties: {
        idOrCode: { type: "string", description: "Envelope id or public code" },
      },
      required: ["idOrCode"],
    },
    scope: "READONLY",
  },
  {
    name: "document_verify",
    description: "Verify a sealed document by its public code. Returns VERIFIED / NOT_SEALED / VOIDED / NOT_FOUND with seal details.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Public verification code, e.g. DOC-8F3K2M9P" },
      },
      required: ["code"],
    },
    scope: "READONLY",
  },
  {
    name: "template_list",
    description: "List workspace templates with usage counts and folders.",
    inputSchema: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Optional folder filter" },
      },
    },
    scope: "READONLY",
  },
];

export const MCP_DEFAULT_TOOLS = MCP_TOOLS.map((t) => t.name).join(",");

export type McpCallContext = { tenantId: string };

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
};

const rpcError = (id: JsonRpcRequest["id"], code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

const rpcOk = (id: JsonRpcRequest["id"], result: unknown) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  result,
});

const text = (t: string) => ({ content: [{ type: "text", text: t }] });

/** Execute an MCP tool call against real workspace data. */
export async function executeMcpTool(
  tool: string,
  args: Record<string, unknown>,
  ctx: McpCallContext,
): Promise<Record<string, unknown>> {
  switch (tool) {
    case "envelope_list": {
      const status = typeof args.status === "string" ? args.status : undefined;
      const page = Math.max(1, Number(args.page ?? 1));
      const perPage = Math.min(50, Math.max(5, Number(args.perPage ?? 10)));
      const where: Record<string, unknown> = { tenantId: ctx.tenantId };
      if (status) where.status = status;
      const [total, rows] = await Promise.all([
        db.envelope.count({ where }),
        db.envelope.findMany({
          where, orderBy: { createdAt: "desc" },
          skip: (page - 1) * perPage, take: perPage,
          include: { recipients: true },
        }),
      ]);
      return text(JSON.stringify({
        total, page, perPage,
        envelopes: rows.map((e) => ({
          code: e.publicCode, title: e.title, status: e.status,
          createdAt: e.createdAt.toISOString(), pages: e.pages,
          signers: e.recipients.filter((r) => r.status === "SIGNED").length,
        })),
      }, null, 2));
    }
    case "envelope_detail": {
      const key = String(args.idOrCode ?? "").trim();
      const e = await db.envelope.findFirst({
        where: { tenantId: ctx.tenantId, OR: [{ id: key }, { publicCode: key.toUpperCase() }] },
        include: { recipients: true, events: { orderBy: { at: "asc" } } },
      });
      if (!e) return text(`Envelope "${key}" not found in this workspace.`);
      return text(JSON.stringify({
        code: e.publicCode, title: e.title, status: e.status, pages: e.pages,
        sha256: e.sha256, sealedAt: e.sealedAt?.toISOString() ?? null,
        recipients: e.recipients.map(publicRecipient),
        timeline: e.events.map((ev) => ({ at: ev.at.toISOString(), action: ev.action, actor: ev.actor })),
      }, null, 2));
    }
    case "document_verify": {
      const code = String(args.code ?? "").trim().toUpperCase();
      const e = await db.envelope.findUnique({
        where: { publicCode: code },
        include: { recipients: true, tenant: { select: { name: true } } },
      });
      if (!e) return text(`NOT_FOUND - no sealed document with code ${code}.`);
      if (e.status === "VOIDED") return text(`VOIDED - ${e.title} was voided on ${e.voidedAt?.toISOString() ?? "unknown date"}.`);
      if (e.status !== "COMPLETED" || !e.sealedAt || !e.sha256) {
        return text(`NOT_SEALED - ${e.title} is ${e.status}; it is not sealed yet, so it cannot be verified.`);
      }
      return text(JSON.stringify({
        result: "VERIFIED", title: e.title, tenant: e.tenant.name,
        sealedAt: e.sealedAt.toISOString(), sha256: e.sha256,
        conformance: e.conformanceLevel,
        signers: e.recipients.filter((r) => r.status === "SIGNED").map((r) => ({ name: r.name, signedAt: r.signedAt?.toISOString() })),
      }, null, 2));
    }
    case "template_list": {
      const folder = typeof args.folder === "string" ? args.folder : undefined;
      const rows = await db.template.findMany({
        where: folder ? { tenantId: ctx.tenantId, folder } : { tenantId: ctx.tenantId },
        orderBy: { usageCount: "desc" }, take: 50,
      });
      return text(JSON.stringify({
        templates: rows.map((t) => ({ name: t.name, category: t.category, folder: t.folder, usageCount: t.usageCount })),
      }, null, 2));
    }
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

/** Handle a JSON-RPC request against the MCP surface. */
export async function handleMcpRequest(
  body: JsonRpcRequest,
  ctx: McpCallContext & { allowedTools: string[]; serverName?: string },
): Promise<Record<string, unknown>> {
  const { allowedTools } = ctx;
  switch (body.method) {
    case "initialize":
      return rpcOk(body.id, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: ctx.serverName ?? "docurama", version: "1.0.0" },
      });
    case "tools/list":
      return rpcOk(body.id, {
        tools: MCP_TOOLS.filter((t) => allowedTools.includes(t.name)).map((t) => ({
          name: t.name, description: t.description, inputSchema: t.inputSchema,
        })),
      });
    case "tools/call": {
      const name = body.params?.name ?? "";
      if (!allowedTools.includes(name)) return rpcError(body.id, -32602, `Tool "${name}" is not enabled for this workspace (Settings → MCP).`);
      const tool = MCP_TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(body.id, -32601, `Unknown tool: ${name}`);
      try {
        const result = await executeMcpTool(name, body.params?.arguments ?? {}, ctx);
        return rpcOk(body.id, result);
      } catch (err) {
        return rpcOk(body.id, {
          content: [{ type: "text", text: `Tool error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        });
      }
    }
    case "ping":
      return rpcOk(body.id, {});
    default:
      return rpcError(body.id, -32601, `Method not found: ${body.method ?? "(none)"}`);
  }
}

export const mcpToolsCatalogue = () => MCP_TOOLS.map((t) => ({ name: t.name, description: t.description, scope: t.scope }));
