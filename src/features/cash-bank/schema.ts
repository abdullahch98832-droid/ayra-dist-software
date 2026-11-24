import { z } from "zod";
import { SOL_METHODS } from "@/features/sol/schema";
import { isoDate, money, optionalQuantity, optionalSignedMoney, positiveMoney, requiredId, requiredText, text } from "@/lib/validation/common";

export const ACCOUNT_TYPES = ["cash", "bank"] as const;
export const accountSchema = z.object({
  name: requiredText(120), type: z.enum(ACCOUNT_TYPES), bankName: text(120), accountTitle: text(160), accountNumber: text(60), iban: text(60), branch: text(120), notes: text(500), isActive: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.type === "bank" && v.bankName === "") ctx.addIssue({ code: "custom", message: "required", path: ["bankName"] });
});
export type AccountValues = z.infer<typeof accountSchema>;

export const BANK_METHODS = SOL_METHODS;
export const openingSchema = z.object({ accountId: requiredId, date: isoDate, amount: optionalSignedMoney.refine((v) => /[1-9]/.test(v), "required") });
export type OpeningValues = z.infer<typeof openingSchema>;

export const transferSchema = z.object({ fromId: requiredId, toId: requiredId, date: isoDate, amount: positiveMoney, method: z.enum(BANK_METHODS), reference: text(120), notes: text(300), requestId: z.uuid() })
  .superRefine((v, ctx) => {
    if (v.fromId === v.toId) ctx.addIssue({ code: "custom", message: "sameAccount", path: ["toId"] });
  });
export type TransferValues = z.infer<typeof transferSchema>;

export const VOUCHER_KINDS = ["receipt", "payment"] as const;
export const voucherSchema = z.object({
  kind: z.enum(VOUCHER_KINDS), date: isoDate, accountId: requiredId, counterId: requiredId, amount: positiveMoney, party: text(120), method: z.enum(BANK_METHODS), reference: text(120), description: requiredText(300), requestId: z.uuid(),
});
export type VoucherValues = z.infer<typeof voucherSchema>;

export const NOTES = ["5000", "1000", "500", "100", "50", "20", "10", "5", "2", "1"] as const;
export const closingSchema = z.object({ accountId: requiredId, date: isoDate, counted: money, notes: text(300), postDifference: z.boolean(), denominations: z.record(z.string(), optionalQuantity), requestId: z.uuid() });
export type ClosingValues = z.infer<typeof closingSchema>;
