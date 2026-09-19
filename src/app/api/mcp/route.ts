import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { handleMcpRequest } from "@/lib/mcp";
import { jsonError } from "@/lib/serializers";
import { apiAccessAllowed } from "@/lib/billing";

/**
 * MCP (Model Context Protocol) server endpoint - JSON-RPC 2.0 over HTTP.
 *
 *   POST /api/mcp   { "jsonrpc": "2.0", "id": 1, "method": "initialize" | "tools/list" | "tools/call" | "ping" }
 *
 * Authentication: `X-API-Key` (Settings → API). The tenant's MCP configuration
 * (Settings → MCP) gates the endpoint: enabled flag, per-tool allowlist and a
 * per-key per-minute rate limit.
 */

export const dynamic = "force-dynamic";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// Naive in-memory rate limiter - sufficient for the single-node deployment.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(keyId: string, limitPerMin: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(keyId);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(keyId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= limitPerMin) return false;
  bucket.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const key = req.headers.get("x-api-key")?.trim();
    if (!key) {
      return jsonError("Missing X-API-Key header - create a key in Settings → API and pass it as X-API-Key", 401);
    }
    const apiKey = await db.apiKey.findFirst({
      where: { secretHash: sha(key), status: "ACTIVE", tenantId: { not: null } },
    });
    if (!apiKey || !apiKey.tenantId) return jsonError("Invalid or revoked API key", 401);
    if (!(await apiAccessAllowed(apiKey.tenantId))) return jsonError("API access is unavailable for this workspace plan or status", 403);

    const config = await db.mcpConfig.findUnique({ where: { tenantId: apiKey.tenantId } });
    if (!config || !config.enabled) {
      return jsonError("The MCP server is disabled for this workspace - enable it in Settings → MCP", 403);
    }
    if (!rateLimit(apiKey.id, config.rateLimitPerMin)) {
      return jsonError(`Rate limit exceeded (${config.rateLimitPerMin} requests/min) - retry in a minute`, 429);
    }

    await db.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonError("Invalid JSON-RPC body", 400);
    }

    const result = await handleMcpRequest(
      body as Parameters<typeof handleMcpRequest>[0],
      {
        tenantId: apiKey.tenantId,
        allowedTools: config.allowedTools.split(",").filter(Boolean),
        serverName: "docurama",
      },
    );
    return Response.json(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[mcp]", err);
    return jsonError("MCP request failed", 500);
  }
}

export async function GET() {
  return Response.json({
    name: "docurama",
    transport: "http-json-rpc",
    description: "Docurama MCP server - POST JSON-RPC 2.0 (initialize, tools/list, tools/call).",
    authentication: "X-API-Key header (Settings → API)",
    docs: "Settings → MCP in the Docurama workspace",
  });
}
