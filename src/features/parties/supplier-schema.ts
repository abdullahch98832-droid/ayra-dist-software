import { z } from "zod";
import { requiredText, text } from "@/lib/validation/common";

export const supplierSchema = z.object({
  code: text(30),
  name: requiredText(160),
  nameUr: text(160),
  phone: text(40),
  email: z.union([z.literal(""), z.email("invalidEmail")]),
  address: text(300),
  ntn: text(40),
  terms: z.string().trim().regex(/^\d{0,3}$/, "invalidQuantity"),
  isActive: z.boolean(),
  notes: text(1000),
  contacts: z.array(z.object({
    name: requiredText(120), designation: text(80), phone: text(40), email: z.union([z.literal(""), z.email("invalidEmail")]), isPrimary: z.boolean(),
  })),
});
export type SupplierValues = z.infer<typeof supplierSchema>;
