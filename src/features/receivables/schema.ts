import { z } from "zod";
import { checkContributorsSum, contributorsField } from "@/features/payments/contributors";
import { isoDate, optionalId, optionalMoney, optionalSignedMoney, positiveMoney, requiredId, text } from "@/lib/validation/common";

export const PAYMENT_METHODS = ["cash", "bank_transfer", "cheque", "online", "other"] as const;
/** Destination value for cash that stays with the order taker. */
export const HELD = "held";

export const paymentSchema = z.object({
  customerId: requiredId, date: isoDate, amount: positiveMoney, method: z.enum(PAYMENT_METHODS),
  destination: z.union([z.literal(HELD), z.uuid("required")]), collectedBy: optionalId, reference: text(120), notes: text(500), requestId: z.uuid(),
  allocations: z.array(z.object({ invoiceId: z.uuid(), amount: optionalMoney })),
  contributors: contributorsField,
}).superRefine((v, ctx) => {
  checkContributorsSum(v.contributors, v.amount, ctx);
  if (v.destination === HELD && v.method !== "cash") ctx.addIssue({ code: "custom", message: "heldCashOnly", path: ["destination"] });
  if (v.destination === HELD && v.collectedBy === "") ctx.addIssue({ code: "custom", message: "required", path: ["collectedBy"] });
  if (v.method === "bank_transfer" && v.reference === "") ctx.addIssue({ code: "custom", message: "required", path: ["reference"] });
});
export type PaymentValues = z.infer<typeof paymentSchema>;

export const depositSchema = z.object({
  employeeId: requiredId, date: isoDate, amount: positiveMoney, accountId: requiredId, reference: text(120), notes: text(500), requestId: z.uuid(),
  contributors: contributorsField,
}).superRefine((v, ctx) => checkContributorsSum(v.contributors, v.amount, ctx));
export type DepositValues = z.infer<typeof depositSchema>;

export const NOTE_KINDS = ["credit", "debit", "opening"] as const;
export const noteSchema = z.object({
  kind: z.enum(NOTE_KINDS), customerId: requiredId, invoiceId: optionalId, date: isoDate, amount: optionalSignedMoney, reason: text(300), requestId: z.uuid(),
}).superRefine((v, ctx) => {
  if (!/[1-9]/.test(v.amount) || (v.kind !== "opening" && v.amount.startsWith("-"))) ctx.addIssue({ code: "custom", message: "positiveQuantity", path: ["amount"] });
  if (v.kind !== "opening" && v.reason === "") ctx.addIssue({ code: "custom", message: "required", path: ["reason"] });
});
export type NoteValues = z.infer<typeof noteSchema>;

export const settleSchema = z.object({ paymentId: z.uuid(), allocations: z.array(z.object({ invoiceId: z.uuid(), amount: optionalMoney })) });

export interface OpenInvoice {
  id: string;
  number: string;
  date: string;
  dueDate: string | null;
  outstanding: string;
}
