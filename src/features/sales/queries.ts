import "server-only";
import { z } from "zod";
import { can, type SessionContext } from "@/lib/auth/session";
import { firstRow, lastRow, type ListFilter } from "@/lib/list-params";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { listPage } from "@/lib/supabase/list-page";
import { createClient } from "@/lib/supabase/server";

export const ORDER_STATUSES = ["draft", "submitted", "approved", "picking", "partially_dispatched", "dispatched", "delivered", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const decimal = z.string();
export async function loadSalesSummary() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_summary");
  if (error) throw error;
  return z.object({
    orders: z.record(z.string(), z.number()), in_transit: z.number(), today: decimal, month: decimal, month_invoices: z.number(), waiting_approval: decimal,
    collected_month: decimal.optional(),
  }).parse(data);
}

export interface OrderFilter extends ListFilter {
  takerId?: string | null;
  customerId?: string | null;
}

export async function loadOrders(filter: OrderFilter) {
  const supabase = await createClient();
  let query = supabase.from("sales_orders")
    .select("id, doc_no, order_date, required_date, status, total_amount, order_taker_id, closed_at, customer:customers!sales_orders_customer_id_fkey(id, name, name_ur, city)", { count: "exact" });
  if (filter.status === "open") query = query.in("status", ["submitted", "approved", "picking", "partially_dispatched", "dispatched"]);
  else if (filter.status) query = query.eq("status", filter.status as OrderStatus);
  if (filter.takerId) query = query.eq("order_taker_id", filter.takerId);
  if (filter.customerId) query = query.eq("customer_id", filter.customerId);
  if (filter.q) query = query.ilike("doc_no", `%${filter.q}%`);
  return listPage(query.order("created_at", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

export async function loadOrder(id: string) {
  const supabase = await createClient();
  const [order, deliveries, invoices] = await Promise.all([
    supabase.from("sales_orders").select(
      "id, doc_no, order_date, required_date, status, total_amount, notes, customer_id, order_taker_id, warehouse_id, created_by, submitted_at, sent_back_reason, approved_at, picking_at, delivered_at, completed_at, cancelled_at, cancel_reason, closed_at, close_reason, customer:customers!sales_orders_customer_id_fkey(id, code, name, name_ur, phone, whatsapp, address, city, area), warehouse:warehouses!sales_orders_warehouse_id_fkey(name_en, name_ur), sales_order_items(id, product_id, unit_id, factor, quantity, base_quantity, unit_price, discount_amount, line_total, reserved_base_quantity, dispatched_base_quantity, product:products!sales_order_items_product_id_fkey(sku, name_en, name_ur), unit:units!sales_order_items_unit_id_fkey(name_en, name_ur))"
    ).eq("id", id).maybeSingle(),
    supabase.from("deliveries").select("id, doc_no, delivery_date, status, sales_invoice_id, received_by, delivered_at, delivery_items(sales_order_item_id, quantity, returned_quantity)").eq("sales_order_id", id).order("created_at"),
    supabase.from("v_sales_invoice_balances").select("sales_invoice_id, doc_no, invoice_date, due_date, total_amount, paid_amount, returned_amount, credited_amount, outstanding, payment_status").eq("sales_order_id", id).order("doc_no"),
  ]);
  for (const r of [order, deliveries, invoices]) if (r.error) throw r.error;
  if (!order.data) return null;
  const returned = new Map<string, number>();
  for (const d of deliveries.data ?? []) for (const i of d.delivery_items) returned.set(i.sales_order_item_id, (returned.get(i.sales_order_item_id) ?? 0) + i.returned_quantity);
  return { ...order.data, deliveries: deliveries.data ?? [], invoices: invoices.data ?? [], returned };
}
export type SalesOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

export async function loadDeliveries(filter: ListFilter) {
  const supabase = await createClient();
  let query = supabase.from("deliveries")
    .select("id, doc_no, delivery_date, status, received_by, delivered_at, supplied_by, order:sales_orders!deliveries_sales_order_id_fkey(id, doc_no, customer:customers!sales_orders_customer_id_fkey(name, name_ur, city)), vehicle:vehicles!deliveries_vehicle_id_fkey(registration_no)", { count: "exact" });
  if (filter.status) query = query.eq("status", filter.status as "dispatched");
  if (filter.q) query = query.ilike("doc_no", `%${filter.q}%`);
  return listPage(query.order("created_at", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

export async function loadDelivery(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("deliveries").select(
    "id, doc_no, delivery_date, status, notes, received_by, delivery_note, dispatched_at, delivered_at, driver_id, supplied_by, order:sales_orders!deliveries_sales_order_id_fkey(id, doc_no, customer:customers!sales_orders_customer_id_fkey(id, name, name_ur, phone, whatsapp, address, city)), vehicle:vehicles!deliveries_vehicle_id_fkey(registration_no, name), invoice:sales_invoices!deliveries_sales_invoice_id_fkey(id, doc_no, total_amount), delivery_items(id, quantity, returned_quantity, item:sales_order_items!delivery_items_sales_order_item_id_fkey(id, unit_price, product:products!sales_order_items_product_id_fkey(sku, name_en, name_ur), unit:units!sales_order_items_unit_id_fkey(name_en, name_ur))), returns:customer_returns!customer_returns_delivery_id_fkey(id, doc_no, total_amount, status)"
  ).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadInvoices(filter: ListFilter & { customerId?: string | null; takerId?: string | null }, today: string) {
  const supabase = await createClient();
  let query = supabase.from("v_sales_invoice_balances")
    .select("sales_invoice_id, doc_no, customer_id, order_taker_id, invoice_date, due_date, total_amount, paid_amount, returned_amount, credited_amount, outstanding, payment_status", { count: "exact" });
  if (filter.status === "overdue") query = query.gt("outstanding", 0).lt("due_date", today);
  else if (filter.status) query = query.eq("payment_status", filter.status);
  if (filter.customerId) query = query.eq("customer_id", filter.customerId);
  if (filter.takerId) query = query.eq("order_taker_id", filter.takerId);
  if (filter.q) query = query.ilike("doc_no", `%${filter.q}%`);
  const { rows, total } = await listPage(query.order("invoice_date", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
  const ids = [...new Set(rows.map((r) => r.customer_id).filter((x): x is string => !!x))];
  const customers = ids.length ? await supabase.from("customers").select("id, name, name_ur").in("id", ids) : { data: [], error: null };
  if (customers.error) throw customers.error;
  const byId = new Map((customers.data ?? []).map((c) => [c.id, c]));
  return { total, rows: rows.map((r) => ({ ...r, customer: byId.get(r.customer_id ?? "") ?? null })) };
}

export async function loadInvoice(ctx: SessionContext, id: string) {
  const supabase = await createClient();
  const none = Promise.resolve({ data: null, error: null });
  const [invoice, balance, payments, returns, notes, profit] = await Promise.all([
    supabase.from("sales_invoices").select(
      "id, doc_no, invoice_date, due_date, status, subtotal, tax_total, total_amount, customer_id, order_taker_id, warehouse_id, customer:customers!sales_invoices_customer_id_fkey(id, code, name, name_ur, owner_name, phone, address, city, ntn), order:sales_orders!sales_invoices_sales_order_id_fkey(id, doc_no), warehouse:warehouses!sales_invoices_warehouse_id_fkey(name_en, name_ur), journal:journal_entries!sales_invoices_journal_entry_id_fkey(doc_no), sales_invoice_items(id, product_id, unit_id, factor, quantity, base_quantity, unit_price, discount_amount, tax_rate, line_net, tax_amount, line_total, product:products!sales_invoice_items_product_id_fkey(sku, name_en, name_ur), unit:units!sales_invoice_items_unit_id_fkey(name_en, name_ur))"
    ).eq("id", id).maybeSingle(),
    supabase.from("v_sales_invoice_balances").select("paid_amount, returned_amount, credited_amount, outstanding, payment_status").eq("sales_invoice_id", id).maybeSingle(),
    supabase.from("customer_payment_allocations").select("id, amount, payment:customer_payments!customer_payment_allocations_customer_payment_id_fkey(id, doc_no, payment_date, method)").eq("sales_invoice_id", id),
    supabase.from("customer_returns").select("id, doc_no, return_date, status, total_amount, reason").eq("sales_invoice_id", id).order("created_at"),
    can(ctx, "receivables.view") || can(ctx, "receivables.adjust")
      ? supabase.from("customer_notes").select("id, doc_no, note_date, amount, status, reason").eq("sales_invoice_id", id).order("created_at") : none,
    can(ctx, "costs.view") ? supabase.from("secure_sales_invoice_costs").select("cost_total, gross_profit").eq("sales_invoice_id", id).maybeSingle() : none,
  ]);
  for (const r of [invoice, balance, payments, returns, notes, profit]) if (r.error) throw r.error;
  if (!invoice.data) return null;
  return {
    ...invoice.data, balance: balance.data, payments: payments.data ?? [], returns: returns.data ?? [],
    notes: (notes.data ?? []) as { id: string; doc_no: string; note_date: string; amount: number; status: string; reason: string | null }[],
    profit: profit.data as { cost_total: number | null; gross_profit: number | null } | null,
  };
}

/** Base quantity already returned (posted) per invoice line. */
export async function loadReturnedQuantities(invoiceItemIds: string[]): Promise<Map<string, number>> {
  if (!invoiceItemIds.length) return new Map();
  const supabase = await createClient();
  const rows = await fetchAll((from, to) => supabase.from("customer_return_items")
    .select("sales_invoice_item_id, base_quantity, doc:customer_returns!customer_return_items_customer_return_id_fkey!inner(status)")
    .eq("doc.status", "posted").in("sales_invoice_item_id", invoiceItemIds).order("id").range(from, to));
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.sales_invoice_item_id ?? "", (totals.get(r.sales_invoice_item_id ?? "") ?? 0) + (r.base_quantity ?? 0));
  return totals;
}

export async function loadReturns(filter: ListFilter & { customerId?: string | null }) {
  const supabase = await createClient();
  let query = supabase.from("customer_returns")
    .select("id, doc_no, return_date, status, total_amount, reason, delivery_id, customer:customers!customer_returns_customer_id_fkey(name, name_ur), invoice:sales_invoices!customer_returns_sales_invoice_id_fkey(doc_no)", { count: "exact" });
  if (filter.status) query = query.eq("status", filter.status as "draft");
  if (filter.customerId) query = query.eq("customer_id", filter.customerId);
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,reason.ilike.%${filter.q}%`);
  return listPage(query.order("created_at", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

export async function loadReturn(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("customer_returns").select(
    "id, doc_no, return_date, status, reason, subtotal, tax_total, total_amount, customer_id, sales_invoice_id, warehouse_id, damaged_warehouse_id, customer:customers!customer_returns_customer_id_fkey(id, name, name_ur), invoice:sales_invoices!customer_returns_sales_invoice_id_fkey(id, doc_no), delivery:deliveries!customer_returns_delivery_id_fkey(id, doc_no), warehouse:warehouses!customer_returns_warehouse_id_fkey(name_en, name_ur), damaged:warehouses!customer_returns_damaged_warehouse_id_fkey(name_en, name_ur), journal:journal_entries!customer_returns_journal_entry_id_fkey(doc_no), customer_return_items(id, sales_invoice_item_id, product_id, unit_id, quantity, unit_price, discount_amount, tax_amount, line_total, condition, product:products!customer_return_items_product_id_fkey(sku, name_en, name_ur), unit:units!customer_return_items_unit_id_fkey(name_en, name_ur))"
  ).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
