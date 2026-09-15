import { NextResponse } from "next/server";

/**
 * API index for api.docurama.eu (and /api on any host). Lists the live
 * surfaces of this deployment instead of a placeholder.
 */
export function GET() {
  return NextResponse.json({
    name: "Docurama API",
    version: "1.0.0",
    company: "Docurama SAS",
    documentation: "https://docs.docurama.eu",
    status: "https://status.docurama.eu",
    endpoints: {
      session: {
        login: "POST /api/auth/login",
        me: "GET /api/auth/me",
        logout: "POST /api/auth/logout",
      },
      publicApi: {
        envelopes: "GET /api/v1/envelopes",
        envelope: "GET /api/v1/envelopes/{id}",
        templates: "GET /api/v1/templates",
        verify: "GET /api/v1/verify/{code}",
      },
      mcp: "POST /api/mcp (JSON-RPC 2.0)",
    },
    authentication: {
      publicApi: "X-API-Key header, keys created under Settings > API",
      session: "HttpOnly cookie or Authorization: Bearer token",
    },
  });
}
