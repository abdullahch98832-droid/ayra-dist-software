import "server-only";
import { z } from "zod";
import { can, type SessionContext } from "@/lib/auth/session";
import { firstRow, lastRow, type ListFilter } from "@/lib/list-params";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { listPage } from "@/lib/supabase/list-page";
import { createClient } from "@/lib/supabase/server";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { accountView, isPrincipal, type Flow } from "./flow";

const decimal = z.string();

export async function loadSummary(flow: Flow) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("procurement_summary", { p_principal: isPrincipal(flow) });
  if (error) throw error;
  return z.object({
    open_orders: z.number(), open_value: decimal, unbilled_receipts: z.number(), unbilled_amount: decimal, purchased_month: decimal,
    balance: decimal.optional(), paid_month: decimal.optional(), unpaid_bills: z.number().optional(), unpaid_amount: decimal.optional(),
  }).parse(data);
}

/** Suppliers of one workflow: the Ayra company alone, or every active external supplier. */
export async function loadFlowSuppliers(flow: Flow, includeInactive = false) {
  const supabase = await createClient();
  let query = supabase.from("suppliers").select("id, name, name_ur, payment_terms_days").eq("is_principal", isPrincipal(flow)).order("name");
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data.map((s) => ({ id: s.id, nameEn: s.name, nameUr: s.name_ur, terms: s.payment_terms_days }));
}
export type FlowSupplier = Awaited<ReturnType<typeof loadFlowSuppliers>>[number];

const ORDER_COLUMNS = "id, doc_no, order_date, expected_date, status, total_amount, closed_at, supplier:suppliers!purchase_orders_supplier_id_fkey!inner(name, name_ur, is_principal)" as const;

export async function loadOrders(flow: Flow, filter: ListFilter) {
  const supabase = await createClient();
  let query = supabase.from("purchase_orders").select(ORDER_COLUMNS, { count: "exact" }).eq("supplier.is_principal", isPrincipal(flow));
  if (filter.status) query = query.eq("status", filter.status as "draft");
  if (filter.supplierId) query = query.eq("supplier_id", filter.supplierId);
  if (filter.q) query = query.ilike("doc_no", `%${filter.q}%`);
  const { rows, total } = await listPage(query.order("created_at", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
  const progress = rows.length
    ? await supabase.from("v_purchase_order_progress").select("purchase_order_id, ordered_base, accepted_base, damaged_base").in("purchase_order_id", rows.map((o) => o.id))
    : { data: [], error: null };
  if (progress.error) throw progress.error;
  const byOrder = new Map<string, { ordered: bigint; received: bigint }>();
  for (const p of progress.data) {
    const entry = byOrder.get(p.purchase_order_id ?? "") ?? { ordered: BigInt(0), received: BigInt(0) };
    entry.ordered += BigInt(p.ordered_base ?? 0);
    entry.received += BigInt(p.accepted_base ?? 0) + BigInt(p.damaged_base ?? 0);
    byOrder.set(p.purchase_order_id ?? "", entry);
  }
  return { total, rows: rows.map((o) => ({ ...o, progress: byOrder.get(o.id) ?? null })) };
}

/** Every order that can still be received against. */
export async function loadOpenOrders(flow: Flow) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.from("purchase_orders").select(ORDER_COLUMNS)
    .eq("supplier.is_principal", isPrincipal(flow)).in("status", ["approved", "partially_received"]).order("order_date").order("id").range(from, to));
}

export async function loadOrder(id: string) {
  const supabase = await createClient();
  const [order, progress, receipts] = await Promise.all([
    supabase.from("purchase_orders").select(
      "id, doc_no, order_date, expected_date, status, total_amount, notes, closed_at, close_reason, sol_job_id, supplier_id, warehouse_id, supplier:suppliers!purchase_orders_supplier_id_fkey(name, name_ur, is_principal), warehouse:warehouses!purchase_orders_warehouse_id_fkey(name_en, name_ur), purchase_order_items(id, product_id, unit_id, factor, quantity, unit_price, line_total, product:products!purchase_order_items_product_id_fkey(sku, name_en, name_ur), unit:units!purchase_order_items_unit_id_fkey(name_en, name_ur))"
    ).eq("id", id).maybeSingle(),
    supabase.from("v_purchase_order_progress").select("purchase_order_item_id, accepted_base, damaged_base, rejected_base, remaining_base").eq("purchase_order_id", id),
    supabase.from("goods_receipts").select("id, doc_no, receipt_date, status, total_amount").eq("purchase_order_id", id).order("created_at"),
  ]);
  for (const r of [order, progress, receipts]) if (r.error) throw r.error;
  if (!order.data) return null;
  return { ...order.data, progress: new Map((progress.data ?? []).map((p) => [p.purchase_order_item_id ?? "", p])), receipts: receipts.data ?? [] };
}

export async function loadReceipts(flow: Flow, filter: ListFilter) {
  const supabase = await createClient();
  let query = supabase.from("goods_receipts")
    .select("id, doc_no, receipt_date, status, total_amount, supplier_reference, supplier:suppliers!goods_receipts_supplier_id_fkey!inner(name, name_ur, is_principal), order:purchase_orders!goods_receipts_purchase_order_id_fkey(doc_no), supplier_invoice_receipts(supplier_invoice_id)", { count: "exact" })
    .eq("supplier.is_principal", isPrincipal(flow));
  if (filter.status) query = query.eq("status", filter.status as "draft");
  if (filter.supplierId) query = query.eq("supplier_id", filter.supplierId);
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,supplier_reference.ilike.%${filter.q}%`);
  return listPage(query.order("created_at", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

export async function loadReceipt(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("goods_receipts").select(
    "id, doc_no, receipt_date, status, total_amount, supplier_reference, notes, supplier_id, warehouse_id, damaged_warehouse_id, purchase_order_id, supplier:suppliers!goods_receipts_supplier_id_fkey(name, name_ur, is_principal), warehouse:warehouses!goods_receipts_warehouse_id_fkey(name_en, name_ur), damaged_warehouse:warehouses!goods_receipts_damaged_warehouse_id_fkey(name_en, name_ur), order:purchase_orders!goods_receipts_purchase_order_id_fkey(id, doc_no), journal:journal_entries!goods_receipts_journal_entry_id_fkey(doc_no), supplier_invoice_receipts(supplier_invoice_id), goods_receipt_items(id, purchase_order_item_id, product_id, unit_id, factor, expected_quantity, quantity, damaged_quantity, rejected_quantity, unit_cost, line_total, notes, product:products!goods_receipt_items_product_id_fkey(sku, name_en, name_ur), unit:units!goods_receipt_items_unit_id_fkey(name_en, name_ur))"
  ).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Every posted receipt of the workflow that is not on a bill yet. */
export async function loadUnbilledReceipts(flow: Flow) {
  const supabase = await createClient();
  const rows = await fetchAll((from, to) => supabase.from("v_unbilled_receipts").select("goods_receipt_id, doc_no, receipt_date, supplier_id, supplier_reference, total_amount")
    .eq("is_principal", isPrincipal(flow)).order("receipt_date").order("doc_no").range(from, to));
  return rows.map((r) => ({
    id: r.goods_receipt_id ?? "", doc_no: r.doc_no ?? "", receipt_date: r.receipt_date ?? "", supplier_id: r.supplier_id ?? "",
    supplier_reference: r.supplier_reference, total_amount: r.total_amount ?? 0,
  }));
}

const BILL_COLUMNS = "supplier_invoice_id, doc_no, supplier_id, supplier_name, supplier_name_ur, invoice_number, invoice_date, due_date, amount, receipts_total, variance, status, paid_amount, outstanding" as const;

/** Status `unpaid` lists posted bills with a balance. */
export async function loadBills(flow: Flow, filter: ListFilter) {
  const supabase = await createClient();
  let query = supabase.from("v_supplier_invoice_status").select(BILL_COLUMNS, { count: "exact" }).eq("is_principal", isPrincipal(flow));
  if (filter.status === "unpaid") query = query.gt("outstanding", 0);
  else if (filter.status) query = query.eq("status", filter.status as "draft");
  if (filter.supplierId) query = query.eq("supplier_id", filter.supplierId);
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,invoice_number.ilike.%${filter.q}%`);
  return listPage(query.order("created_at", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

/** Every unpaid bill of the workflow, oldest first. */
export async function loadUnpaidBills(flow: Flow) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.from("v_supplier_invoice_status").select(BILL_COLUMNS)
    .eq("is_principal", isPrincipal(flow)).gt("outstanding", 0).order("invoice_date").order("doc_no").range(from, to));
}

export async function loadBill(id: string) {
  const supabase = await createClient();
  const [bill, receipts, payments] = await Promise.all([
    supabase.from("v_supplier_invoice_status").select("*").eq("supplier_invoice_id", id).maybeSingle(),
    supabase.from("supplier_invoice_receipts").select("goods_receipt:goods_receipts!supplier_invoice_receipts_goods_receipt_id_fkey(id, doc_no, receipt_date, total_amount)").eq("supplier_invoice_id", id),
    supabase.from("supplier_payment_allocations").select("id, amount, payment:supplier_payments!supplier_payment_allocations_supplier_payment_id_fkey(id, doc_no, payment_date, method)").eq("supplier_invoice_id", id),
  ]);
  for (const r of [bill, receipts, payments]) if (r.error) throw r.error;
  if (!bill.data) return null;
  return { ...bill.data, receipts: (receipts.data ?? []).map((r) => r.goods_receipt), payments: payments.data ?? [] };
}

export async function loadReturns(flow: Flow, filter: ListFilter) {
  const supabase = await createClient();
  let query = supabase.from("supplier_returns")
    .select("id, doc_no, return_date, status, total_amount, reason, supplier:suppliers!supplier_returns_supplier_id_fkey!inner(name, name_ur, is_principal)", { count: "exact" })
    .eq("supplier.is_principal", isPrincipal(flow));
  if (filter.status) query = query.eq("status", filter.status as "draft");
  if (filter.supplierId) query = query.eq("supplier_id", filter.supplierId);
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,reason.ilike.%${filter.q}%`);
  return listPage(query.order("created_at", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

export async function loadReturn(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("supplier_returns").select(
    "id, doc_no, return_date, status, total_amount, reason, supplier_id, warehouse_id, supplier:suppliers!supplier_returns_supplier_id_fkey(name, name_ur, is_principal), warehouse:warehouses!supplier_returns_warehouse_id_fkey(name_en, name_ur), journal:journal_entries!supplier_returns_journal_entry_id_fkey(doc_no), supplier_return_items(id, product_id, unit_id, factor, quantity, unit_price, line_total, product:products!supplier_return_items_product_id_fkey(sku, name_en, name_ur), unit:units!supplier_return_items_unit_id_fkey(name_en, name_ur))"
  ).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadPayments(flow: Flow, filter: ListFilter) {
  const supabase = await createClient();
  let query = supabase.from("supplier_payments")
    .select("id, doc_no, payment_date, amount, method, reference, status, contributors, supplier:suppliers!supplier_payments_supplier_id_fkey!inner(name, name_ur, is_principal), supplier_payment_allocations(amount)", { count: "exact" })
    .eq("supplier.is_principal", isPrincipal(flow));
  if (filter.status) query = query.eq("status", filter.status as "draft");
  if (filter.supplierId) query = query.eq("supplier_id", filter.supplierId);
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,reference.ilike.%${filter.q}%`);
  return listPage(query.order("created_at", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

export async function loadPayment(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("supplier_payments").select(
    "id, doc_no, payment_date, amount, method, reference, notes, status, supplier_id, contributors, supplier:suppliers!supplier_payments_supplier_id_fkey(name, name_ur, is_principal), account:financial_accounts!supplier_payments_financial_account_id_fkey(name), journal:journal_entries!supplier_payments_journal_entry_id_fkey(doc_no), supplier_payment_allocations(id, amount, invoice:supplier_invoices!supplier_payment_allocations_supplier_invoice_id_fkey(id, invoice_number, doc_no))"
  ).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadFinancialAccounts() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("financial_accounts").select("id, name, account_type").eq("is_active", true).order("name");
  if (error) throw error;
  return data;
}

/** What is owed to each supplier of the workflow, from the ledger. */
export async function loadBalances(flow: Flow): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_supplier_balances").select("supplier_id, balance").eq("is_principal", isPrincipal(flow));
  if (error) throw error;
  return Object.fromEntries(data.map((b) => [b.supplier_id ?? "", toDbAmount(toPaisa(b.balance ?? 0))]));
}

/** Ledger lines of a period, newest first, with the balance before it. */
export async function loadStatement(supplierId: string, from: string, to: string) {
  const supabase = await createClient();
  const [lines, before] = await Promise.all([
    fetchAll((start, end) => supabase.from("v_supplier_ledger")
      .select("entry_date, doc_no, entry_description, debit, credit, running_balance").eq("supplier_id", supplierId).gte("entry_date", from).lte("entry_date", to)
      .order("entry_date", { ascending: false }).order("doc_no", { ascending: false }).range(start, end)),
    supabase.from("v_supplier_ledger").select("running_balance").eq("supplier_id", supplierId).lt("entry_date", from)
      .order("entry_date", { ascending: false }).order("doc_no", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (before.error) throw before.error;
  return { lines, opening: before.data?.running_balance ?? 0 };
}

/** Account figures are shown only to users who may see this workflow's ledger. */
export const seesAccount = (ctx: SessionContext, flow: Flow) => can(ctx, accountView(flow));
