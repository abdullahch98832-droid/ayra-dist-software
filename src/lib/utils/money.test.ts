import { describe, expect, it } from "vitest";
import { formatPaisa, lineTotal, parseRupees, sumPaisa, toDbAmount, toPaisa } from "./money";

describe("parseRupees", () => {
  it("parses whole, fractional, grouped and negative amounts", () => {
    expect(parseRupees("1250")).toBe(BigInt(125000));
    expect(parseRupees("1,250.5")).toBe(BigInt(125050));
    expect(parseRupees("0.05")).toBe(BigInt(5));
    expect(parseRupees("-10.25")).toBe(BigInt(-1025));
  });

  it("rejects malformed input and more than two decimals", () => {
    expect(() => parseRupees("abc")).toThrow();
    expect(() => parseRupees("1.234")).toThrow();
    expect(() => parseRupees("")).toThrow();
  });
});

describe("arithmetic", () => {
  it("avoids the floating-point 0.1 + 0.2 error", () => {
    expect(sumPaisa([parseRupees("0.1"), parseRupees("0.2")])).toBe(parseRupees("0.3"));
  });

  it("computes line totals exactly", () => {
    expect(lineTotal(BigInt(144), parseRupees("12.35"))).toBe(parseRupees("1778.40"));
  });
});

describe("database conversion", () => {
  it("reads numeric values sent as JSON numbers or strings", () => {
    expect(toPaisa(1010.1)).toBe(BigInt(101010));
    expect(toPaisa(0.3)).toBe(BigInt(30));
    expect(toPaisa("-42.05")).toBe(BigInt(-4205));
    expect(toPaisa(123456789012.34)).toBe(BigInt(12345678901234));
  });

  it("writes paisa as an exact decimal string", () => {
    expect(toDbAmount(BigInt(123450))).toBe("1234.50");
    expect(toDbAmount(BigInt(-5))).toBe("-0.05");
    expect(toDbAmount(toPaisa("99.99"))).toBe("99.99");
  });
});

describe("formatPaisa", () => {
  it("formats with grouping and two decimals", () => {
    expect(formatPaisa(BigInt(12345678))).toBe("Rs 123,456.78");
    expect(formatPaisa(BigInt(-5))).toBe("-Rs 0.05");
  });
});
