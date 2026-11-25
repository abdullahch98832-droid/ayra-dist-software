import { z } from "zod";
import { decimalQuantity, isoDate, money, optionalDate, optionalDecimal, optionalId, optionalMoney, optionalQuantity, positiveMoney, requiredId, requiredText, text } from "@/lib/validation/common";

const requestId = z.uuid();
const whole = (v: string) => /^\d+(\.0{1,2})?$/.test(v);

export const ITEM_KINDS = ["service", "product", "other"] as const;
export const jobSchema = z.object({
  customerId: requiredId, typeId: requiredId, contactName: text(120), contactPhone: text(40), address: text(300), description: text(1000), contract: money,
  responsibleId: optionalId, date: isoDate, startDate: optionalDate, dueDate: optionalDate, notes: text(1000), requestId,
  lines: z.array(z.object({
    id: optionalId, kind: z.enum(ITEM_KINDS), serviceId: optionalId, productId: optionalId, unitId: optionalId, description: text(300),
    quantity: decimalQuantity, price: optionalMoney, cost: optionalMoney,
  })),
}).superRefine((v, ctx) => {
  if (v.startDate !== "" && v.dueDate !== "" && v.dueDate < v.startDate) ctx.addIssue({ code: "custom", message: "dueBeforeStart", path: ["dueDate"] });
  v.lines.forEach((l, i) => {
    if (l.kind === "service" && l.serviceId === "") ctx.addIssue({ code: "custom", message: "required", path: ["lines", i, "serviceId"] });
    if (l.kind === "other" && l.description === "") ctx.addIssue({ code: "custom", message: "required", path: ["lines", i, "description"] });
    if (l.kind === "product" && !whole(l.quantity)) ctx.addIssue({ code: "custom", message: "invalidQuantity", path: ["lines", i, "quantity"] });
  });
});
export type JobValues = z.infer<typeof jobSchema>;

/** An order of a distributor: products only, each with a whole quantity and a price. */
export const orderSchema = jobSchema.superRefine((v, ctx) => {
  if (v.lines.length === 0) ctx.addIssue({ code: "custom", message: "required", path: ["lines"] });
  v.lines.forEach((l, i) => {
    if (l.kind !== "product") ctx.addIssue({ code: "custom", message: "required", path: ["lines", i, "productId"] });
    if (!/[1-9]/.test(l.price)) ctx.addIssue({ code: "custom", message: "positiveQuantity", path: ["lines", i, "price"] });
  });
});
export const buySchema = z.object({
  jobId: requiredId, warehouseId: requiredId, date: isoDate, expectedDate: optionalDate, notes: text(300), requestId,
  lines: z.array(z.object({ productId: requiredId, unitId: requiredId, quantity: optionalQuantity, price: optionalMoney })),
}).superRefine((v, ctx) => {
  if (!v.lines.some((l) => /[1-9]/.test(l.quantity))) ctx.addIssue({ code: "custom", message: "nothingToDispatch", path: ["notes"] });
  v.lines.forEach((l, i) => { if (/[1-9]/.test(l.quantity) && l.price === "") ctx.addIssue({ code: "custom", message: "required", path: ["lines", i, "price"] }); });
});
export type BuyValues = z.infer<typeof buySchema>;

const quantityLine = z.object({ itemId: z.uuid(), quantity: optionalDecimal });
export const plannedSchema = z.object({
  jobId: requiredId, vehicleId: optionalId, driverId: optionalId, warehouseId: optionalId, date: isoDate, destination: requiredText(300),
  odometerStart: optionalQuantity, notes: text(500), requestId, lines: z.array(quantityLine),
});
export type PlannedValues = z.infer<typeof plannedSchema>;
export const sentLines = (lines: { itemId: string; quantity: string }[]) => lines.filter((l) => /[1-9]/.test(l.quantity));

export const arrivalSchema = z.object({
  id: requiredId, receivedBy: text(120), notes: text(500), odometerEnd: optionalQuantity, warehouseId: optionalId, returnReason: text(300), lines: z.array(quantityLine),
}).superRefine((v, ctx) => {
  if (sentLines(v.lines).length > 0 && v.returnReason === "") ctx.addIssue({ code: "custom", message: "required", path: ["returnReason"] });
});
export type ArrivalValues = z.infer<typeof arrivalSchema>;

export const solReturnSchema = z.object({ deliveryId: requiredId, warehouseId: optionalId, reason: requiredText(300), requestId, lines: z.array(quantityLine) })
  .superRefine((v, ctx) => {
    if (sentLines(v.lines).length === 0) ctx.addIssue({ code: "custom", message: "nothingToDispatch", path: ["reason"] });
  });
export type SolReturnValues = z.infer<typeof solReturnSchema>;

export const SOL_METHODS = ["cash", "bank_transfer", "cheque", "other"] as const;
export const solPaymentSchema = z.object({
  jobId: requiredId, date: isoDate, amount: positiveMoney, method: z.enum(SOL_METHODS), accountId: requiredId, payerAccount: text(60), reference: text(120), notes: text(500), requestId,
}).superRefine((v, ctx) => {
  if (["bank_transfer", "cheque"].includes(v.method) && v.reference === "") ctx.addIssue({ code: "custom", message: "required", path: ["reference"] });
});
export type SolPaymentValues = z.infer<typeof solPaymentSchema>;

export const typeSchema = z.object({ nameEn: requiredText(120), nameUr: text(120), usesServices: z.boolean(), usesProducts: z.boolean(), usesDeliveries: z.boolean(), isActive: z.boolean() });
export const serviceSchema = z.object({ nameEn: requiredText(120), nameUr: text(120), unitLabel: text(40), unitLabelUr: text(40), price: optionalMoney, isActive: z.boolean() });
