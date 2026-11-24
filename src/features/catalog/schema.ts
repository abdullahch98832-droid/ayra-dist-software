import { z } from "zod";
import { optionalId, optionalMoney, optionalQuantity, requiredId, requiredText, text } from "@/lib/validation/common";

export const productUnitSchema = z.object({
  unitId: requiredId,
  factor: z.string().trim().regex(/^\d{1,9}$/, "factorTooSmall").refine((v) => Number(v) > 1, "factorTooSmall"),
  salePrice: optionalMoney,
  purchasePrice: optionalMoney,
  barcode: text(60),
});

export const productSchema = z.object({
  sku: text(40),
  barcode: text(60),
  nameEn: requiredText(160),
  nameUr: text(160),
  categoryId: optionalId,
  brandId: optionalId,
  supplierId: optionalId,
  baseUnitId: requiredId,
  salePrice: optionalMoney,
  purchasePrice: optionalMoney,
  minimumStock: optionalQuantity,
  taxRate: z.string().trim().regex(/^$|^\d{1,3}(\.\d{1,2})?$/, "invalidPercent").refine((v) => v === "" || Number(v) <= 100, "invalidPercent"),
  isActive: z.boolean(),
  notes: text(1000),
  units: z.array(productUnitSchema),
}).superRefine((value, ctx) => {
  const seen = new Set([value.baseUnitId]);
  value.units.forEach((u, i) => {
    if (seen.has(u.unitId)) ctx.addIssue({ code: "custom", message: "duplicateUnit", path: ["units", i, "unitId"] });
    seen.add(u.unitId);
  });
});
export type ProductValues = z.infer<typeof productSchema>;

export const listItemSchema = z.object({ nameEn: requiredText(80), nameUr: text(80), isActive: z.boolean() });
export type ListItemValues = z.infer<typeof listItemSchema>;

export const unitSchema = z.object({
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,9}$/, "invalidUnitCode"),
  nameEn: requiredText(40),
  nameUr: requiredText(40),
  isActive: z.boolean(),
});
export type UnitValues = z.infer<typeof unitSchema>;
