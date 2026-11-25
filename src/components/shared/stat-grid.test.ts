import { describe, expect, it } from "vitest";
import { rowsOf } from "./stat-grid";

describe("rowsOf", () => {
  it("fills every row for any number of cards", () => {
    for (let n = 0; n <= 24; n++) {
      const rows = rowsOf(n);
      expect(rows.reduce((a, b) => a + b, 0), `${n} cards`).toBe(n);
      if (n >= 3) expect(rows.every((r) => r >= 2 && r <= 4), `${n} cards`).toBe(true);
    }
  });
});
