import "server-only";
import { firstRow, lastRow, type ListFilter } from "@/lib/list-params";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { listPage } from "@/lib/supabase/list-page";
import { createClient } from "@/lib/supabase/server";

/** Accounts for payments and expenses: name and masked identifier only. */
export async function loadPaymentAccounts() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_payment_accounts");
  if (error) throw error;
  return data.map((a) => ({ id: a.account_id, name: a.name, type: a.account_type, masked: a.masked as string | null, isActive: a.is_active }));
}
export type PaymentAccount = Awaited<ReturnType<typeof loadPaymentAccounts>>[number];
/** "HBL · ****1234" */
export const accountLabel = (a: Pick<PaymentAccount, "name" | "masked">) => (a.masked ? `${a.name} · ${a.masked}` : a.name);

export async function loadAccounts() {
  const supabase = await createClient();
  const [accounts, balances] = await Promise.all([
    supabase.from("financial_accounts").select("id, name, account_type, is_active, notes, details:financial_account_bank_details(bank_name, account_title, account_number, iban, branch)").order("account_type").order("name"),
    supabase.from("v_financial_account_balances").select("financial_account_id, balance"),
  ]);
  for (const r of [accounts, balances]) if (r.error) throw r.error;
  const balance = new Map((balances.data ?? []).map((b) => [b.financial_account_id, b.balance]));
  return (accounts.data ?? []).map((a) => ({
    id: a.id, name: a.name, type: a.account_type, isActive: a.is_active, notes: a.notes, balance: balance.get(a.id) ?? 0, bankName: a.details?.bank_name ?? null,
    accountTitle: a.details?.account_title ?? null, accountNumber: a.details?.account_number ?? null, iban: a.details?.iban ?? null, branch: a.details?.branch ?? null,
  }));
}
export type Account = Awaited<ReturnType<typeof loadAccounts>>[number];

export async function reportCashAccounts(from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_cash_accounts", { p_from: from, p_to: to });
  if (error) throw error;
  return data;
}

export async function loadOpenings() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("account_openings").select("id, doc_no, financial_account_id, opening_date, amount").eq("status", "posted");
  if (error) throw error;
  return data;
}

export async function loadAccountBook(accountId: string, from: string, to: string) {
  const supabase = await createClient();
  return fetchAll((a, b) => supabase.rpc("account_book", { p_financial_account_id: accountId, p_from: from, p_to: to }).range(a, b));
}

export async function loadTransfers(filter: ListFilter) {
  const supabase = await createClient();
  let query = supabase.from("fund_transfers").select(
    "id, doc_no, transfer_date, amount, method, reference, notes, status, void_reason, source:financial_accounts!fund_transfers_from_account_id_fkey(name, account_type), target:financial_accounts!fund_transfers_to_account_id_fkey(name, account_type)", { count: "exact" });
  if (filter.status) query = query.eq("status", filter.status as "posted");
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,reference.ilike.%${filter.q}%`);
  return listPage(query.order("transfer_date", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

export async function loadVouchers(filter: ListFilter & { kind: string }) {
  const supabase = await createClient();
  let query = supabase.from("cash_vouchers").select(
    "id, doc_no, kind, voucher_date, amount, party_name, method, reference, description, status, void_reason, account:financial_accounts!cash_vouchers_financial_account_id_fkey(name), counter:chart_of_accounts!cash_vouchers_counter_account_id_fkey(code, name_en, name_ur)", { count: "exact" });
  if (filter.status) query = query.eq("status", filter.status as "posted");
  if (filter.kind) query = query.eq("kind", filter.kind);
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,reference.ilike.%${filter.q}%,party_name.ilike.%${filter.q}%,description.ilike.%${filter.q}%`);
  return listPage(query.order("voucher_date", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

export async function loadVoucherAccounts(kind: "receipt" | "payment") {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_voucher_accounts", { p_kind: kind });
  if (error) throw error;
  return data;
}

export async function loadCashDay(accountId: string, date: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cash_day", { p_account_id: accountId, p_date: date });
  if (error) throw error;
  return data[0] ?? null;
}

export async function loadClosings(filter: ListFilter & { accountId: string | null }) {
  const supabase = await createClient();
  let query = supabase.from("cash_closings").select(
    "id, doc_no, financial_account_id, closing_date, opening_balance, receipts, payments, expected, counted, difference, difference_entry_id, notes, status, reopen_reason, created_by, account:financial_accounts!cash_closings_financial_account_id_fkey(name)", { count: "exact" });
  if (filter.accountId) query = query.eq("financial_account_id", filter.accountId);
  return listPage(query.order("closing_date", { ascending: false }).order("created_at", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}
