import { z } from "zod";

// Form values are strings, so one schema validates the form and the server action.
// Messages are dictionary keys (see errors.* in src/i18n).
export const requiredId = z.uuid("required");
export const optionalId = z.union([z.literal(""), z.uuid("required")]);
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate");
export const optionalDate = z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/, "invalidDate");
export const text = (max: number) => z.string().trim().max(max, "tooLong");
export const requiredText = (max: number) => z.string().trim().min(1, "required").max(max, "tooLong");
export const money = z.string().trim().min(1, "required").regex(/^\d{1,13}(\.\d{1,2})?$/, "invalidAmount");
export const optionalMoney = z.string().trim().regex(/^$|^\d{1,13}(\.\d{1,2})?$/, "invalidAmount");
/** May be negative, such as an opening balance in the customer's favour. */
export const optionalSignedMoney = z.string().trim().regex(/^$|^-?\d{1,13}(\.\d{1,2})?$/, "invalidAmount");
export const positiveMoney = money.refine((v) => /[1-9]/.test(v), "positiveQuantity");
export const quantity = z.string().trim().min(1, "required").regex(/^\d{1,12}$/, "invalidQuantity").refine((v) => /[1-9]/.test(v), "positiveQuantity");
/** Up to two decimals, such as hours or litres. */
export const decimalQuantity = z.string().trim().min(1, "required").regex(/^\d{1,9}(\.\d{1,2})?$/, "invalidDecimal").refine((v) => /[1-9]/.test(v), "positiveQuantity");
export const optionalDecimal = z.string().trim().regex(/^$|^\d{1,9}(\.\d{1,2})?$/, "invalidDecimal");
/** Zero or blank allowed. */
export const optionalQuantity = z.string().trim().regex(/^\d{0,12}$/, "invalidQuantity");
export const signedQuantity = z.string().trim().min(1, "required").regex(/^-?\d{1,12}$/, "invalidQuantity").refine((v) => /[1-9]/.test(v), "positiveQuantity");

/** Blank strings become null for the database. */
export const orNull = (value: string | undefined) => (value === undefined || value.trim() === "" ? null : value.trim());
