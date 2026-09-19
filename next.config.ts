import type { NextConfig } from "next";

// ── Content-Security-Policy ──────────────────────────────────────────────────
// Pragmatic production CSP: self-hosted fonts and assets, inline styles
// (Tailwind/runtime theming), inline scripts (the Next.js bootstrap hydration
// payload), data:/blob: images (generated QR codes, canvas page previews).
// 'unsafe-eval' is only required by the dev-mode React refresh runtime.
// Turnstile's script and iframe are allowed only when its public site key is
// configured. Verification, TSA and DNS calls remain server-side.
const isDev = process.env.NODE_ENV !== "production";
const turnstileSource = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? " https://challenges.cloudflare.com" : "";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${turnstileSource}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  `frame-src 'self'${turnstileSource}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@napi-rs/canvas", "sharp", "tesseract.js", "pdfjs-dist"],
  // F3 (docs/IMPROVEMENT-PLAN.md): type errors fail the build again.
  // Kept clean via `bunx tsc --noEmit`, enforced in CI (.github/workflows/e2e.yml).
  reactStrictMode: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
      // Authenticated API responses must never be cached by intermediaries.
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/sign_up", destination: "/login", permanent: false },
      { source: "/signup", destination: "/login", permanent: false },
      // NOTE: the old "/sign -> /documents" vanity redirect was removed —
      // /sign is now the public signer portal (/sign/{token}).
    ];
  },
};

export default nextConfig;
