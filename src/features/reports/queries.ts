import "server-only";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";
import type { Period } from "@/features/dashboard/period";
import { loadMovements, type MovementFilter } from "@/features/inventory/queries";

const range = (p: Period) => ({ p_from: p.from, p_to: p.to });

export async function reportPurchases(period: Period, supplierId: string | null, principal: boolean | null) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_purchases", { ...range(period), p_supplier_id: sqlNull(supplierId), p_principal: sqlNull(principal) }).range(from, to));
}

export async function reportSuppliers(period: Period) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_suppliers", range(period)).range(from, to));
}

export async function reportLowStock() {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_low_stock").range(from, to));
}

export async function reportDamaged(period: Period) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_damaged_stock", range(period)).range(from, to));
}

export async function reportProfitability(period: Period) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_product_profitability", range(period)).range(from, to));
}

export const MOVEMENT_REPORT_LIMIT = 5000;
const CHUNK = 1000;

/** The latest movements of a selection, read in chunks the API returns whole. */
export async function reportMovements(filter: MovementFilter) {
  const first = await loadMovements(filter, CHUNK, 0);
  const rows = [...first.rows];
  while (rows.length < Math.min(first.total, MOVEMENT_REPORT_LIMIT)) {
    const next = await loadMovements(filter, CHUNK, rows.length);
    if (next.rows.length === 0) break;
    rows.push(...next.rows);
  }
  return { rows, total: first.total };
}

export async function loadSupplierChoices() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("suppliers").select("id, name, name_ur").order("name");
  if (error) throw error;
  return data;
}

export async function reportSales(period: Period, bucket: "day" | "month") {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_sales", { ...range(period), p_bucket: bucket }).range(from, to));
}

export async function reportSalesByCustomer(period: Period, takerId: string | null) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_sales_by_customer", { ...range(period), p_order_taker_id: sqlNull(takerId) }).range(from, to));
}

export async function reportSalesByProduct(period: Period, categoryId: string | null) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_sales_by_product", { ...range(period), p_category_id: sqlNull(categoryId) }).range(from, to));
}

export async function reportDeliveries(period: Period, status: string | null) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_deliveries", { ...range(period), p_status: sqlNull(status) }).range(from, to));
}

export async function reportCollections(period: Period, collectorId: string | null, method: string | null) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_collections", { ...range(period), p_collector_id: sqlNull(collectorId), p_method: sqlNull(method) }).range(from, to));
}

export async function reportProductMovement(period: Period, categoryId: string | null) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_product_movement", { ...range(period), p_category_id: sqlNull(categoryId) }).range(from, to));
}

export async function reportTerritories(period: Period, by: "territory" | "city" | "area") {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_territories", { ...range(period), p_by: by }).range(from, to));
}

/** Invoices with something left to pay, oldest first. */
export async function loadUnpaidInvoices(takerId: string | null) {
  const supabase = await createClient();
  return fetchAll((from, to) => {
    let query = supabase.from("v_sales_invoice_balances")
      .select("sales_invoice_id, doc_no, customer_id, order_taker_id, invoice_date, due_date, total_amount, paid_amount, returned_amount, credited_amount, outstanding, payment_status").gt("outstanding", 0);
    if (takerId) query = query.eq("order_taker_id", takerId);
    return query.order("invoice_date").order("doc_no").range(from, to);
  });
}

export async function loadCustomerNames(): Promise<Map<string, { en: string; ur: string | null }>> {
  const supabase = await createClient();
  const rows = await fetchAll((from, to) => supabase.from("customers").select("id, name, name_ur").order("id").range(from, to));
  return new Map(rows.map((c) => [c.id, { en: c.name, ur: c.name_ur }]));
}

export async function reportPurchaseLines(period: Period, supplierId: string | null, principal: boolean | null) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_purchase_lines", { ...range(period), p_supplier_id: sqlNull(supplierId), p_principal: sqlNull(principal), p_product_id: sqlNull<string | null>(null) as string }).range(from, to));
}

export async function reportSupplierPayments(period: Period, supplierId: string | null, principal: boolean | null) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_supplier_payments", { ...range(period), p_supplier_id: sqlNull(supplierId), p_principal: sqlNull(principal) }).range(from, to));
}

export async function reportPayablesAging(asOf: string, principal: boolean | null) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_payables_aging", { p_as_of: asOf, p_principal: sqlNull(principal) }).range(from, to));
}

export async function reportSupplierDelivery(period: Period, principal: boolean | null) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_supplier_delivery", { ...range(period), p_principal: sqlNull(principal) }).range(from, to));
}

export async function reportCompany(period: Period) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_company", range(period)).range(from, to));
}

/** Entries of the Ayra company's account in a period. */
export async function loadCompanyEntries(period: Period) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.from("v_company_ledger").select("entry_date, doc_no, entry_description, source_type, source_id, debit, credit").gte("entry_date", period.from).lte("entry_date", period.to)
    .order("entry_date", { ascending: false }).order("doc_no", { ascending: false }).range(from, to));
}

export async function reportSolPayments(period: Period) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_sol_payments", range(period)).range(from, to));
}

export async function reportSolCosts(period: Period) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_sol_costs", range(period)).range(from, to));
}

export async function reportProfitAndLoss(period: Period, bucket: "day" | "month") {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_profit_and_loss", { ...range(period), p_bucket: bucket }).range(from, to));
}

export async function reportExpenseAccounts(period: Period) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_expense_accounts", range(period)).range(from, to));
}
