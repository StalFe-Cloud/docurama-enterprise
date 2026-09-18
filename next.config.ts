import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@napi-rs/canvas", "sharp", "tesseract.js", "pdfjs-dist"],
  // F3 (docs/IMPROVEMENT-PLAN.md): type errors fail the build again.
  // Kept clean via `bunx tsc --noEmit`, enforced in CI (.github/workflows/e2e.yml).
  reactStrictMode: false,
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
