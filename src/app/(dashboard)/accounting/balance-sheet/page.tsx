import type { Metadata } from "next";
import { Printer } from "lucide-react";
import { loadBalanceSheet, seesLedgers, seesStatements } from "@/features/accounting/queries";
import { businessToday } from "@/features/dashboard/period";
import { fill } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { pageContext } from "@/lib/page-context";
import { sumPaisa, toPaisa } from "@/lib/utils/money";
import { Statement, type StatementRow } from "@/components/accounting/statement";
import { PrintButton } from "@/components/documents/print-button";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { formatDate } from "@/components/shared/format";
import { UrlDate } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).accounting.tabs.balance };
}

export default async function BalanceSheetPage({ searchParams }: PageProps<"/accounting/balance-sheet">) {
  const { ctx, t, locale, local } = await pageContext();
  if (!seesStatements(ctx)) return <Forbidden />;
  const a = t.accounting;
  const query = await searchParams;
  const today = businessToday();
  const date = typeof query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.date) && query.date <= today ? query.date : today;
  const rows = await loadBalanceSheet(date);
  const open = seesLedgers(ctx);
  const label = (r: (typeof rows)[number]) => {
    if (r.system_key === "RESULT") return a.result;
    const name = local(r.name_en, r.name_ur);
    if (!r.flipped) return name;
    return (a.flipped as Record<string, string>)[r.system_key ?? ""] ?? fill(a.flipped.overdraft, { name });
  };
  const of = (section: string): StatementRow[] => rows.filter((r) => r.section === section && (r.amount !== 0 || r.system_key === "RESULT")).map((r) => ({ key: `${r.code}-${r.flipped}`, label: label(r), code: r.system_key === "RESULT" ? null : r.code, href: open && r.account_id ? `/accounting/ledger?account=${r.account_id}` : undefined, amount: toPaisa(r.amount) }));
  const total = (list: StatementRow[]) => sumPaisa(list.map((r) => r.amount));
  const [assets, liabilities, equity] = [of("asset"), of("liability"), of("equity")];
  const right = total(liabilities) + total(equity);
  const ok = total(assets) === right;
  return (
    <>
      <PageHeader title={a.tabs.balance} description={<>{a.asOf}: <bdi>{formatDate(date, locale)}</bdi></>} actions={<><UrlDate param="date" label={a.asOf} max={today} fallback={today} /><PrintButton label={t.sales.print} icon={<Printer aria-hidden />} /></>} />
      <div className="grid gap-6">
        <FormAlert tone={ok ? "success" : "error"}>{ok ? a.balanced : a.differs}</FormAlert>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Statement caption={a.assets} locale={locale} sections={[{ key: "assets", title: a.assets, rows: assets }, { key: "total", rows: [], total: { label: a.totalAssets, amount: total(assets) }, strong: true }]} />
          <Statement caption={a.liabilitiesAndEquity} locale={locale} sections={[
            { key: "liabilities", title: a.liabilities, rows: liabilities, total: { label: a.totalLiabilities, amount: total(liabilities) } }, { key: "equity", title: a.equity, rows: equity, total: { label: a.totalEquity, amount: total(equity) } },
            { key: "total", rows: [], total: { label: a.liabilitiesAndEquity, amount: right }, strong: true },
          ]} />
        </div>
      </div>
    </>
  );
}
