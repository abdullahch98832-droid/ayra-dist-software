import type { Metadata } from "next";
import { loadIncomeStatement, seesLedgers, seesStatements } from "@/features/accounting/queries";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { getT } from "@/i18n/server";
import { pageContext } from "@/lib/page-context";
import { sumPaisa, toPaisa } from "@/lib/utils/money";
import { DocumentLink } from "@/components/documents/document-link";
import { Statement, type StatementRow } from "@/components/accounting/statement";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/states";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).accounting.tabs.profit };
}

export default async function ProfitAndLossPage({ searchParams }: PageProps<"/accounting/profit-and-loss">) {
  const { ctx, t, locale, local } = await pageContext();
  if (!seesStatements(ctx)) return <Forbidden />;
  const a = t.accounting;
  const today = businessToday();
  const period = parsePeriod(await searchParams, today);
  const rows = await loadIncomeStatement(period.from, period.to);
  const open = seesLedgers(ctx);
  const of = (section: string): StatementRow[] => rows.filter((r) => r.section === section).map((r) => ({ key: r.account_id, label: local(r.name_en, r.name_ur), code: r.code, href: open ? `/accounting/ledger?account=${r.account_id}` : undefined, amount: toPaisa(r.amount) }));
  const total = (list: StatementRow[]) => sumPaisa(list.map((r) => r.amount));
  const [sales, cost, other, expense] = [of("sales"), of("cost"), of("other_income"), of("expense")];
  const gross = total(sales) - total(cost);
  const net = gross + total(other) - total(expense);
  return (
    <>
      <PageHeader title={a.tabs.profit} actions={<DocumentLink kind="profit_and_loss" params={{ range: "custom", from: period.from, to: period.to }} label={t.docs.pdf} />} />
      <PeriodFrame compact key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={a.tabs.profit} description={a.subtitle}>
        {rows.length === 0 ? <EmptyState title={a.statementEmpty} /> : (
          <Statement caption={a.tabs.profit} locale={locale} sections={[
            { key: "sales", rows: sales, total: { label: a.sales, amount: total(sales) } }, { key: "cost", title: a.costOfSales, rows: cost, total: { label: a.costOfSales, amount: total(cost) } },
            { key: "gross", rows: [], total: { label: a.grossProfit, amount: gross }, strong: true }, { key: "other", title: a.otherIncome, rows: other, total: { label: a.otherIncome, amount: total(other) } },
            { key: "expense", title: a.expenses, rows: expense, total: { label: a.expenses, amount: total(expense) } }, { key: "net", rows: [], total: { label: net < BigInt(0) ? a.netLoss : a.netProfit, amount: net }, strong: true },
          ]} />
        )}
      </PeriodFrame>
    </>
  );
}
