import { z } from "zod";

const text = z.string().trim().max(500, "tooLong");
export const documentSettingsSchema = z.object({
  company_address: text, company_address_ur: text, company_phone: text, company_email: text, company_ntn: text, document_note: text, document_note_ur: text,
});
export type DocumentSettingsValues = z.infer<typeof documentSettingsSchema>;
