import { describe, expect, it } from "vitest";
import { maskAccount } from "./mask";
import { decimalAbove, decimalAmount, wholeAbove } from "./quantity";

describe("maskAccount", () => {
  it("keeps the last four characters and is stable when repeated", () => {
    expect(maskAccount("PK36 SCBL 0000-1123 6702")).toBe("****6702");
    expect(maskAccount(maskAccount("0123456789"))).toBe("****6789");
    expect(maskAccount("12")).toBe("****12");
    for (const empty of ["", " - ", null, undefined]) expect(maskAccount(empty)).toBeNull();
  });
});

describe("decimalAmount", () => {
  it("is exact and rounds half up like the database", () => {
    expect(decimalAmount("2.5", "1500")).toBe(BigInt(375000));
    expect(decimalAmount("0.33", "0.50")).toBe(BigInt(17));
    expect(decimalAmount("0.01", "0.50")).toBe(BigInt(1));
    expect(decimalAmount("", "5")).toBeNull();
    expect(decimalAmount("1", "x")).toBeNull();
  });
});

describe("limits while typing", () => {
  it("never throw on unfinished numbers", () => {
    for (const unfinished of ["", "1.", "x", "-", "1e3"]) {
      expect(decimalAbove(unfinished, "0")).toBe(false);
      expect(wholeAbove(unfinished, 0)).toBe(false);
    }
    expect([decimalAbove("2.51", "2.5"), decimalAbove("2.5", "2.5"), wholeAbove("6", 5), wholeAbove("5", "5")]).toEqual([true, false, true, false]);
  });
});
