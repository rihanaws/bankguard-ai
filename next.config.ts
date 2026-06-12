import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: projectRoot,
  // Workers in /workflows are deployed separately (Hetzner) — never bundled
  // into the Next.js build.
  outputFileTracingExcludes: {
    "*": ["./workflows/**"],
  },
};

export default nextConfig;
