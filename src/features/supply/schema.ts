import { z } from "zod";
import { EMPLOYMENT_STATUSES } from "@/features/takers/schema";
import { optionalId, text } from "@/lib/validation/common";

/** Employee fields are only sent by users who may manage employees. */
export const supplyStaffSchema = z.object({
  employeeId: optionalId, editEmployee: z.boolean(), name: text(120), nameUr: text(120), phone: text(40), whatsapp: text(40), status: z.enum(EMPLOYMENT_STATUSES), isActive: z.boolean(), notes: text(500),
}).superRefine((v, ctx) => {
  if ((v.editEmployee || v.employeeId === "") && v.name === "") ctx.addIssue({ code: "custom", message: "required", path: ["name"] });
});
export type SupplyStaffValues = z.infer<typeof supplyStaffSchema>;
