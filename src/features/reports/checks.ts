import "server-only";
import { can } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { sqlNull } from "@/lib/supabase/rpc";
import { toPaisa, type Paisa } from "@/lib/utils/money";
import type { Bi } from "@/lib/pdf/model";
import type { ReportCheck, ReportInput } from "./model";

/** Credits less debits of ledger accounts; `keys` are system keys or "type:expense". */
async function ledgerTotal(keys: string[], from: string | null, to: string, sources: string[] | null = null): Promise<Paisa> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ledger_total", { p_keys: keys, p_from: sqlNull(from), p_to: to, p_sources: sources ?? undefined });
  if (error) throw error;
  return toPaisa(data);
}

interface Expectation {
  label: Bi;
  report: Paisa;
  keys: string[];
  /** The report covers only these documents; the rest of the account is shown beside it. */
  sources?: string[];
  /** Null: a balance since the beginning. */
  from: string | null;
  to: string;
  /** The account grows with debits. */
  debit?: boolean;
}

/** Totals of a report beside the ledger, for those who may see it and while no filter leaves anything out. */
export async function ledgerChecks(input: ReportInput, list: (Expectation | null | false)[]): Promise<ReportCheck[]> {
  if (!can(input.ctx, "reports.financial") || !input.whole) return [];
  return Promise.all(list.filter((x): x is Expectation => !!x).map(async ({ label, report, keys, sources, from, to, debit }) => {
    const sign = (v: Paisa) => (debit ? -v : v);
    const ledger = sign(await ledgerTotal(keys, from, to));
    const covered = sources ? sign(await ledgerTotal(keys, from, to, sources)) : ledger;
    return { label, report, other: ledger - covered, ledger };
  }));
}
