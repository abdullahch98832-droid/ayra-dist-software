import { z } from "zod";
import { optionalId, requiredText, text } from "@/lib/validation/common";

export const warehouseSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/, "invalidUnitCode"),
  nameEn: requiredText(80),
  nameUr: text(80),
  type: z.enum(["main", "damaged", "vehicle"]),
  vehicleId: optionalId,
  address: text(300),
  isActive: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.type === "vehicle" && !v.vehicleId) ctx.addIssue({ code: "custom", message: "required", path: ["vehicleId"] });
});
export type WarehouseValues = z.infer<typeof warehouseSchema>;
