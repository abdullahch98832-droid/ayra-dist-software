import type { NextConfig } from "next";

// Cache Components is not enabled: every page is per-user and permission-dependent,
// and the root layout reads the language cookie to set <html lang/dir>.
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Employee photos are limited to 5 MB by the storage bucket; leave room for multipart overhead.
      bodySizeLimit: "6mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
