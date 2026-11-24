import { z } from "zod";
import { isoDate, money, optionalDate, optionalId, optionalMoney, optionalQuantity, positiveMoney, quantity, requiredId, requiredText, text } from "@/lib/validation/common";

const line = { productId: requiredId, unitId: requiredId };
/** Sent with a new document so a repeated submit returns the first one. */
const requestId = z.uuid();

export const orderSchema = z.object({
  supplierId: requiredId, warehouseId: requiredId, date: isoDate, expectedDate: optionalDate, notes: text(1000), requestId,
  lines: z.array(z.object({ ...line, quantity, price: money })).min(1, "addLine"),
});
export type OrderValues = z.infer<typeof orderSchema>;

const hasQuantity = (l: { accepted: string; damaged: string; rejected: string }) => /[1-9]/.test(`${l.accepted}${l.damaged}${l.rejected}`);
export const receiptSchema = z.object({
  supplierId: requiredId, orderId: optionalId, warehouseId: requiredId, damagedWarehouseId: optionalId, date: isoDate, reference: text(80), notes: text(1000), requestId,
  lines: z.array(z.object({
    ...line, orderItemId: optionalId, expected: optionalQuantity, accepted: optionalQuantity, damaged: optionalQuantity, rejected: optionalQuantity, cost: money, notes: text(200),
  })).min(1, "addLine"),
}).superRefine((v, ctx) => {
  if (!v.lines.some(hasQuantity)) v.lines.forEach((_, i) => ctx.addIssue({ code: "custom", message: "positiveQuantity", path: ["lines", i, "accepted"] }));
  // Order lines that did not arrive may stay blank; free lines may not.
  else v.lines.forEach((l, i) => { if (!l.orderItemId && !hasQuantity(l)) ctx.addIssue({ code: "custom", message: "positiveQuantity", path: ["lines", i, "accepted"] }); });
  if (v.lines.some((l) => /[1-9]/.test(l.damaged)) && !v.damagedWarehouseId) ctx.addIssue({ code: "custom", message: "required", path: ["damagedWarehouseId"] });
});
export type ReceiptValues = z.infer<typeof receiptSchema>;
export const receivedLines = (values: ReceiptValues) => values.lines.filter(hasQuantity);

export const billSchema = z.object({
  supplierId: requiredId, number: requiredText(60), date: isoDate, dueDate: optionalDate, amount: positiveMoney, notes: text(1000),
  receiptIds: z.array(z.uuid()).min(1, "addLine"),
}).refine((v) => v.dueDate === "" || v.dueDate >= v.date, { message: "invalidDate", path: ["dueDate"] });
export type BillValues = z.infer<typeof billSchema>;

export const returnSchema = z.object({
  supplierId: requiredId, warehouseId: requiredId, date: isoDate, reason: text(300), requestId,
  lines: z.array(z.object({ ...line, quantity, price: money })).min(1, "addLine"),
});
export type ReturnValues = z.infer<typeof returnSchema>;

export const PAYMENT_METHODS = ["cash", "bank_transfer", "cheque", "online", "other"] as const;
export const paymentSchema = z.object({
  supplierId: requiredId, date: isoDate, amount: positiveMoney, accountId: requiredId, method: z.enum(PAYMENT_METHODS), reference: text(120), notes: text(500), requestId,
  allocations: z.array(z.object({ billId: z.uuid(), amount: optionalMoney })),
});
export type PaymentValues = z.infer<typeof paymentSchema>;
