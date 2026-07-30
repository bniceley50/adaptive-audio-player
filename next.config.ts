import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1:3100", "localhost:3100"],
  experimental: {
    // The transcription route streams and independently enforces this same cap.
    proxyClientMaxBodySize: 2_000_000_000,
  },
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": [
      "./.github/**/*",
      "./coverage/**/*",
      "./data/**/*",
      "./demo-assets/**/*",
      "./docs/**/*",
      "./public/**/*",
      "./scripts/**/*",
      "./src/**/*",
      "./tasks/**/*",
      "./test-results/**/*",
      "./tests/**/*",
      "./tts_sidecar/**/*",
      "./AGENTS.md",
      "./DECISIONS.md",
      "./PLAN.md",
      "./README.md",
      "./SECURITY.md",
      "./eslint.config.mjs",
      "./next.config.ts",
      "./package.json",
      "./playwright.config.ts",
      "./pnpm-lock.yaml",
      "./pnpm-workspace.yaml",
      "./postcss.config.mjs",
      "./tsconfig.json",
      "./tsconfig.tsbuildinfo",
      "./vitest.config.ts",
    ],
  },
};

export default nextConfig;
