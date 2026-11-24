import "server-only";
import type { Dictionary } from "@/i18n";
import { can, type SessionContext } from "@/lib/auth/session";
import { LIST_PAGE } from "@/lib/list-params";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";

/** Statements for whoever reads financial reports; ledgers for whoever keeps the books. */
export const seesStatements = (ctx: SessionContext) => can(ctx, "reports.financial");
export const seesLedgers = (ctx: SessionContext) => can(ctx, "accounting.view");

export async function loadChart() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("chart_of_accounts").select("id, code, name_en, name_ur, account_type, parent_id, is_postable, system_key, is_active, cash_flow").order("code");
  if (error) throw error;
  return data;
}
export type LedgerAccount = Awaited<ReturnType<typeof loadChart>>[number];

export async function loadBalances(ctx: SessionContext): Promise<Map<string, number>> {
  if (!can(ctx, "accounting.view")) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_account_balances").select("account_id, balance");
  if (error) throw error;
  return new Map(data.map((r) => [r.account_id ?? "", r.balance ?? 0]));
}

export async function loadGeneralLedger(accountId: string, from: string, to: string) {
  const supabase = await createClient();
  return fetchAll((a, b) => supabase.rpc("general_ledger", { p_account_id: accountId, p_from: from, p_to: to }).range(a, b));
}
export type LedgerLine = Awaited<ReturnType<typeof loadGeneralLedger>>[number];

export async function loadJournal(from: string, to: string, source: string | null, search: string, page: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_journal", { p_from: from, p_to: to, p_source: sqlNull(source), p_search: sqlNull(search || null), p_limit: LIST_PAGE, p_offset: (page - 1) * LIST_PAGE });
  if (error) throw error;
  return { rows: data, total: Number(data[0]?.total_count ?? 0) };
}

export async function loadEntry(id: string) {
  const supabase = await createClient();
  const [entry, lines] = await Promise.all([
    supabase.from("journal_entries").select("id, doc_no, entry_date, description, source_type, source_id, status, reversal_of, reversed_by, posted_at, posted_by").eq("id", id).maybeSingle(),
    supabase.rpc("journal_lines", { p_entry_id: id }),
  ]);
  for (const r of [entry, lines]) if (r.error) throw r.error;
  if (!entry.data) return null;
  const linked = [entry.data.reversal_of, entry.data.reversed_by].filter((x): x is string => !!x);
  const others = linked.length ? await supabase.from("journal_entries").select("id, doc_no").in("id", linked) : { data: [], error: null };
  if (others.error) throw others.error;
  return { ...entry.data, lines: lines.data ?? [], linked: new Map((others.data ?? []).map((x) => [x.id, x.doc_no])) };
}

export async function reportTrialBalance(from: string, to: string) {
  const supabase = await createClient();
  return fetchAll((a, b) => supabase.rpc("report_trial_balance", { p_from: from, p_to: to }).range(a, b));
}
export async function loadIncomeStatement(from: string, to: string) {
  const supabase = await createClient();
  return fetchAll((a, b) => supabase.rpc("income_statement", { p_from: from, p_to: to }).range(a, b));
}
export async function loadBalanceSheet(asOf: string) {
  const supabase = await createClient();
  return fetchAll((a, b) => supabase.rpc("balance_sheet", { p_as_of: asOf }).range(a, b));
}
export async function loadCashFlow(from: string, to: string) {
  const supabase = await createClient();
  return fetchAll((a, b) => supabase.rpc("cash_flow", { p_from: from, p_to: to }).range(a, b));
}
export async function loadChecks() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ledger_checks");
  if (error) throw error;
  return data;
}

export async function loadPeriods() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("accounting_periods").select("id, name, start_date, end_date, status, closed_at, reopen_reason, closing_totals").order("start_date", { ascending: false });
  if (error) throw error;
  return data;
}
export async function loadChecklist(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("period_checklist", { p_id: id });
  if (error) throw error;
  return data.filter((r) => Number(r.found) > 0);
}

export async function loadParties() {
  const supabase = await createClient();
  const [customers, suppliers] = await Promise.all([
    fetchAll((a, b) => supabase.from("customers").select("id, name, name_ur").order("name").range(a, b)),
    fetchAll((a, b) => supabase.from("suppliers").select("id, name, name_ur").order("name").range(a, b)),
  ]);
  const choice = (x: { id: string; name: string; name_ur: string | null }) => ({ id: x.id, nameEn: x.name, nameUr: x.name_ur });
  return { customers: customers.map(choice), suppliers: suppliers.map(choice) };
}

/** Page of the document behind an entry. */
export function sourceHref(type: string | null, id: string | null): string | undefined {
  if (!id) return undefined;
  switch (type) {
    case "sales_invoice": return `/sales/invoices/${id}`;
    case "customer_payment": return `/receivables/payments/${id}`;
    case "customer_return": return `/sales/returns/${id}`;
    case "customer_note": return `/receivables/notes/${id}`;
    case "expense": return `/expenses/${id}`;
    case "payroll_run": return `/payroll/${id}`;
    case "sol_job": return `/sol/jobs/${id}`;
    case "sol_delivery": return `/sol/deliveries/${id}`;
    case "stock_adjustment": return `/inventory/adjustments/${id}`;
    default: return undefined;
  }
}

export const sourceLabel = (t: Dictionary, type: string | null) => (t.accounting.sources as Record<string, string>)[type ?? ""] ?? type ?? "";
