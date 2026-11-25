import type { Metadata } from "next";
import { loadCashFlow, seesStatements } from "@/features/accounting/queries";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { getT } from "@/i18n/server";
import { pageContext } from "@/lib/page-context";
import { sumPaisa, toPaisa } from "@/lib/utils/money";
import { DocumentLink } from "@/components/documents/document-link";
import { Statement, type StatementRow } from "@/components/accounting/statement";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";

/** Parties first, then the single accounts by their code. */
const ORDER = ["customers", "company", "suppliers", "salaries", "advances"];

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).accounting.tabs.cash };
}

export default async function CashFlowPage({ searchParams }: PageProps<"/accounting/cash-flow">) {
  const { ctx, t, locale, local } = await pageContext();
  if (!seesStatements(ctx)) return <Forbidden />;
  const a = t.accounting;
  const today = businessToday();
  const period = parsePeriod(await searchParams, today);
  const rows = await loadCashFlow(period.from, period.to);
  const place = (r: (typeof rows)[number]) => { const i = ORDER.indexOf(r.line); return i < 0 ? ORDER.length : i; };
  const sorted = rows.toSorted((x, y) => place(x) - place(y) || (x.code ?? "").localeCompare(y.code ?? ""));
  const of = (section: string): StatementRow[] => sorted.filter((r) => r.section === section).map((r) => ({
    key: `${r.line}-${r.code ?? ""}`, code: r.code, amount: toPaisa(r.amount), label: r.name_en ? local(r.name_en, r.name_ur) : (a.cashLines as Record<string, string>)[r.line] ?? r.line,
  }));
  const total = (list: StatementRow[]) => sumPaisa(list.map((r) => r.amount));
  const one = (section: string) => toPaisa(rows.find((r) => r.section === section)?.amount ?? 0);
  const parts = (["operating", "investing", "financing"] as const).map((key) => ({ key, rows: of(key) }));
  const opened = total(of("opening_balances"));
  const change = parts.reduce((sum, p) => sum + total(p.rows), BigInt(0));
  return (
    <>
      <PageHeader title={a.tabs.cash} actions={<DocumentLink kind="cash_flow" params={{ range: "custom", from: period.from, to: period.to }} label={t.docs.pdf} />} />
      <PeriodFrame compact key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={a.tabs.cash} description={a.subtitle}>
        <Statement caption={a.tabs.cash} locale={locale} sections={[
          { key: "opening", rows: [], total: { label: a.cashStart, amount: one("opening") }, strong: true },
          ...(opened !== BigInt(0) ? [{ key: "opened", rows: [], total: { label: a.openingBalances, amount: opened } }] : []),
          ...parts.map((p) => ({ key: p.key, title: p.rows.length > 0 ? a[p.key] : undefined, rows: p.rows, total: { label: a[p.key], amount: total(p.rows) } })),
          { key: "change", rows: [], total: { label: a.netChange, amount: change } },
          { key: "closing", rows: [], total: { label: a.cashEnd, amount: one("closing") }, strong: true },
        ]} />
      </PeriodFrame>
    </>
  );
}
