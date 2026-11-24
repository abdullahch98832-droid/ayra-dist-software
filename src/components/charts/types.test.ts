import { describe, expect, it } from "vitest";
import { axisScale, formatTick } from "./types";

describe("axisScale", () => {
  it.each([
    [[], [0, 1]], [[0, 0], [0, 1]], [[4], [0, 1, 2, 3, 4]], [[60], [0, 20, 40, 60]], [[97], [0, 25, 50, 75, 100]],
    [[-30, 50], [-40, -20, 0, 20, 40, 60]], [[-5, -8], [-8, -6, -4, -2, 0]],
  ])("%j", (values, ticks) => expect(axisScale(values).ticks.map((t) => t + 0)).toEqual(ticks));

  it("always covers the data and includes zero", () => {
    for (let i = 1; i < 4000; i += 37) {
      const scale = axisScale([i, -i / 3]);
      expect(scale.high).toBeGreaterThanOrEqual(i);
      expect(scale.low).toBeLessThanOrEqual(-i / 3);
      expect(scale.ticks.some((t) => t === 0)).toBe(true);
    }
  });
});

describe("formatTick", () => {
  it.each([[0, "0"], [950, "950"], [12000, "12K"], [-1_500_000, "-1.5M"]])("%d", (v, text) => expect(formatTick(v)).toBe(text));
});
