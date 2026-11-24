import { describe, expect, it } from "vitest";
import { amountOf, breakdown, convertPrice, parseQuantity } from "./quantity";

describe("quantities", () => {
  it("parses whole numbers only", () => {
    expect(parseQuantity(" 12 ")).toBe(BigInt(12));
    expect(parseQuantity("-3")).toBe(BigInt(-3));
    for (const bad of ["", "1.5", "1e3", "x", undefined]) expect(parseQuantity(bad)).toBeNull();
  });

  it("multiplies exactly", () => {
    expect(amountOf(["3", "2"], "0.10")).toBe(BigInt(50));
    expect(amountOf(["999999", ""], "12345678.99")).toBe(BigInt(999999) * BigInt(1234567899));
    expect(amountOf(["x"], "1")).toBeNull();
    expect(amountOf(["1"], "")).toBeNull();
  });

  it("breaks base units into larger units", () => {
    const units = [{ name: "Piece", factor: BigInt(1) }, { name: "Box", factor: BigInt(12) }, { name: "Carton", factor: BigInt(72) }];
    expect(breakdown(BigInt(150), units)).toEqual([{ name: "Carton", count: BigInt(2) }, { name: "Piece", count: BigInt(6) }]);
    expect(breakdown(BigInt(0), units)).toEqual([]);
  });

  it("restates a price for another unit", () => {
    expect(convertPrice(BigInt(100000), BigInt(72), BigInt(1))).toBe(BigInt(1389));
    expect(convertPrice(BigInt(1389), BigInt(1), BigInt(72))).toBe(BigInt(100008));
    expect(convertPrice(BigInt(100), BigInt(8), BigInt(1))).toBe(BigInt(13));
  });
});
