import { z } from "zod";
import { optionalId, text } from "@/lib/validation/common";

export const EMPLOYMENT_STATUSES = ["active", "on_leave", "terminated"] as const;

/** Employee fields are only sent by users who may manage employees. */
export const takerSchema = z.object({
  employeeId: optionalId, editEmployee: z.boolean(),
  name: text(120), nameUr: text(120), phone: text(40), whatsapp: text(40), status: z.enum(EMPLOYMENT_STATUSES),
  territory: text(160), isActive: z.boolean(), notes: text(500),
}).superRefine((v, ctx) => {
  if ((v.editEmployee || v.employeeId === "") && v.name === "") ctx.addIssue({ code: "custom", message: "required", path: ["name"] });
});
export type TakerValues = z.infer<typeof takerSchema>;
