import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it("accepts same-site paths", () => {
    expect(safeNextPath("/employees?q=a", "/dashboard")).toBe("/employees?q=a");
  });

  it("rejects external and protocol-relative destinations", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "evil", "", null, undefined]) {
      expect(safeNextPath(bad, "/dashboard")).toBe("/dashboard");
    }
  });
});
