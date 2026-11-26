import { z } from "zod";
import { checkContributorsSum, contributorsField } from "@/features/payments/contributors";
import { isoDate, positiveMoney, requiredId, requiredText, text } from "@/lib/validation/common";

/** Money paid out is an extra cost or a payment toward goods; money in is owner's investment. */
export const EXTRA_DIRECTIONS = ["in", "out"] as const;
export const EXTRA_KINDS = ["extra", "account"] as const;
export const EXTRA_METHODS = ["cash", "bank_transfer", "cheque", "online", "other"] as const;

export const extraSchema = z
  .object({
    name: requiredText(160),
    date: isoDate,
    amount: positiveMoney,
    direction: z.enum(EXTRA_DIRECTIONS),
    kind: z.enum(EXTRA_KINDS),
    accountId: requiredId,
    method: z.enum(EXTRA_METHODS),
    reference: text(120),
    notes: text(500),
    contributors: contributorsField,
    requestId: z.uuid(),
  })
  .superRefine((v, ctx) => checkContributorsSum(v.contributors, v.amount, ctx));
export type ExtraValues = z.infer<typeof extraSchema>;
