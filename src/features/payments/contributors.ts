import { z } from "zod";
import { sumPaisa, toDbAmount, toPaisa } from "@/lib/utils/money";
import { positiveMoney, requiredId } from "@/lib/validation/common";

/** One person who paid or received part of the money: the cash or bank account of their share. */
export const contributorSchema = z.object({ accountId: requiredId, amount: positiveMoney });
export type ContributorValues = z.infer<typeof contributorSchema>;

/** The optional split of people on a payment; reused by every money-in / money-out form. */
export const contributorsField = z.array(contributorSchema).max(30);

export type ContributorsProblem = "contributorsTwo" | "contributorsTwice" | "contributorsSum";

/** What is wrong with a list of people, if anything. An empty list means one account, and is fine. */
export function contributorsProblem(contributors: { accountId?: string; amount?: string }[], amount: string | undefined): ContributorsProblem | null {
  if (contributors.length === 0) return null;
  if (contributors.length === 1) return "contributorsTwo";
  const chosen = contributors.map((c) => c.accountId).filter(Boolean);
  if (new Set(chosen).size !== chosen.length) return "contributorsTwice";
  const paisa = (s: string | undefined) => {
    try {
      return toPaisa(s || "0");
    } catch {
      return BigInt(-1);
    }
  };
  return sumPaisa(contributors.map((c) => paisa(c.amount))) === paisa(amount) ? null : "contributorsSum";
}

/** For a schema's superRefine: the people must be two or more, each once, adding up to the total. */
export function checkContributorsSum(contributors: ContributorValues[], amount: string, ctx: z.RefinementCtx): void {
  const problem = contributorsProblem(contributors, amount);
  if (problem) ctx.addIssue({ code: "custom", path: ["contributors"], message: problem });
}

/** The people as the database takes them; it adds each account's name. */
export const contributorsDoc = (contributors: ContributorValues[]) => contributors.map((c) => ({ account_id: c.accountId, amount: c.amount }));

/** Saved people as form rows. Lists saved before people had accounts come back without one, to be chosen again. */
export function readContributors(value: unknown): (ContributorValues & { name: string })[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((c) =>
    c && typeof c === "object" && typeof c.name === "string" && c.amount != null
      ? [{ accountId: typeof c.account_id === "string" ? c.account_id : "", name: c.name, amount: toDbAmount(toPaisa(String(c.amount))) }]
      : [],
  );
}

/** "Aftab Chattha, Mudassar Rao" when more than one person paid, otherwise null. */
export function peopleNames(value: unknown): string | null {
  const people = readContributors(value);
  return people.length ? people.map((c) => c.name).join(", ") : null;
}
