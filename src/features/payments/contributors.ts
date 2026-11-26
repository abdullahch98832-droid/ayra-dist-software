import { z } from "zod";
import { sumPaisa, toPaisa } from "@/lib/utils/money";
import { positiveMoney, requiredText } from "@/lib/validation/common";

/** One person who paid or received part of the money, and how much. */
export const contributorSchema = z.object({ name: requiredText(120), amount: positiveMoney });
export type ContributorValues = z.infer<typeof contributorSchema>;

/** The optional split of people on a payment; reused by every money-in / money-out form. */
export const contributorsField = z.array(contributorSchema).max(30);

/** For a schema's superRefine: when people are listed, their amounts must add up to the total. */
export function checkContributorsSum(contributors: ContributorValues[], amount: string, ctx: z.RefinementCtx): void {
  if (contributors.length > 0 && sumPaisa(contributors.map((c) => toPaisa(c.amount))) !== toPaisa(amount)) {
    ctx.addIssue({ code: "custom", path: ["contributors"], message: "contributorsSum" });
  }
}
