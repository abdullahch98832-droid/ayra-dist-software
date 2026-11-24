import "server-only";
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
