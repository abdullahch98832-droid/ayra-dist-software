import { describe, expect, it } from "vitest";
import { axisTicks } from "./types";

describe("axisTicks", () => {
  it.each([[0, [0, 1]], [4, [0, 1, 2, 3, 4]], [60, [0, 20, 40, 60]], [97, [0, 25, 50, 75, 100]]])("covers %d", (max, ticks) => {
    expect(axisTicks(max)).toEqual(ticks);
  });

  it("always reaches the maximum", () => {
    for (let max = 1; max < 5000; max += 37) expect(axisTicks(max).at(-1)).toBeGreaterThanOrEqual(max);
  });
});
