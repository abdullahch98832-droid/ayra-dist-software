import type { NextConfig } from "next";

// Cache Components is not enabled: every page is per-user and permission-dependent,
// and the root layout reads the language cookie to set <html lang/dir>.
const nextConfig: NextConfig = {
  // Off because the development log would print server action arguments, including passwords.
  logging: { serverFunctions: false },
  // HarfBuzz is WebAssembly: it is loaded from node_modules, and traced together with the fonts of the documents.
  serverExternalPackages: ["harfbuzzjs"],
  outputFileTracingIncludes: {
    "/documents/**": ["./src/lib/pdf/fonts/*.ttf", "./src/lib/pdf/brand/*.jpg", "./node_modules/harfbuzzjs/dist/*"],
  },
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
