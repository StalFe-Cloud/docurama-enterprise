import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@napi-rs/canvas", "sharp", "tesseract.js", "pdfjs-dist"],
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async redirects() {
    return [
      { source: "/sign_up", destination: "/login", permanent: false },
      { source: "/signup", destination: "/login", permanent: false },
      { source: "/sign", destination: "/documents", permanent: false },
    ];
  },
};

export default nextConfig;
