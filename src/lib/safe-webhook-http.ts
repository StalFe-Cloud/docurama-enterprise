import dns from "node:dns/promises";
import { isIP, isIPv4, isIPv6 } from "node:net";
import http from "node:http";
import https from "node:https";

export const WEBHOOK_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

/** Conservative public-unicast policy; mapped and tunnelling IPv6 are rejected. */
export function isPublicAddress(address: string): boolean {
  if (isIPv4(address)) {
    const [a, b, c, d] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    // Azure's platform virtual address is not a customer webhook destination.
    if (a === 168 && b === 63 && c === 129 && d === 16) return false;
    return true;
  }
  if (!isIPv6(address) || address.includes("%") || address.includes(".")) return false;
  const [first, second] = address.toLowerCase().split(":").map((part) => parseInt(part || "0", 16));
  if (first < 0x2000 || first > 0x3fff) return false;
  if (first === 0x2001 && (second <= 0x01ff || second === 0x0db8)) return false;
  return first !== 0x2002 && first !== 0x3fff;
}

function internalOriginAllowed(url: URL): boolean {
  // Operator-only exact origins. No wildcard or tenant-controlled bypass.
  return (process.env.DOCURAMA_WEBHOOK_INTERNAL_ORIGINS ?? "").split(",").some((value) => {
    if (!value.trim()) return false;
    const configured = new URL(value.trim());
    if (configured.username || configured.password || configured.pathname !== "/" || configured.search || configured.hash) {
      throw new Error("Invalid operator webhook origin allowlist");
    }
    return configured.origin === url.origin;
  });
}

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function resolveWebhookTarget(raw: string, signal = AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)) {
  signal.throwIfAborted();
  const url = new URL(raw);
  if (url.username || url.password || url.hash) throw new Error("Webhook URLs must not contain credentials or fragments");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(hostname);
  const development = process.env.NODE_ENV !== "production" && process.env.DOCURAMA_ALLOW_PRIVATE_WEBHOOKS === "1" && loopback;
  const internal = internalOriginAllowed(url) || development;
  if (url.protocol !== "https:" && !(url.protocol === "http:" && internal)) throw new Error("Webhook endpoints must use HTTPS");
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  const ports = [443, ...(process.env.DOCURAMA_WEBHOOK_ALLOWED_PORTS ?? "").split(",").filter(Boolean).map(Number)];
  if (!internal && !ports.includes(port)) throw new Error("Webhook destination port is not allowed");
  if (!internal && (!hostname.includes(".") && !isIP(hostname) || /(?:^|\.)(?:localhost|local|internal)$/.test(hostname))) {
    throw new Error("Internal webhook hostname is not allowed");
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await abortable(dns.lookup(hostname, { all: true, verbatim: true }), signal);
  signal.throwIfAborted();
  if (!addresses.length || (!internal && addresses.some((item) => !isPublicAddress(item.address)))) {
    throw new Error("Webhook destination must resolve exclusively to public addresses");
  }
  return { url, ...addresses[0] };
}

export async function assertSafeWebhookUrl(raw: string): Promise<URL> {
  return (await resolveWebhookTarget(raw)).url;
}

/** No redirects; DNS, connect, and body read share one total deadline. */
export async function postWebhook(raw: string, body: string, headers: Record<string, string>): Promise<{ statusCode: number }> {
  const signal = AbortSignal.timeout(WEBHOOK_TIMEOUT_MS);
  const target = await resolveWebhookTarget(raw, signal);
  return new Promise((resolve, reject) => {
    const request = (target.url.protocol === "https:" ? https : http).request(target.url, {
      method: "POST", agent: false, family: target.family,
      // The original hostname remains the TLS/Host identity; the socket uses
      // exactly the address checked above, never a second DNS resolution.
      lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
      signal,
      headers: { ...headers, "Content-Type": "application/json", Host: target.url.host,
        "Content-Length": Buffer.byteLength(body) },
    }, (response) => {
      const statusCode = response.statusCode ?? 0;
      if (statusCode < 200 || statusCode >= 300) {
        response.destroy();
        reject(Object.assign(new Error(`endpoint returned ${statusCode}`), { statusCode }));
        return;
      }
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE_BYTES) {
          response.destroy();
          resolve({ statusCode });
        }
      });
      response.once("end", () => resolve({ statusCode }));
      response.once("error", reject);
      response.once("aborted", () => {
        if (bytes <= MAX_RESPONSE_BYTES) reject(new Error("Webhook response interrupted"));
      });
    });
    request.once("error", reject);
    request.end(body);
  });
}
