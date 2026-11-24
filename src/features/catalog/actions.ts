"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { toActionError } from "@/lib/actions";
import { authorize, can } from "@/lib/auth/session";
import { runAction } from "@/lib/server-action";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/lib/validation/employees";
import { listItemSchema, productSchema, unitSchema } from "./schema";

const id = z.uuid();

export async function saveProductAction(productId: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction("products.manage", productSchema, values, async (v, ctx) => {
    // Someone who cannot see purchase costs must not be able to overwrite them.
    const costs = can(ctx, "costs.view");
    const prices = (sale: string, purchase: string) => ({
      sale_price: orNull(sale), ...(costs ? { purchase_price: orNull(purchase) } : {}),
    });
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_product", {
      p_id: sqlNull(productId === null ? null : id.parse(productId)),
      p_doc: {
        sku: v.sku, barcode: v.barcode, name_en: v.nameEn, name_ur: orNull(v.nameUr), category_id: orNull(v.categoryId), brand_id: orNull(v.brandId),
        default_supplier_id: orNull(v.supplierId), base_unit_id: v.baseUnitId, tax_rate: orNull(v.taxRate) ?? "0",
        reorder_level: orNull(v.minimumStock) ?? "0", is_active: v.isActive, notes: orNull(v.notes),
      },
      p_units: [
        { unit_id: v.baseUnitId, factor: 1, barcode: null, ...prices(v.salePrice, v.purchasePrice) },
        ...v.units.map((u) => ({ unit_id: u.unitId, factor: u.factor, barcode: orNull(u.barcode), ...prices(u.salePrice, u.purchasePrice) })),
      ],
    });
    if (error) throw error;
    return data;
  });
}

export async function uploadProductImageAction(formData: FormData): Promise<ActionResult> {
  try {
    await authorize("products.manage");
    const productId = String(formData.get("id") ?? "");
    const file = formData.get("file");
    if (!id.safeParse(productId).success) return { ok: false, code: "notFound" };
    if (!(file instanceof File) || file.size === 0) return { ok: false, code: "validation", fieldErrors: { file: ["required"] } };
    const ext = PHOTO_TYPES[file.type];
    if (!ext) return { ok: false, code: "validation", fieldErrors: { file: ["fileType"] } };
    if (file.size > PHOTO_MAX_BYTES) return { ok: false, code: "validation", fieldErrors: { file: ["fileTooLarge"] } };

    const supabase = await createClient();
    const { data: existing, error: readError } = await supabase.from("products").select("image_path").eq("id", productId).maybeSingle();
    if (readError) return toActionError(readError);
    if (!existing) return { ok: false, code: "notFound" };
    const path = `${productId}/${randomUUID()}.${ext}`;
    const upload = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) return { ok: false, code: "rule", message: upload.error.message };
    const { error } = await supabase.from("products").update({ image_path: path }).eq("id", productId);
    if (error) {
      await supabase.storage.from("product-images").remove([path]);
      return toActionError(error);
    }
    if (existing.image_path) await supabase.storage.from("product-images").remove([existing.image_path]);
    refresh();
    return { ok: true };
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveCategoryAction(itemId: string | null, values: unknown): Promise<ActionResult<null>> {
  return runAction("products.manage", listItemSchema, values, async (v) => {
    const supabase = await createClient();
    const record = { name_en: v.nameEn, name_ur: orNull(v.nameUr), is_active: v.isActive };
    const { error } = itemId
      ? await supabase.from("product_categories").update(record).eq("id", id.parse(itemId))
      : await supabase.from("product_categories").insert(record);
    if (error) throw error;
    return null;
  });
}

export async function saveBrandAction(itemId: string | null, values: unknown): Promise<ActionResult<null>> {
  return runAction("products.manage", listItemSchema, values, async (v) => {
    const supabase = await createClient();
    const record = { name_en: v.nameEn, name_ur: orNull(v.nameUr), is_active: v.isActive };
    const { error } = itemId
      ? await supabase.from("brands").update(record).eq("id", id.parse(itemId))
      : await supabase.from("brands").insert(record);
    if (error) throw error;
    return null;
  });
}

export async function saveUnitAction(itemId: string | null, values: unknown): Promise<ActionResult<null>> {
  return runAction("products.manage", unitSchema, values, async (v) => {
    const supabase = await createClient();
    const record = { name_en: v.nameEn, name_ur: v.nameUr, is_active: v.isActive };
    const { error } = itemId
      ? await supabase.from("units").update(record).eq("id", id.parse(itemId))
      : await supabase.from("units").insert({ ...record, code: v.code });
    if (error) throw error;
    return null;
  });
}
