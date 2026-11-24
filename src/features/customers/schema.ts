import { z } from "zod";
import { optionalDate, optionalId, optionalMoney, optionalSignedMoney, requiredText, text } from "@/lib/validation/common";

export const customerSchema = z.object({
  code: text(30), name: requiredText(160), nameUr: text(160), ownerName: text(120), phone: text(40), altPhone: text(40), whatsapp: text(40),
  address: text(300), area: text(80), city: text(80), ntn: text(40),
  creditLimit: optionalMoney, paymentTerms: z.string().trim().regex(/^\d{0,3}$/, "invalidQuantity").refine((v) => v === "" || Number(v) <= 365, "invalidQuantity"),
  orderTakerId: optionalId, isActive: z.boolean(), notes: text(1000),
  /** Only when the customer is created. */
  openingBalance: optionalSignedMoney, openingDate: optionalDate,
});
export type CustomerValues = z.infer<typeof customerSchema>;

/** A customer as offered by the customer picker. */
export interface CustomerOption {
  id: string;
  code: string;
  nameEn: string;
  nameUr: string | null;
  city: string | null;
  orderTakerId: string | null;
}
