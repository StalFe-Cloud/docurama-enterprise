import { isIP } from "node:net";
/** Enable only when ingress strips and replaces client-supplied forwarding headers. */
export function requestClientIp(request: Pick<Request, "headers">): string {
  if (process.env.DOCURAMA_TRUST_PROXY_HEADERS !== "1") return "unknown";
  const value = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
  return value && isIP(value) ? value : "unknown";
}
