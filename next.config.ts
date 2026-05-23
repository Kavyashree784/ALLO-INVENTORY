import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const appRoot = dirname(fileURLToPath(new URL(".", import.meta.url)));

const nextConfig: NextConfig = {
  turbopack: {
    root: appRoot,
  },
  // In development, allow requests from 127.0.0.1 (devboxes that hit the app via that host)
  // This enables HMR and font requests when the browser uses 127.0.0.1 instead of localhost.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
