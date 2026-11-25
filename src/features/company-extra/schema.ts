import { z } from "zod";
import { isoDate, positiveMoney, requiredId, requiredText, text } from "@/lib/validation/common";

export const EXTRA_KINDS = ["extra", "account"] as const;
export const EXTRA_METHODS = ["cash", "bank_transfer", "cheque", "online", "other"] as const;
export const extraSchema = z.object({
  name: requiredText(160), date: isoDate, time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "invalidDate"), amount: positiveMoney, kind: z.enum(EXTRA_KINDS), accountId: requiredId, method: z.enum(EXTRA_METHODS),
  reference: text(120), notes: text(500), requestId: z.uuid(),
});
export type ExtraValues = z.infer<typeof extraSchema>;
