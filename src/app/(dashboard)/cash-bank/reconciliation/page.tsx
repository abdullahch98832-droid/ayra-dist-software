import type { Metadata } from "next";
import { loadBankAccounts, loadBankReconciliations } from "@/features/cash-bank/queries";
import { businessToday } from "@/features/dashboard/period";
import { fill, isolate } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { formatDate } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { SpecTable } from "@/components/tables/spec-table";
import { StartReconciliation } from "./start-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).analytics.bank.title };
}

export default async function BankReconciliationsPage() {
  const { ctx, t, locale } = await pageContext();
  const reconciles = can(ctx, "cash_bank.reconcile");
  if (!can(ctx, "cash_bank.view") && !reconciles) return <Forbidden />;
  const { analytics: a, cashBank: c } = t;
  const b = a.bank;
  const [accounts, rows] = await Promise.all([loadBankAccounts(), loadBankReconciliations(null)]);
  const today = businessToday();
  const banks = accounts.map((x) => ({ ...x, open: rows.find((r) => r.account_id === x.id && r.status === "draft") ?? null, last: rows.find((r) => r.account_id === x.id && r.status === "completed") ?? null }));
  return (
    <>
      <PageHeader title={b.title} description={b.subtitle} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {banks.length === 0 ? <EmptyState title={a.noBankAccounts} description={b.noBanks} /> : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {banks.map((x) => (
              <li key={x.id} className="grid content-between gap-4 rounded-2xl border bg-card p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="font-medium break-words text-navy"><bdi>{x.name}</bdi></p><p className="text-xs text-muted-foreground">{x.last ? fill(b.until, { date: isolate(formatDate(x.last.statement_date, locale) ?? "") }) : b.never}</p></div>
                  {x.open && <StatusBadge tone="amber">{a.statuses.draft}</StatusBadge>}
                </div>
                {x.open ? <LinkButton href={`/cash-bank/reconciliation/${x.open.id}`} variant="outline" className="justify-self-start">{reconciles ? b.continue : b.open}</LinkButton>
                  : reconciles && x.isActive && <StartReconciliation account={{ id: x.id, name: x.name }} today={today} after={x.last?.statement_date ?? null} />}
              </li>
            ))}
          </ul>
        )}
        {rows.length > 0 && (
          <SpecTable
            caption={a.reconciliations}
            rows={rows.map((r) => ({ id: r.id, no: r.doc_no, noHref: `/cash-bank/reconciliation/${r.id}`, account: r.account, date: r.statement_date, statement: r.statement_balance, ledger: r.ledger, difference: r.difference, status: r.status }))}
            columns={[
              { key: "no", label: t.documents.number, kind: "link", primary: true }, { key: "account", label: c.name, kind: "text" }, { key: "date", label: a.statementDate, kind: "date" }, { key: "statement", label: a.statementBalance, kind: "money", hideBelow: "lg" },
              { key: "ledger", label: a.ledgerBalance, kind: "money", hideBelow: "lg" }, { key: "difference", label: a.difference, kind: "money" },
              { key: "status", label: t.common.status, kind: "status", options: { draft: { label: a.statuses.draft, tone: "amber" }, completed: { label: a.statuses.completed, tone: "green" } } },
            ]}
            searchKeys={["no", "account"]}
            empty={{ title: b.empty }}
          />
        )}
      </div>
    </>
  );
}
