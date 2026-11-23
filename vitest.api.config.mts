import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["supabase/tests/api/**/*.api.test.ts"],
    testTimeout: 30_000,
  },
});
