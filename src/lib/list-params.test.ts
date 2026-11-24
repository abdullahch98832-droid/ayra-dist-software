import { describe, expect, it } from "vitest";
import { firstRow, lastRow, listParams } from "./list-params";

describe("list parameters", () => {
  it("reads valid values and ignores the rest", () => {
    expect(listParams({}, ["draft"])).toEqual({ q: "", status: "", page: 1, supplierId: null });
    expect(listParams({ q: "PO-1", status: "draft", page: "3", supplier: "3f0f5c0e-7d0b-4a7e-9f39-0c4f1c9d2a10" }, ["draft"]))
      .toEqual({ q: "PO-1", status: "draft", page: 3, supplierId: "3f0f5c0e-7d0b-4a7e-9f39-0c4f1c9d2a10" });
    expect(listParams({ q: "a,b)(*%", status: "x", page: "-4", supplier: "1 or 1" }, ["draft"])).toEqual({ q: "a b", status: "", page: 1, supplierId: null });
    expect(listParams({ page: ["2", "3"], q: ["x"] }, []).page).toBe(1);
  });

  it("numbers rows from zero", () => {
    expect([firstRow(1), lastRow(1), firstRow(3)]).toEqual([0, 49, 100]);
  });
});
