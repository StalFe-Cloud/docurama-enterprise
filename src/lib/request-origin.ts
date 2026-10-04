/** Browser cookie writes must originate from the exact application origin.
 * Protocol callbacks and token-authenticated APIs retain their own validation.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PROTOCOL_ENDPOINTS = new Set([
  "/api/auth/sso/callback/saml",
  "/api/mcp",
  "/api/billing/webhook",
  "/api/attestations",
]);

/** Resolve the application's inbound authority without trusting a caller's
 * Origin. The edge must preserve Host and replace forwarded protocol headers. */
export function requestApplicationOrigin(request: Request): string {
  const target = new URL(request.url);
  const host = request.headers.get("host");
  if (host) {
    const authority = new URL(`${target.protocol}//${host}`);
    if (authority.username || authority.password || authority.pathname !== "/" || authority.search || authority.hash || authority.host.toLowerCase() !== host.toLowerCase()) throw new Error("Invalid application authority");
    target.host = authority.host;
  }
  const protocol = request.headers.get("x-forwarded-proto");
  if (protocol === "https" || protocol === "http") target.protocol = `${protocol}:`;
  if (!["http:", "https:"].includes(target.protocol)) throw new Error("Invalid application protocol");
  return target.origin;
}

export function browserMutationAllowed(request: Request): boolean {
  const target = new URL(request.url);
  // Legacy analysis GET computes and persists OCR metadata. Treat that
  // operation as effectful until the endpoint separates reads from work.
  const analysisGet = ["GET", "HEAD"].includes(request.method.toUpperCase()) && /^\/api\/workspace\/documents\/[^/]+\/analysis\/?$/.test(target.pathname);
  if (SAFE_METHODS.has(request.method.toUpperCase()) && !analysisGet) return true;
  if (!target.pathname.startsWith("/api/")) return true;
  if (PROTOCOL_ENDPOINTS.has(target.pathname) || target.pathname === "/api/v1" || target.pathname.startsWith("/api/v1/")) return true;

  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (!origin) {
    // Non-browser clients do not send Origin/Fetch Metadata. A browser's
    // explicit cross-site or sibling-origin request cannot use that path.
    return site !== "cross-site" && site !== "same-site";
  }
  if (origin === "null") return false;
  // Next may normalize a loopback request URL to localhost. The inbound
  // authority is the browser's actual target; never derive it from Origin.
  const host = request.headers.get("host");
  if (host) {
    try {
      const authority = new URL(`${target.protocol}//${host}`);
      if (authority.username || authority.password || authority.pathname !== "/" || authority.search || authority.hash || authority.host.toLowerCase() !== host.toLowerCase()) return false;
      target.host = authority.host;
    } catch { return false; }
  }
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  if (forwardedProtocol === "https" || forwardedProtocol === "http") target.protocol = `${forwardedProtocol}:`;
  try {
    const supplied = new URL(origin);
    return supplied.origin === origin && supplied.origin === target.origin;
  } catch {
    return false;
  }
}
