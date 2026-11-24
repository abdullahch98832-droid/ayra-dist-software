import type { Metadata } from "next";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { loadAccounts, loadOpenings, reportCashAccounts } from "@/features/cash-bank/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";
import { AccountsTable } from "./accounts-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).cashBank.title };
}

export default async function CashBankPage({ searchParams }: PageProps<"/cash-bank">) {
  const { ctx, t } = await pageContext();
  if (!can(ctx, "cash_bank.view")) return <Forbidden />;
  const c = t.cashBank;
  const today = businessToday();
  const period = parsePeriod(await searchParams, today);
  const [accounts, openings, report] = await Promise.all([loadAccounts(), loadOpenings(), reportCashAccounts(period.from, period.to)]);
  const opened = new Map(openings.map((o) => [o.financial_account_id, { id: o.id, amount: toDbAmount(toPaisa(o.amount)), date: o.opening_date }]));
  return (
    <>
      <PageHeader title={c.title} description={c.subtitle} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
        <AccountsTable accounts={accounts} manage={can(ctx, "cash_bank.manage")} openings={Object.fromEntries(opened)} today={today} />
        {accounts.length > 0 && (
          <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={c.summary} description={c.summaryHint}>
            <SpecTable
              caption={c.summary}
              exportName={`cash-bank-${period.from}-${period.to}`}
              rows={report.map((r) => ({ id: r.account_id, name: r.name, nameHref: `/cash-bank/book?account=${r.account_id}`, type: c.types[r.account_type], opening: r.opening, receipts: r.receipts, payments: r.payments, deposits: r.deposits, withdrawals: r.withdrawals, transfers: r.transfers, closing: r.closing, until: r.closed_until }))}
              columns={[
                { key: "name", sub: "type", label: c.name, kind: "link", primary: true }, { key: "opening", label: c.opening, kind: "money", total: true }, { key: "receipts", label: c.receipts, kind: "money", total: true }, { key: "payments", label: c.payments, kind: "money", total: true },
                { key: "deposits", label: c.deposits, kind: "money", hideBelow: "lg", total: true }, { key: "withdrawals", label: c.withdrawals, kind: "money", hideBelow: "lg", total: true }, { key: "transfers", label: c.transfersNet, kind: "money", hideBelow: "xl", total: true },
                { key: "closing", label: c.closingOf, kind: "money", total: true },
              ]}
              empty={{ title: c.empty }}
            />
          </PeriodFrame>
        )}
      </div>
    </>
  );
}
