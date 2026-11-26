import "server-only";
import { can, type SessionContext } from "@/lib/auth/session";
import { firstRow, lastRow, type ListFilter } from "@/lib/list-params";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { listPage } from "@/lib/supabase/list-page";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import type { OpenInvoice } from "./schema";

export async function loadReceivables(asOf: string, takerId: string | null = null) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_receivables", { p_as_of: asOf, p_order_taker_id: sqlNull(takerId) }).range(from, to));
}

/** Unpaid invoices of one customer, oldest first. */
export async function loadOpenInvoices(customerId: string): Promise<OpenInvoice[]> {
  const supabase = await createClient();
  const rows = await fetchAll((from, to) => supabase.from("v_sales_invoice_balances").select("sales_invoice_id, doc_no, invoice_date, due_date, outstanding")
    .eq("customer_id", customerId).gt("outstanding", 0).order("invoice_date").order("doc_no").range(from, to));
  return rows.map((r) => ({
    id: r.sales_invoice_id ?? "", number: r.doc_no ?? "", date: r.invoice_date ?? "", dueDate: r.due_date, outstanding: toDbAmount(toPaisa(r.outstanding ?? 0)),
  }));
}

export async function loadPayments(filter: ListFilter & { customerId?: string | null; takerId?: string | null; method?: string }) {
  const supabase = await createClient();
  let query = supabase.from("customer_payments")
    .select("id, doc_no, payment_date, amount, method, reference, status, financial_account_id, collected_by, contributors, customer:customers!customer_payments_customer_id_fkey(name, name_ur), customer_payment_allocations(amount)", { count: "exact" });
  if (filter.status) query = query.eq("status", filter.status as "draft");
  if (filter.customerId) query = query.eq("customer_id", filter.customerId);
  if (filter.takerId) query = query.eq("collected_by", filter.takerId);
  if (filter.method) query = query.eq("method", filter.method as "cash");
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,reference.ilike.%${filter.q}%`);
  return listPage(query.order("created_at", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

export async function loadPayment(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("customer_payments").select(
    "id, doc_no, payment_date, amount, method, reference, payer_account, notes, status, void_reason, customer_id, collected_by, financial_account_id, requested_allocations, contributors, customer:customers!customer_payments_customer_id_fkey(name, name_ur), account:financial_accounts!customer_payments_financial_account_id_fkey(name), journal:journal_entries!customer_payments_journal_entry_id_fkey(doc_no), customer_payment_allocations(id, amount, invoice:sales_invoices!customer_payment_allocations_sales_invoice_id_fkey(id, doc_no), job:sol_jobs!customer_payment_allocations_sol_job_id_fkey(id, doc_no)), sol_job:sol_jobs!customer_payments_sol_job_id_fkey(id, doc_no)"
  ).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function countWaitingPayments() {
  const supabase = await createClient();
  const { count, error } = await supabase.from("customer_payments").select("id", { count: "exact", head: true }).eq("status", "draft");
  if (error) throw error;
  return count ?? 0;
}

export async function loadCash() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("collector_cash");
  if (error) throw error;
  return data;
}

export async function loadCollectorStatement(employeeId: string, from: string, to: string) {
  const supabase = await createClient();
  return fetchAll((start, end) => supabase.rpc("collector_statement", { p_employee_id: employeeId, p_from: from, p_to: to }).range(start, end));
}

export async function loadDeposits(filter: ListFilter & { takerId: string | null }) {
  const supabase = await createClient();
  let query = supabase.from("cash_deposits")
    .select("id, doc_no, deposit_date, amount, reference, status, void_reason, employee_id, contributors, account:financial_accounts!cash_deposits_financial_account_id_fkey(name)", { count: "exact" });
  if (filter.status) query = query.eq("status", filter.status as "draft");
  if (filter.takerId) query = query.eq("employee_id", filter.takerId);
  return listPage(query.order("created_at", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

export async function loadNotes(filter: ListFilter & { kind: string; customerId?: string | null }) {
  const supabase = await createClient();
  let query = supabase.from("customer_notes")
    .select("id, doc_no, kind, note_date, amount, reason, status, void_reason, customer:customers!customer_notes_customer_id_fkey(id, name, name_ur), invoice:sales_invoices!customer_notes_sales_invoice_id_fkey(id, doc_no)", { count: "exact" });
  if (filter.kind) query = query.eq("kind", filter.kind as "credit");
  if (filter.customerId) query = query.eq("customer_id", filter.customerId);
  if (filter.status) query = query.eq("status", filter.status as "posted");
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,reason.ilike.%${filter.q}%`);
  return listPage(query.order("created_at", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

export async function loadNote(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("customer_notes").select(
    "id, doc_no, kind, note_date, amount, reason, status, void_reason, customer:customers!customer_notes_customer_id_fkey(id, name, name_ur), invoice:sales_invoices!customer_notes_sales_invoice_id_fkey(id, doc_no), journal:journal_entries!customer_notes_journal_entry_id_fkey(doc_no)"
  ).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Cash and bank accounts money can be received in. */
export async function loadReceivingAccounts() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("financial_accounts").select("id, name, account_type").eq("is_active", true).order("name");
  if (error) throw error;
  return data;
}

/** Who may look at everyone's collections; others see their own. */
export const seesAllCollections = (ctx: SessionContext) => can(ctx, "receivables.post") || (can(ctx, "receivables.view") && can(ctx, "sales.view_all"));
