import "server-only";
import { can, type SessionContext } from "@/lib/auth/session";
import { likeTerm } from "@/lib/supabase/like-term";
import { createClient } from "@/lib/supabase/server";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import type { ProductOption } from "./types";

// purchase_price is not selectable; holders of costs.view read it through the secure view.
const COLUMNS =
  "id, sku, name_en, name_ur, base_unit_id, product_units(unit_id, factor, sale_price, is_active, unit:units!product_units_unit_id_fkey(name_en, name_ur))";

const amount = (value: number | null | undefined) => (value === null || value === undefined ? null : toDbAmount(toPaisa(value)));

async function fetchByIds(ids: string[]) {
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").select(COLUMNS).in("id", ids);
  if (error) throw error;
  return data;
}

async function withCosts(ctx: SessionContext, rows: Awaited<ReturnType<typeof fetchByIds>>): Promise<ProductOption[]> {
  const supabase = await createClient();
  const ids = rows.map((r) => r.id);
  const seesStock = can(ctx, "inventory.view") || can(ctx, "sales.create");
  const none = Promise.resolve({ data: [], error: null });
  const [costRows, balances] = await Promise.all([
    can(ctx, "costs.view") && ids.length ? supabase.from("secure_product_unit_costs").select("product_id, unit_id, purchase_price").in("product_id", ids) : none,
    seesStock && ids.length ? supabase.from("stock_balances").select("product_id, warehouse_id, on_hand, reserved").in("product_id", ids) : none,
  ]);
  for (const r of [costRows, balances]) if (r.error) throw r.error;
  const costs = new Map((costRows.data ?? []).map((c) => [`${c.product_id}:${c.unit_id}`, c.purchase_price]));
  const stock = new Map<string, Record<string, number>>();
  for (const b of balances.data ?? []) stock.set(b.product_id, { ...stock.get(b.product_id), [b.warehouse_id]: b.on_hand - b.reserved });
  return rows.map((p) => ({
    available: seesStock ? stock.get(p.id) ?? {} : null,
    id: p.id, sku: p.sku, nameEn: p.name_en, nameUr: p.name_ur, baseUnitId: p.base_unit_id,
    units: p.product_units.filter((u) => u.is_active).sort((a, b) => a.factor - b.factor).map((u) => ({
      unitId: u.unit_id, nameEn: u.unit.name_en, nameUr: u.unit.name_ur, factor: u.factor,
      salePrice: amount(u.sale_price), purchasePrice: amount(costs.get(`${p.id}:${u.unit_id}`)),
    })),
  }));
}

/** Products already on a document. */
export async function loadProductOptions(ctx: SessionContext, ids: (string | null)[]): Promise<ProductOption[]> {
  return withCosts(ctx, await fetchByIds([...new Set(ids.filter((id): id is string => !!id))]));
}

/** Products matching a name, SKU or scanned barcode (of the product or any of its units). */
export async function findProductOptions(ctx: SessionContext, query: string): Promise<ProductOption[]> {
  const term = likeTerm(query);
  const supabase = await createClient();
  let request = supabase.from("products").select(COLUMNS).eq("is_active", true).order("name_en").limit(20);
  if (term) request = request.or(`name_en.ilike.%${term}%,name_ur.ilike.%${term}%,sku.ilike.%${term}%,barcode.eq.${term}`);
  const [products, byUnitBarcode] = await Promise.all([
    request,
    term ? supabase.from("product_units").select("product_id").eq("barcode", term).limit(5) : Promise.resolve({ data: [], error: null }),
  ]);
  if (products.error) throw products.error;
  if (byUnitBarcode.error) throw byUnitBarcode.error;
  const found = new Set(products.data.map((p) => p.id));
  const extra = await fetchByIds(byUnitBarcode.data.map((u) => u.product_id).filter((id) => !found.has(id)));
  return withCosts(ctx, [...extra, ...products.data]);
}
