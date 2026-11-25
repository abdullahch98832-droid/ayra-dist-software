import "server-only";
import { OTHER_VENDORS } from "@/config/vendors";
import { can, type SessionContext } from "@/lib/auth/session";
import { likeTerm } from "@/lib/supabase/like-term";
import { signedUrls } from "@/lib/supabase/signed-urls";
import { createClient } from "@/lib/supabase/server";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import type { Choice } from "./types";

export const PRODUCT_LIMIT = 500;

export async function loadProductList(ctx: SessionContext, filter: { q: string; category: string; brand: string; status: string }) {
  const supabase = await createClient();
  let query = supabase.from("products").select(
    "id, sku, barcode, name_en, name_ur, image_path, reorder_level, is_active, base_unit_id, category:product_categories!products_category_id_fkey(name_en, name_ur), brand:brands!products_brand_id_fkey(name_en, name_ur), base_unit:units!products_base_unit_id_fkey(name_en, name_ur), product_units(unit_id, sale_price)"
  ).order("name_en").limit(PRODUCT_LIMIT);
  const term = likeTerm(filter.q);
  if (term) query = query.or(`name_en.ilike.%${term}%,name_ur.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`);
  if (filter.category) query = query.eq("category_id", filter.category);
  if (filter.brand) query = query.eq("brand_id", filter.brand);
  if (filter.status) query = query.eq("is_active", filter.status === "active");
  const [products, stock] = await Promise.all([
    query,
    can(ctx, "inventory.view") ? supabase.rpc("report_stock") : Promise.resolve({ data: null, error: null }),
  ]);
  if (products.error) throw products.error;
  if (stock.error) throw stock.error;
  const images = await signedUrls("product-images", products.data.map((p) => p.image_path));
  const available = stock.data ? new Map(stock.data.map((s) => [s.product_id, s.available])) : null;
  return products.data.map((p) => {
    const price = p.product_units.find((u) => u.unit_id === p.base_unit_id)?.sale_price;
    return {
      id: p.id, sku: p.sku, barcode: p.barcode, nameEn: p.name_en, nameUr: p.name_ur, isActive: p.is_active, minimum: p.reorder_level,
      categoryEn: p.category?.name_en ?? null, categoryUr: p.category?.name_ur ?? null, brandEn: p.brand?.name_en ?? null, brandUr: p.brand?.name_ur ?? null,
      unitEn: p.base_unit.name_en, unitUr: p.base_unit.name_ur, imageUrl: p.image_path ? images.get(p.image_path) : undefined,
      price: price === null || price === undefined ? null : toDbAmount(toPaisa(price)),
      available: available ? available.get(p.id) ?? 0 : null,
    };
  });
}
export type ProductListRow = Awaited<ReturnType<typeof loadProductList>>[number];

export async function loadProduct(ctx: SessionContext, id: string) {
  const supabase = await createClient();
  const [product, costs] = await Promise.all([
    supabase.from("products").select(
      "id, sku, barcode, name_en, name_ur, category_id, brand_id, default_supplier_id, base_unit_id, tax_rate, reorder_level, is_active, notes, image_path, product_units(unit_id, factor, sale_price, barcode)"
    ).eq("id", id).maybeSingle(),
    can(ctx, "costs.view")
      ? supabase.from("secure_product_unit_costs").select("unit_id, purchase_price").eq("product_id", id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (product.error) throw product.error;
  if (costs.error) throw costs.error;
  if (!product.data) return null;
  const cost = new Map((costs.data ?? []).map((c) => [c.unit_id, c.purchase_price]));
  const images = await signedUrls("product-images", [product.data.image_path]);
  const amount = (v: number | null | undefined) => (v === null || v === undefined ? "" : toDbAmount(toPaisa(v)));
  return {
    ...product.data,
    imageUrl: product.data.image_path ? images.get(product.data.image_path) : undefined,
    units: product.data.product_units.map((u) => ({
      unitId: u.unit_id, factor: u.factor, salePrice: amount(u.sale_price), purchasePrice: amount(cost.get(u.unit_id)), barcode: u.barcode ?? "",
    })).sort((a, b) => a.factor - b.factor),
  };
}

const choice = (r: { id: string; name_en: string; name_ur: string | null }): Choice => ({ id: r.id, nameEn: r.name_en, nameUr: r.name_ur });

/** Lists a product form offers. Suppliers appear only for users who may see them. */
export async function loadProductChoices(ctx: SessionContext) {
  const supabase = await createClient();
  const [categories, brands, units, suppliers] = await Promise.all([
    supabase.from("product_categories").select("id, name_en, name_ur").eq("is_active", true).order("name_en"),
    supabase.from("brands").select("id, name_en, name_ur").eq("is_active", true).order("name_en"),
    supabase.from("units").select("id, name_en, name_ur").eq("is_active", true).order("name_en"),
    OTHER_VENDORS && can(ctx, "suppliers.view")
      ? supabase.from("suppliers").select("id, name, name_ur").eq("is_active", true).order("name")
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [categories, brands, units, suppliers]) if (r.error) throw r.error;
  return {
    categories: (categories.data ?? []).map(choice),
    brands: (brands.data ?? []).map(choice),
    units: (units.data ?? []).map(choice),
    suppliers: (suppliers.data ?? []).map((s) => ({ id: s.id, nameEn: s.name, nameUr: s.name_ur }) satisfies Choice),
  };
}

export async function loadWarehouseChoices() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("warehouses").select("id, name_en, name_ur, warehouse_type").eq("is_active", true).order("code");
  if (error) throw error;
  return data.map((w) => ({ ...choice(w), type: w.warehouse_type }));
}
export type WarehouseChoice = Awaited<ReturnType<typeof loadWarehouseChoices>>[number];
