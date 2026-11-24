import { z } from "zod";
import { amountOf } from "@/lib/utils/quantity";
import { parseRupees } from "@/lib/utils/money";
import { isoDate, money, optionalDate, optionalId, optionalMoney, optionalQuantity, quantity, requiredId, text } from "@/lib/validation/common";

const requestId = z.uuid();

export const orderSchema = z.object({
  customerId: requiredId, orderTakerId: optionalId, warehouseId: requiredId, date: isoDate, requiredDate: optionalDate, notes: text(1000), requestId,
  lines: z.array(z.object({ productId: requiredId, unitId: requiredId, quantity, price: money, discount: optionalMoney })).min(1, "addLine"),
}).superRefine((v, ctx) => {
  if (v.requiredDate !== "" && v.requiredDate < v.date) ctx.addIssue({ code: "custom", message: "invalidDate", path: ["requiredDate"] });
  v.lines.forEach((l, i) => {
    const gross = amountOf([l.quantity], l.price);
    if (l.discount !== "" && gross !== null && parseRupees(l.discount) > gross) ctx.addIssue({ code: "custom", message: "discountTooHigh", path: ["lines", i, "discount"] });
  });
});
export type OrderValues = z.infer<typeof orderSchema>;

export const CONDITIONS = ["saleable", "damaged"] as const;
export const deliverySchema = z.object({
  id: requiredId, receivedBy: text(120), notes: text(500), returnReason: text(300),
  lines: z.array(z.object({ itemId: z.uuid(), quantity: optionalQuantity, condition: z.enum(CONDITIONS) })),
}).superRefine((v, ctx) => {
  if (v.lines.some((l) => /[1-9]/.test(l.quantity)) && v.returnReason === "") ctx.addIssue({ code: "custom", message: "required", path: ["returnReason"] });
});
export type DeliveryValues = z.infer<typeof deliverySchema>;

export const returnSchema = z.object({
  customerId: requiredId, invoiceId: optionalId, warehouseId: requiredId, damagedWarehouseId: optionalId, date: isoDate, reason: text(300), requestId,
  lines: z.array(z.object({ invoiceItemId: optionalId, productId: requiredId, unitId: requiredId, quantity: optionalQuantity, price: optionalMoney, condition: z.enum(CONDITIONS) })),
}).superRefine((v, ctx) => {
  const kept = v.lines.filter((l) => /[1-9]/.test(l.quantity));
  if (kept.length === 0) ctx.addIssue({ code: "custom", message: "addLine", path: ["lines"] });
  if (kept.some((l) => l.condition === "damaged") && v.damagedWarehouseId === "") ctx.addIssue({ code: "custom", message: "required", path: ["damagedWarehouseId"] });
  if (v.reason === "") ctx.addIssue({ code: "custom", message: "required", path: ["reason"] });
  // Lines of an invoice take its price; others need one, and may not be left blank.
  v.lines.forEach((l, i) => {
    if (l.invoiceItemId !== "") return;
    if (!/[1-9]/.test(l.quantity)) ctx.addIssue({ code: "custom", message: "positiveQuantity", path: ["lines", i, "quantity"] });
    if (l.price === "") ctx.addIssue({ code: "custom", message: "required", path: ["lines", i, "price"] });
  });
});
export type ReturnValues = z.infer<typeof returnSchema>;
export const returnedLines = (values: ReturnValues) => values.lines.filter((l) => /[1-9]/.test(l.quantity));
