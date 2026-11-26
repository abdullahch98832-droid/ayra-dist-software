import { z } from "zod";
import { sumPaisa, toPaisa } from "@/lib/utils/money";
import { isoDate, positiveMoney, requiredId, requiredText, text } from "@/lib/validation/common";

/** Money paid out is an extra cost or a payment toward goods; money in is owner's investment. */
export const EXTRA_DIRECTIONS = ["in", "out"] as const;
export const EXTRA_KINDS = ["extra", "account"] as const;
export const EXTRA_METHODS = ["cash", "bank_transfer", "cheque", "online", "other"] as const;

/** One person who gave part of the money, and how much. */
export const contributorSchema = z.object({ name: requiredText(120), amount: positiveMoney });
export type ContributorValues = z.infer<typeof contributorSchema>;

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
    contributors: z.array(contributorSchema).max(30),
    requestId: z.uuid(),
  })
  .superRefine((v, ctx) => {
    // When people are listed, their amounts must add up to the total.
    if (v.contributors.length > 0 && sumPaisa(v.contributors.map((c) => toPaisa(c.amount))) !== toPaisa(v.amount)) {
      ctx.addIssue({ code: "custom", path: ["contributors"], message: "contributorsSum" });
    }
  });
export type ExtraValues = z.infer<typeof extraSchema>;
