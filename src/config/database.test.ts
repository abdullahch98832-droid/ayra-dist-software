import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REQUIRED_MIGRATION, REQUIRED_VERSION } from "./database";

const dir = join(process.cwd(), "supabase/migrations");

describe("required database version", () => {
  it("is the newest migration, and that migration records its number", () => {
    expect(readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().at(-1)).toBe(REQUIRED_MIGRATION);
    expect(REQUIRED_VERSION).toMatch(/^\d{14}$/);
    expect(readFileSync(join(dir, REQUIRED_MIGRATION), "utf8")).toContain(`('schema_version', '"${REQUIRED_VERSION}"'`);
  });
});
