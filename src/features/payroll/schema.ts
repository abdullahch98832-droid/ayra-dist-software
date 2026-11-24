import { z } from "zod";
import { SOL_METHODS } from "@/features/sol/schema";
import { isoDate, optionalMoney, positiveMoney, requiredId, text } from "@/lib/validation/common";

export const PAY_METHODS = SOL_METHODS;
const amount = optionalMoney;
export const payrollSchema = z.object({
  notes: text(500),
  lines: z.array(z.object({ employeeId: z.uuid(), basic: amount, allowances: amount, bonus: amount, deductions: amount, recovery: amount, notes: text(200) })),
});
export type PayrollValues = z.infer<typeof payrollSchema>;

export const paySchema = z.object({
  date: isoDate, accountId: requiredId, method: z.enum(PAY_METHODS), reference: text(120), requestId: z.uuid(), lines: z.array(z.object({ itemId: z.uuid(), amount })),
}).superRefine((v, ctx) => {
  if (!v.lines.some((l) => /[1-9]/.test(l.amount))) ctx.addIssue({ code: "custom", message: "nothingToDispatch", path: ["accountId"] });
  if (["bank_transfer", "cheque"].includes(v.method) && v.reference === "") ctx.addIssue({ code: "custom", message: "required", path: ["reference"] });
});
export type PayValues = z.infer<typeof paySchema>;

export const advanceSchema = z.object({ employeeId: requiredId, date: isoDate, amount: positiveMoney, accountId: requiredId, method: z.enum(PAY_METHODS), reference: text(120), reason: text(300), requestId: z.uuid() });
export type AdvanceValues = z.infer<typeof advanceSchema>;

export const salarySchema = z.object({ employeeId: z.uuid(), salary: optionalMoney });
export const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, "invalidDate");
