import "server-only";
import { APP_CONFIG } from "@/config/app";
import type { Period } from "@/features/dashboard/period";
import { readContributors } from "@/features/payments/contributors";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { toDbAmount, toPaisa } from "@/lib/utils/money";

/** The calendar date of an instant as it reads in Pakistan. */
function wallDate(instant: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: APP_CONFIG.timeZone, dateStyle: "short" }).format(new Date(instant)).slice(0, 10);
}

/** Payments of a period as they stand now, newest first, voided ones included. */
export async function loadExtraPayments(period: Pick<Period, "from" | "to">) {
  const supabase = await createClient();
  const rows = await fetchAll((from, to) => supabase.from("company_extra_payments")
    .select("id, doc_no, name, paid_at, amount, direction, kind, contributors, financial_account_id, method, reference, notes, status, void_reason, account:financial_accounts!company_extra_payments_financial_account_id_fkey(name), journal:journal_entries!company_extra_payments_journal_entry_id_fkey(doc_no)")
    .gte("paid_at", `${period.from}T00:00:00+05:00`).lte("paid_at", `${period.to}T23:59:59.999+05:00`).order("paid_at", { ascending: false }).order("doc_no", { ascending: false }).range(from, to));
  return rows.map((r) => ({
    id: r.id, number: r.doc_no, name: r.name, paidAt: r.paid_at, date: wallDate(r.paid_at), amount: toDbAmount(toPaisa(r.amount)),
    direction: r.direction === "in" ? ("in" as const) : ("out" as const), kind: r.kind === "account" ? ("account" as const) : ("extra" as const),
    contributors: readContributors(r.contributors), accountId: r.financial_account_id, account: r.account?.name ?? "",
    method: r.method, reference: r.reference ?? "", notes: r.notes ?? "", isVoid: r.status === "void", voidReason: r.void_reason, journal: r.journal?.doc_no ?? null,
  }));
}
export type ExtraPayment = Awaited<ReturnType<typeof loadExtraPayments>>[number];

export async function reportCompanyExtra(period: Pick<Period, "from" | "to">) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_company_extra", { p_from: period.from, p_to: period.to }).range(from, to));
}
