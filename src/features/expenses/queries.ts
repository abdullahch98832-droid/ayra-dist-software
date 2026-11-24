import "server-only";
import { can, type SessionContext } from "@/lib/auth/session";
import { firstRow, lastRow, type ListFilter } from "@/lib/list-params";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { listPage } from "@/lib/supabase/list-page";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";

const COLUMNS =
  "id, doc_no, expense_date, amount, payee, description, method, reference, litres, odometer, status, void_reason, no_receipt_reason, receipt_path, category_id, vehicle_id, sol_job_id, financial_account_id, journal_entry_id, created_by, created_at, posted_by, posted_at, category:expense_categories!expenses_category_id_fkey(name_en, name_ur, vehicle_kind), account:financial_accounts!expenses_financial_account_id_fkey(name), vehicle:vehicles!expenses_vehicle_id_fkey(id, registration_no, name), job:sol_jobs!expenses_sol_job_id_fkey(id, doc_no), journal:journal_entries!expenses_journal_entry_id_fkey(doc_no)";

export async function loadExpenses(filter: ListFilter & { vehicleId?: string | null; jobId?: string | null; categoryId?: string | null }) {
  const supabase = await createClient();
  let query = supabase.from("expenses").select(COLUMNS, { count: "exact" });
  if (filter.status === "rejected") query = query.eq("status", "void").is("journal_entry_id", null);
  else if (filter.status === "void") query = query.eq("status", "void").not("journal_entry_id", "is", null);
  else if (filter.status) query = query.eq("status", filter.status as "draft");
  if (filter.vehicleId) query = query.eq("vehicle_id", filter.vehicleId);
  if (filter.jobId) query = query.eq("sol_job_id", filter.jobId);
  if (filter.categoryId) query = query.eq("category_id", filter.categoryId);
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,payee.ilike.%${filter.q}%,reference.ilike.%${filter.q}%,description.ilike.%${filter.q}%`);
  return listPage(query.order("expense_date", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}
export type ExpenseRow = Awaited<ReturnType<typeof loadExpenses>>["rows"][number];

export async function loadExpense(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("expenses").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Categories a voucher can have. Salaries are booked by payroll only. */
export async function loadExpenseCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("expense_categories").select("id, name_en, name_ur, vehicle_kind").eq("is_active", true).eq("is_payroll", false).order("name_en");
  if (error) throw error;
  return data.map((c) => ({ id: c.id, nameEn: c.name_en, nameUr: c.name_ur as string | null, vehicleKind: c.vehicle_kind }));
}
export type ExpenseCategory = Awaited<ReturnType<typeof loadExpenseCategories>>[number];

export async function loadAllCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("expense_categories").select("id, code, name_en, name_ur, gl_account_id, vehicle_kind, is_active, is_payroll, account:chart_of_accounts!expense_categories_gl_account_id_fkey(code, name_en, name_ur)").order("name_en");
  if (error) throw error;
  return data;
}
export type CategoryRow = Awaited<ReturnType<typeof loadAllCategories>>[number];

/** A link to the receipt, valid for an hour. */
export async function receiptUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("attachments").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function userNames(ctx: SessionContext, ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (!wanted.length || !can(ctx, "dashboard.view")) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("user_names", { p_ids: wanted });
  if (error) throw error;
  return new Map(data.map((u) => [u.user_id, u.full_name]));
}

export async function reportExpenses(from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_expenses", { p_from: from, p_to: to });
  if (error) throw error;
  return data;
}

export async function expenseRegister(from: string, to: string, categoryId: string | null, status: string | null) {
  const supabase = await createClient();
  return fetchAll((a, b) => supabase.rpc("expense_register", { p_from: from, p_to: to, p_category_id: sqlNull(categoryId), p_status: sqlNull(status) }).range(a, b));
}
