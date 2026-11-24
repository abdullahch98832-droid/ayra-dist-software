import "server-only";
import { firstRow, lastRow, type ListFilter } from "@/lib/list-params";
import { listPage } from "@/lib/supabase/list-page";
import { createClient } from "@/lib/supabase/server";

const COLUMNS =
  "id, doc_no, expense_date, amount, payee, description, method, reference, litres, odometer, status, void_reason, vehicle_id, sol_job_id, financial_account_id, created_by, category:expense_categories!expenses_category_id_fkey(name_en, name_ur, vehicle_kind), account:financial_accounts!expenses_financial_account_id_fkey(name), vehicle:vehicles!expenses_vehicle_id_fkey(id, registration_no, name), job:sol_jobs!expenses_sol_job_id_fkey(id, doc_no), journal:journal_entries!expenses_journal_entry_id_fkey(doc_no)";

export async function loadExpenses(filter: ListFilter & { vehicleId?: string | null; jobId?: string | null; categoryId?: string | null; pageSize?: number }) {
  const supabase = await createClient();
  let query = supabase.from("expenses").select(COLUMNS, { count: "exact" });
  if (filter.status) query = query.eq("status", filter.status as "draft");
  if (filter.vehicleId) query = query.eq("vehicle_id", filter.vehicleId);
  if (filter.jobId) query = query.eq("sol_job_id", filter.jobId);
  if (filter.categoryId) query = query.eq("category_id", filter.categoryId);
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,payee.ilike.%${filter.q}%,reference.ilike.%${filter.q}%`);
  return listPage(query.order("expense_date", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}
export type ExpenseRow = Awaited<ReturnType<typeof loadExpenses>>["rows"][number];

export async function loadExpense(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("expenses").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadExpenseCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("expense_categories").select("id, name_en, name_ur, vehicle_kind").eq("is_active", true).order("name_en");
  if (error) throw error;
  return data.map((c) => ({ id: c.id, nameEn: c.name_en, nameUr: c.name_ur as string | null, vehicleKind: c.vehicle_kind }));
}
export type ExpenseCategory = Awaited<ReturnType<typeof loadExpenseCategories>>[number];
