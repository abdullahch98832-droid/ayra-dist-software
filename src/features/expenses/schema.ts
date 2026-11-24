import { z } from "zod";
import { SOL_METHODS } from "@/features/sol/schema";
import { isoDate, optionalDecimal, optionalId, optionalQuantity, positiveMoney, requiredId, requiredText, text } from "@/lib/validation/common";

export const EXPENSE_METHODS = SOL_METHODS;
export const EXPENSE_STATUSES = ["draft", "posted", "rejected", "void"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const expenseSchema = z.object({
  date: isoDate, categoryId: requiredId, amount: positiveMoney, accountId: requiredId, method: z.enum(EXPENSE_METHODS), reference: text(120), payee: requiredText(120), description: requiredText(500),
  vehicleId: optionalId, jobId: optionalId, litres: optionalDecimal, odometer: optionalQuantity, receiptPath: text(200), noReceiptReason: text(200), requestId: z.uuid(),
}).superRefine((v, ctx) => {
  if (v.receiptPath === "" && v.noReceiptReason === "") ctx.addIssue({ code: "custom", message: "required", path: ["noReceiptReason"] });
});
export type ExpenseValues = z.infer<typeof expenseSchema>;

export const VEHICLE_KINDS = ["fuel", "maintenance", "repair", "other"] as const;
export const categorySchema = z.object({
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,29}$/, "invalidUnitCode"), nameEn: requiredText(80), nameUr: requiredText(80), accountId: requiredId,
  vehicleKind: z.union([z.literal(""), z.enum(VEHICLE_KINDS)]), isActive: z.boolean(),
});
export type CategoryValues = z.infer<typeof categorySchema>;

/** A voucher that was refused before it reached the accounts is void without an entry. */
export const expenseStatus = (e: { status: string; journal_entry_id: string | null }): ExpenseStatus =>
  e.status === "void" ? (e.journal_entry_id ? "void" : "rejected") : e.status === "posted" ? "posted" : "draft";
