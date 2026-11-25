import { describe, expect, it } from "vitest";
import { adjustmentSchema, countSchema, dispatchSchema, storedQuantity, transferSchema } from "./schema";

const id = "3f0f5c0e-7d0b-4a7e-9f39-0c4f1c9d2a10";
const id2 = "3f0f5c0e-7d0b-4a7e-9f39-0c4f1c9d2a11";
const messages = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) => r.error?.issues.map((i) => `${i.path.join(".")}:${i.message}`) ?? [];

describe("inventory documents", () => {
  it("needs two different warehouses for a transfer", () => {
    const doc = { fromId: id, toId: id, date: "2026-11-24", notes: "", requestId: id, lines: [{ productId: id, unitId: id, quantity: "5" }] };
    expect(messages(transferSchema.safeParse(doc))).toEqual(["toId:sameWarehouse"]);
    expect(transferSchema.safeParse({ ...doc, toId: id2 }).success).toBe(true);
    expect(messages(transferSchema.safeParse({ ...doc, toId: id2, lines: [] }))).toEqual(["lines:addLine"]);
  });

  it("keeps blank counts out but accepts a count of zero", () => {
    const doc = { warehouseId: id, date: "2026-11-24", notes: "", lines: [{ productId: id, counted: "", notes: "" }] };
    expect(messages(countSchema.safeParse(doc))).toEqual(["lines:addLine"]);
    expect(countSchema.safeParse({ ...doc, lines: [{ productId: id, counted: "0", notes: "" }] }).success).toBe(true);
    expect(countSchema.safeParse({ ...doc, lines: [{ productId: id, counted: "-1", notes: "" }] }).success).toBe(false);
  });

  it("asks for a cost on opening stock and a reason on everything else", () => {
    const line = { productId: id, unitId: id, quantity: "5", cost: "", notes: "" };
    const doc = { warehouseId: id, date: "2026-11-24", reason: "", requestId: id, lines: [line] };
    expect(messages(adjustmentSchema.safeParse({ ...doc, kind: "opening" }))).toEqual(["lines.0.cost:costRequired"]);
    expect(messages(adjustmentSchema.safeParse({ ...doc, kind: "write_off" }))).toEqual(["reason:required"]);
    expect(messages(adjustmentSchema.safeParse({ ...doc, kind: "write_off", reason: "x", lines: [{ ...line, quantity: "-5" }] }))).toEqual(["lines.0.quantity:positiveQuantity"]);
    expect(adjustmentSchema.safeParse({ ...doc, kind: "other", reason: "x", lines: [{ ...line, quantity: "-5" }] }).success).toBe(true);
  });

  it("stores write-offs as stock leaving", () => {
    expect(storedQuantity("write_off", "7")).toBe("-7");
    expect(storedQuantity("other", "-7")).toBe("-7");
    expect(storedQuantity("opening", "7")).toBe("7");
  });

  it("dispatches at least one line", () => {
    const doc = { orderId: id, date: "2026-11-24", vehicleId: "", driverId: "", suppliedBy: "", notes: "", requestId: id, lines: [{ itemId: id, quantity: "0" }] };
    expect(messages(dispatchSchema.safeParse(doc))).toEqual(["lines:nothingToDispatch"]);
    expect(dispatchSchema.safeParse({ ...doc, lines: [{ itemId: id, quantity: "2" }] }).success).toBe(true);
  });
});
