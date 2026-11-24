import { z } from "zod";
import { SOL_METHODS } from "@/features/sol/schema";
import { isoDate, optionalDecimal, optionalId, optionalQuantity, positiveMoney, requiredId, text } from "@/lib/validation/common";

export const EXPENSE_METHODS = SOL_METHODS;
export const expenseSchema = z.object({
  date: isoDate, categoryId: requiredId, amount: positiveMoney, accountId: requiredId, method: z.enum(EXPENSE_METHODS), reference: text(120), payee: text(120), description: text(500),
  vehicleId: optionalId, jobId: optionalId, litres: optionalDecimal, odometer: optionalQuantity, requestId: z.uuid(),
});
export type ExpenseValues = z.infer<typeof expenseSchema>;
