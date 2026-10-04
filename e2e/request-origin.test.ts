import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";

function request(path: string, options: { method?: string; origin?: string; site?: string; cookie?: boolean; forwardedProto?: string; contentType?: string } = {}) {
  const headers = new Headers();
  if (options.origin) headers.set("origin", options.origin);
  if (options.site) headers.set("sec-fetch-site", options.site);
  if (options.cookie) headers.set("cookie", "docurama_session=synthetic-session");
  if (options.forwardedProto) headers.set("x-forwarded-proto", options.forwardedProto);
  if (options.contentType) headers.set("content-type", options.contentType);
  return new NextRequest(`http://app.example.test${path}`, { method: options.method ?? "POST", headers });
}

describe("cookie mutation origin policy", () => {
  test("rejects cross-origin cookie writes, including simple text/plain requests", () => {
    for (const contentType of ["application/json", "text/plain"]) {
      expect(middleware(request("/api/workspace/settings", { origin: "https://hostile.example", cookie: true, contentType })).status).toBe(403);
    }
  });
  test("rejects a null Origin and cross-site fetch metadata", () => {
    expect(middleware(request("/api/workspace/settings", { origin: "null", cookie: true })).status).toBe(403);
    expect(middleware(request("/api/workspace/settings", { site: "cross-site", cookie: true })).status).toBe(403);
  });
  test("protects credential exchanges before a session exists", () => {
    expect(middleware(request("/api/auth/login", { origin: "https://hostile.example", contentType: "text/plain" })).status).toBe(403);
    expect(middleware(request("/api/auth/signup", { origin: "https://hostile.example" })).status).toBe(403);
  });
  test("permits same-origin writes and trusted reverse-proxy HTTPS", () => {
    expect(middleware(request("/api/workspace/settings", { origin: "http://app.example.test", cookie: true })).status).toBe(200);
    expect(middleware(request("/api/workspace/settings", { origin: "https://app.example.test", cookie: true, forwardedProto: "https" })).status).toBe(200);
    const normalized = new NextRequest("http://localhost:43123/api/auth/login", { method: "POST", headers: { host: "127.0.0.1:43123", origin: "http://127.0.0.1:43123" } });
    expect(middleware(normalized).status).toBe(200);
    const malicious = new NextRequest("http://localhost:43123/api/auth/login", { method: "POST", headers: { host: "127.0.0.1:43123", origin: "https://hostile.example" } });
    expect(middleware(malicious).status).toBe(403);
  });
  test("permits read-only requests and non-browser local clients", () => {
    expect(middleware(request("/api/workspace/settings", { method: "GET", origin: "https://hostile.example", cookie: true })).status).toBe(200);
    expect(middleware(request("/api/workspace/settings" )).status).toBe(200);
  });
  test("protects effectful document analysis GET without restricting normal reads", () => {
    expect(middleware(request("/api/workspace/documents/synthetic/analysis", { method: "GET", origin: "https://hostile.example", cookie: true })).status).toBe(403);
    expect(middleware(request("/api/workspace/documents/synthetic/analysis", { method: "GET", site: "cross-site", cookie: true })).status).toBe(403);
    expect(middleware(request("/api/workspace/documents/synthetic/analysis", { method: "HEAD", origin: "https://hostile.example", cookie: true })).status).toBe(403);
    expect(middleware(request("/api/workspace/documents/synthetic/analysis", { method: "GET", origin: "http://app.example.test", cookie: true })).status).toBe(200);
  });
  test("keeps protocol callbacks and independently authenticated APIs available", () => {
    for (const path of ["/api/auth/sso/callback/saml", "/api/v1/envelopes", "/api/mcp", "/api/billing/webhook", "/api/attestations"]) {
      expect(middleware(request(path, { origin: "https://provider.example", cookie: true })).status).toBe(200);
    }
  });
});
