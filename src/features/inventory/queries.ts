import "server-only";
import { OTHER_VENDORS } from "@/config/vendors";
import { z } from "zod";
import { can, type SessionContext } from "@/lib/auth/session";
import { firstRow, lastRow, type ListFilter } from "@/lib/list-params";
import { loadSupplyStaff } from "@/features/supply/queries";
import { loadDrivers } from "@/features/takers/queries";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { listPage } from "@/lib/supabase/list-page";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";

const QUEUE_LIMIT = 300;
export const MOVEMENT_PAGE = 50;

export async function loadStock(warehouseId: string | null, categoryId: string | null) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_stock", { p_warehouse_id: sqlNull(warehouseId), p_category_id: sqlNull(categoryId) }).range(from, to));
}

export async function loadReconciliation(ctx: SessionContext) {
  if (!can(ctx, "costs.view")) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("inventory_reconciliation");
  if (error) throw error;
  return z.object({ valuation: z.string(), ledger: z.string(), difference: z.string(), quantity_mismatches: z.number() }).parse(data);
}

export async function loadOverrideOn(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", "allow_negative_stock").maybeSingle();
  if (error) throw error;
  return data?.value === true;
}

/** Warehouse balances below zero. A shortage in one warehouse is not hidden by stock in another. */
export async function countNegative(warehouseId: string | null): Promise<number> {
  const supabase = await createClient();
  let query = supabase.from("stock_balances").select("product_id", { count: "exact", head: true }).lt("on_hand", 0);
  if (warehouseId) query = query.eq("warehouse_id", warehouseId);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function loadCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("product_categories").select("id, name_en, name_ur").order("name_en");
  if (error) throw error;
  return data;
}

export interface MovementFilter {
  from: string;
  to: string;
  productId: string | null;
  warehouseId: string | null;
  type: string | null;
}

export async function loadMovements(filter: MovementFilter, limit: number, offset: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_stock_movements", {
    p_from: filter.from, p_to: filter.to, p_product_id: sqlNull(filter.productId), p_warehouse_id: sqlNull(filter.warehouseId), p_type: sqlNull(filter.type), p_limit: limit, p_offset: offset,
  });
  if (error) throw error;
  return { rows: data, total: Number(data[0]?.total_count ?? 0) };
}

export async function loadProductName(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").select("id, sku, name_en, name_ur").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadTransfers(filter: ListFilter) {
  const supabase = await createClient();
  let query = supabase.from("stock_transfers")
    .select("id, doc_no, transfer_date, status, notes, from:warehouses!stock_transfers_from_warehouse_id_fkey(name_en, name_ur), to:warehouses!stock_transfers_to_warehouse_id_fkey(name_en, name_ur), stock_transfer_items(id)", { count: "exact" });
  if (filter.status) query = query.eq("status", filter.status as "draft");
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,notes.ilike.%${filter.q}%`);
  return listPage(query.order("created_at", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

export async function loadTransfer(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("stock_transfers").select(
    "id, doc_no, transfer_date, status, notes, from_warehouse_id, to_warehouse_id, from:warehouses!stock_transfers_from_warehouse_id_fkey(name_en, name_ur), to:warehouses!stock_transfers_to_warehouse_id_fkey(name_en, name_ur), stock_transfer_items(id, product_id, unit_id, factor, quantity, base_quantity, product:products!stock_transfer_items_product_id_fkey(sku, name_en, name_ur), unit:units!stock_transfer_items_unit_id_fkey(name_en, name_ur))"
  ).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadCounts(filter: ListFilter) {
  const supabase = await createClient();
  let query = supabase.from("stock_counts")
    .select("id, doc_no, count_date, status, notes, warehouse:warehouses!stock_counts_warehouse_id_fkey(name_en, name_ur), stock_count_items(difference)", { count: "exact" });
  if (filter.status) query = query.eq("status", filter.status as "draft");
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,notes.ilike.%${filter.q}%`);
  return listPage(query.order("created_at", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

export async function loadCount(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("stock_counts").select(
    "id, doc_no, count_date, status, notes, warehouse_id, warehouse:warehouses!stock_counts_warehouse_id_fkey(name_en, name_ur), adjustment:stock_adjustments!stock_counts_stock_adjustment_id_fkey(id, doc_no), stock_count_items(id, product_id, system_quantity, counted_quantity, difference, notes, product:products!stock_count_items_product_id_fkey(sku, name_en, name_ur))"
  ).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Stock on hand now, per product, in one warehouse. */
export async function loadOnHand(warehouseId: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const rows = await fetchAll((from, to) => supabase.from("stock_balances").select("product_id, on_hand").eq("warehouse_id", warehouseId).order("product_id").range(from, to));
  return new Map(rows.map((r) => [r.product_id, r.on_hand]));
}

/** Everything a count of the warehouse covers: active products, and any other with stock there. */
export async function loadCountSheet(warehouseId: string) {
  const supabase = await createClient();
  const [onHand, products] = await Promise.all([
    loadOnHand(warehouseId),
    fetchAll((from, to) => supabase.from("products").select("id, sku, barcode, name_en, name_ur, is_active, unit:units!products_base_unit_id_fkey(name_en, name_ur)").order("name_en").order("id").range(from, to)),
  ]);
  return products.filter((p) => p.is_active || (onHand.get(p.id) ?? 0) !== 0).map((p) => ({
    id: p.id, sku: p.sku, barcode: p.barcode ?? "", nameEn: p.name_en, nameUr: p.name_ur, unitEn: p.unit.name_en, unitUr: p.unit.name_ur, onHand: onHand.get(p.id) ?? 0,
  }));
}
export type CountSheetRow = Awaited<ReturnType<typeof loadCountSheet>>[number];

export async function loadAdjustments(filter: ListFilter, kind: string) {
  const supabase = await createClient();
  let query = supabase.from("stock_adjustments")
    .select("id, doc_no, adjustment_date, status, kind, reason, warehouse:warehouses!stock_adjustments_warehouse_id_fkey(name_en, name_ur)", { count: "exact" });
  if (filter.status) query = query.eq("status", filter.status as "draft");
  if (kind) query = query.eq("kind", kind as "opening");
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,reason.ilike.%${filter.q}%`);
  return listPage(query.order("created_at", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

export async function loadAdjustment(ctx: SessionContext, id: string) {
  const supabase = await createClient();
  const costs = can(ctx, "costs.view");
  const none = Promise.resolve({ data: null, error: null });
  const [doc, items, total] = await Promise.all([
    supabase.from("stock_adjustments").select(
      "id, doc_no, adjustment_date, status, kind, reason, warehouse_id, warehouse:warehouses!stock_adjustments_warehouse_id_fkey(name_en, name_ur), journal:journal_entries!stock_adjustments_journal_entry_id_fkey(doc_no), stock_adjustment_items(id, product_id, unit_id, factor, quantity, base_quantity, notes, product:products!stock_adjustment_items_product_id_fkey(sku, name_en, name_ur), unit:units!stock_adjustment_items_unit_id_fkey(name_en, name_ur))"
    ).eq("id", id).maybeSingle(),
    costs ? supabase.from("secure_stock_adjustment_item_values").select("stock_adjustment_item_id, unit_cost, value_change").eq("stock_adjustment_id", id) : none,
    costs ? supabase.from("secure_stock_adjustment_values").select("value_total").eq("stock_adjustment_id", id).maybeSingle() : none,
  ]);
  for (const r of [doc, items, total]) if (r.error) throw r.error;
  if (!doc.data) return null;
  return {
    ...doc.data,
    costs: items.data ? new Map(items.data.map((i) => [i.stock_adjustment_item_id ?? "", i])) : null,
    valueTotal: total.data?.value_total ?? null,
  };
}

export async function loadReservations() {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.from("sales_order_items")
    .select("id, base_quantity, reserved_base_quantity, dispatched_base_quantity, product:products!sales_order_items_product_id_fkey(sku, name_en, name_ur), order:sales_orders!sales_order_items_sales_order_id_fkey!inner(id, doc_no, order_date, customer:customers!sales_orders_customer_id_fkey(name, name_ur), warehouse:warehouses!sales_orders_warehouse_id_fkey(name_en, name_ur))")
    .gt("reserved_base_quantity", 0).order("id").range(from, to));
}

export async function loadDispatchQueue() {
  const supabase = await createClient();
  const [orders, deliveries] = await Promise.all([
    supabase.from("sales_orders")
      .select("id, doc_no, order_date, required_date, status, total_amount, customer:customers!sales_orders_customer_id_fkey(name, name_ur), warehouse:warehouses!sales_orders_warehouse_id_fkey(name_en, name_ur)")
      .in("status", ["approved", "picking", "partially_dispatched"]).order("order_date").limit(QUEUE_LIMIT),
    supabase.from("deliveries")
      .select("id, doc_no, delivery_date, status, order:sales_orders!deliveries_sales_order_id_fkey(doc_no, customer:customers!sales_orders_customer_id_fkey(name, name_ur)), vehicle:vehicles!deliveries_vehicle_id_fkey(registration_no)")
      .eq("status", "dispatched").order("delivery_date", { ascending: false }).limit(QUEUE_LIMIT),
  ]);
  for (const r of [orders, deliveries]) if (r.error) throw r.error;
  return { orders: orders.data ?? [], deliveries: deliveries.data ?? [] };
}

export async function loadDispatchOrder(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sales_orders").select(
    "id, doc_no, order_date, required_date, status, notes, customer:customers!sales_orders_customer_id_fkey(name, name_ur, address, city, phone), warehouse:warehouses!sales_orders_warehouse_id_fkey(name_en, name_ur), sales_order_items(id, factor, quantity, base_quantity, reserved_base_quantity, dispatched_base_quantity, product:products!sales_order_items_product_id_fkey(sku, name_en, name_ur), unit:units!sales_order_items_unit_id_fkey(name_en, name_ur))"
  ).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadVehiclesAndDrivers(ctx: SessionContext) {
  const supabase = await createClient();
  const [vehicles, drivers, staff] = await Promise.all([
    can(ctx, "vehicles.view")
      ? supabase.from("vehicles").select("id, name, registration_no").eq("is_active", true).order("registration_no")
      : Promise.resolve({ data: [], error: null }),
    loadDrivers(), loadSupplyStaff(),
  ]);
  if (vehicles.error) throw vehicles.error;
  return { vehicles: (vehicles.data ?? []).map((v) => ({ id: v.id, label: `${v.registration_no} · ${v.name}` })), drivers: drivers.map((d) => ({ id: d.id, label: d.nameEn })), suppliers: staff.filter((x) => x.isActive).map((x) => ({ id: x.id, label: x.nameEn })) };
}

/** Damaged goods on hand, per product and damaged-goods warehouse. */
export async function loadDamaged(ctx: SessionContext) {
  const supabase = await createClient();
  const rows = await fetchAll((from, to) => supabase.from("stock_balances")
    .select("product_id, warehouse_id, on_hand, product:products!stock_balances_product_id_fkey(sku, name_en, name_ur, default_supplier_id, unit:units!products_base_unit_id_fkey(name_en, name_ur)), warehouse:warehouses!stock_balances_warehouse_id_fkey!inner(name_en, name_ur, warehouse_type)")
    .eq("warehouse.warehouse_type", "damaged").neq("on_hand", 0).order("product_id").order("warehouse_id").range(from, to));
  const supplierIds = [...new Set(rows.map((r) => r.product.default_supplier_id).filter((id): id is string => !!id))];
  const suppliers = can(ctx, "suppliers.view") && supplierIds.length
    ? await supabase.from("suppliers").select("id, is_principal").in("id", supplierIds)
    : { data: [], error: null };
  if (suppliers.error) throw suppliers.error;
  const principal = new Map((suppliers.data ?? []).map((s) => [s.id, s.is_principal]));
  return rows.map((r) => ({ ...r, supplierId: r.product.default_supplier_id, fromCompany: !OTHER_VENDORS || (principal.get(r.product.default_supplier_id ?? "") ?? false) }));
}
