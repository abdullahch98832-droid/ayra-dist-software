import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["supabase/tests/*.test.ts"],
    globalSetup: ["supabase/tests/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
