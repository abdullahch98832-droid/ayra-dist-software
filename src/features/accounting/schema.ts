import { z } from "zod";
import { isoDate, optionalId, optionalMoney, requiredId, requiredText } from "@/lib/validation/common";
import { parseRupees } from "@/lib/utils/money";

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;
export const CASH_SECTIONS = ["operating", "investing", "financing"] as const;
export const ledgerAccountSchema = z.object({
  code: z.string().trim().regex(/^[0-9][0-9.]{0,19}$/, "invalidQuantity"), nameEn: requiredText(120), nameUr: requiredText(120), type: z.enum(ACCOUNT_TYPES), parentId: optionalId, isGroup: z.boolean(),
  cashFlow: z.union([z.literal(""), z.enum(CASH_SECTIONS)]), isActive: z.boolean(),
});
export type LedgerAccountValues = z.infer<typeof ledgerAccountSchema>;

const ZERO = BigInt(0);
export const paisaOf = (text: string) => {
  try {
    return text.trim() === "" ? ZERO : parseRupees(text);
  } catch {
    return ZERO;
  }
};

export const journalSchema = z.object({
  date: isoDate, description: requiredText(300), requestId: z.uuid(),
  lines: z.array(z.object({ accountId: requiredId, customerId: optionalId, supplierId: optionalId, debit: optionalMoney, credit: optionalMoney })).min(2, "addLine"),
}).superRefine((v, ctx) => {
  v.lines.forEach((l, i) => {
    const [debit, credit] = [paisaOf(l.debit), paisaOf(l.credit)];
    if ((debit > ZERO) === (credit > ZERO)) ctx.addIssue({ code: "custom", message: "oneSide", path: ["lines", i, "debit"] });
  });
  const difference = v.lines.reduce((sum, l) => sum + paisaOf(l.debit) - paisaOf(l.credit), ZERO);
  if (difference !== ZERO) ctx.addIssue({ code: "custom", message: "notBalanced", path: ["lines"] });
});
export type JournalValues = z.infer<typeof journalSchema>;
