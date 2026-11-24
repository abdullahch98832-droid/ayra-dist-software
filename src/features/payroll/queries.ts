import "server-only";
import { firstRow, lastRow, type ListFilter } from "@/lib/list-params";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { listPage } from "@/lib/supabase/list-page";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";

export async function loadRuns(filter: ListFilter) {
  const supabase = await createClient();
  let query = supabase.from("payroll_runs").select("id, doc_no, period_month, status, payroll_items(id, gross_pay, net_pay, salary_payments(amount, status))", { count: "exact" });
  if (filter.status) query = query.eq("status", filter.status as "draft");
  return listPage(query.order("period_month", { ascending: false }).order("created_at", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

export async function loadRun(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("payroll_runs").select(
    "id, doc_no, period_month, status, notes, void_reason, journal:journal_entries!payroll_runs_journal_entry_id_fkey(doc_no, entry_date), payroll_items(id, employee_id, basic_salary, allowances, bonus, deductions, advance_recovery, gross_pay, net_pay, notes, salary_payments(id, doc_no, payment_date, amount, method, reference, status, account:financial_accounts!salary_payments_financial_account_id_fkey(name)))"
  ).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadPayrollEmployees() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("payroll_employees");
  if (error) throw error;
  return data;
}
export type PayrollEmployee = Awaited<ReturnType<typeof loadPayrollEmployees>>[number];

export async function reportPayroll(from: string, to: string, employeeId: string | null = null) {
  const supabase = await createClient();
  return fetchAll((a, b) => supabase.rpc("report_payroll", { p_from: from, p_to: to, p_employee_id: sqlNull(employeeId) }).range(a, b));
}

export async function loadAdvances(filter: ListFilter & { employeeId?: string | null }) {
  const supabase = await createClient();
  let query = supabase.from("employee_advances").select(
    "id, doc_no, employee_id, advance_date, amount, method, reference, reason, status, void_reason, account:financial_accounts!employee_advances_financial_account_id_fkey(name)", { count: "exact" });
  if (filter.status) query = query.eq("status", filter.status as "draft");
  if (filter.employeeId) query = query.eq("employee_id", filter.employeeId);
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,reference.ilike.%${filter.q}%`);
  return listPage(query.order("advance_date", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}
