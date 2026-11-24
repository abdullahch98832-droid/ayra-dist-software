import { z } from "zod";
import { requiredText, text } from "@/lib/validation/common";

export const ACCOUNT_TYPES = ["cash", "bank"] as const;
export const accountSchema = z.object({
  name: requiredText(120), type: z.enum(ACCOUNT_TYPES), bankName: text(120), accountTitle: text(160), accountNumber: text(60), iban: text(60), branch: text(120), notes: text(500), isActive: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.type === "bank" && v.bankName === "") ctx.addIssue({ code: "custom", message: "required", path: ["bankName"] });
});
export type AccountValues = z.infer<typeof accountSchema>;
