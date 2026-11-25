import { z } from "zod";
import { isoDate, optionalId, optionalMoney, optionalQuantity, quantity, requiredId, signedQuantity, text } from "@/lib/validation/common";

const requestId = z.uuid();

export const transferSchema = z.object({
  fromId: requiredId, toId: requiredId, date: isoDate, notes: text(1000), requestId,
  lines: z.array(z.object({ productId: requiredId, unitId: requiredId, quantity })).min(1, "addLine"),
}).refine((v) => v.fromId !== v.toId, { message: "sameWarehouse", path: ["toId"] });
export type TransferValues = z.infer<typeof transferSchema>;

/** Products that were not counted stay blank and are not saved. */
export const countSchema = z.object({
  warehouseId: requiredId, date: isoDate, notes: text(1000),
  lines: z.array(z.object({ productId: requiredId, counted: optionalQuantity, notes: text(200) })),
}).refine((v) => v.lines.some((l) => l.counted !== ""), { message: "addLine", path: ["lines"] });
export type CountValues = z.infer<typeof countSchema>;

export const ADJUSTMENT_KINDS = ["opening", "write_off", "other"] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];
/** Quantities are positive for opening stock and write-offs; other adjustments carry their sign. */
export const adjustmentSchema = z.object({
  warehouseId: requiredId, date: isoDate, kind: z.enum(ADJUSTMENT_KINDS), reason: text(300), requestId,
  lines: z.array(z.object({ productId: requiredId, unitId: requiredId, quantity: signedQuantity, cost: optionalMoney, notes: text(200) })).min(1, "addLine"),
}).superRefine((v, ctx) => {
  if (v.kind !== "opening" && v.reason === "") ctx.addIssue({ code: "custom", message: "required", path: ["reason"] });
  v.lines.forEach((l, i) => {
    if (v.kind !== "other" && l.quantity.startsWith("-")) ctx.addIssue({ code: "custom", message: "positiveQuantity", path: ["lines", i, "quantity"] });
    if (v.kind === "opening" && l.cost === "") ctx.addIssue({ code: "custom", message: "costRequired", path: ["lines", i, "cost"] });
  });
});
export type AdjustmentValues = z.infer<typeof adjustmentSchema>;
/** The quantity as the database stores it: negative for anything leaving stock. */
export const storedQuantity = (kind: AdjustmentKind, quantity: string) => (kind === "write_off" ? `-${quantity}` : quantity);

export const dispatchSchema = z.object({
  orderId: requiredId, date: isoDate, vehicleId: optionalId, driverId: optionalId, suppliedBy: optionalId, notes: text(500), requestId,
  lines: z.array(z.object({ itemId: z.uuid(), quantity: optionalQuantity })),
}).refine((v) => v.lines.some((l) => /[1-9]/.test(l.quantity)), { message: "nothingToDispatch", path: ["lines"] });
export type DispatchValues = z.infer<typeof dispatchSchema>;
