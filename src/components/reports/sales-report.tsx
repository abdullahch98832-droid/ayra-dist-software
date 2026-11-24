import type { Metadata } from "next";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { reportSales } from "@/features/reports/queries";
import { getT } from "@/i18n/server";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { ColumnChartCard } from "@/components/charts/column-chart";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { formatBucket, formatDate } from "@/components/shared/format";
import { SpecTable } from "@/components/tables/spec-table";

type Bucket = "day" | "month";
const report = (bucket: Bucket) => (bucket === "day" ? REPORTS.dailySales : REPORTS.monthlySales);

export async function salesReportMetadata(bucket: Bucket): Promise<Metadata> {
  const t = await getT();
  return { title: t.reports[report(bucket).title] };
}

/** Daily and monthly sales are the same report in different steps. */
export async function SalesReport({ bucket, searchParams }: { bucket: Bucket; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const definition = report(bucket);
  const { t, locale, today, period, allowed } = await reportPage(definition, searchParams);
  if (!allowed) return <Forbidden />;
  const r = t.reports;
  const title = r[definition.title];
  const rows = await reportSales(period, bucket);
  const collected = rows.some((x) => x.collected !== null);
  const label = (d: string) => (bucket === "month" ? formatBucket(d, "month", locale) : formatDate(d, locale) ?? d);
  const oldestFirst = [...rows].reverse();
  // The number only sets the height of a column; the text is exact.
  const point = (v: number) => ({ value: Number(toPaisa(v) / BigInt(100)), display: formatPaisa(toPaisa(v), locale) });
  return (
    <>
      <PageHeader title={title} breadcrumbs={[{ label: r.title, href: "/reports" }]} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={title} description={r.salesNote}>
        {rows.length > 1 && (
          <div className="print:hidden">
            <ColumnChartCard
              title={r.netSales} description={r[definition.hint]} categoryLabel={bucket === "day" ? t.documents.date : r.salesPeriod}
              series={[{ key: "sales", label: r.netSales }, ...(collected ? [{ key: "collected", label: r.collected }] : [])]}
              points={oldestFirst.map((x) => ({ label: formatBucket(x.period, bucket, locale), values: [point(x.net_sales), ...(collected ? [point(x.collected ?? 0)] : [])] }))}
            />
          </div>
        )}
        <SpecTable
          caption={title}
          exportName={`${definition.slug}-${period.from}-${period.to}`}
          rows={rows.map((x) => ({
            id: x.period, date: x.period, period: label(x.period), invoices: x.invoices, gross: x.gross, discounts: x.discounts, net: x.net, tax: x.tax, returns: x.returns,
            credit: x.credit_notes, debit: x.debit_notes, sales: x.net_sales, collected: x.collected,
          }))}
          columns={[
            bucket === "day" ? { key: "date", label: t.documents.date, kind: "date", primary: true } : { key: "period", label: r.salesPeriod, kind: "text", primary: true },
            { key: "invoices", label: r.invoices, kind: "quantity", total: true },
            { key: "gross", label: r.gross, kind: "money", hideBelow: "xl", total: true },
            { key: "discounts", label: r.discounts, kind: "money", hideBelow: "xl", total: true },
            { key: "tax", label: r.tax, kind: "money", hideBelow: "2xl", total: true },
            { key: "returns", label: r.returns, kind: "money", hideBelow: "lg", total: true },
            { key: "credit", label: r.creditNotes, kind: "money", hideBelow: "2xl", total: true },
            { key: "debit", label: r.debitNotes, kind: "money", hideBelow: "2xl", total: true },
            { key: "sales", label: r.netSales, kind: "money", total: true },
            ...(collected ? [{ key: "collected", label: r.collected, kind: "money" as const, total: true }] : []),
          ]}
          empty={{ title: r.empty, description: r.emptyHint }}
        />
      </PeriodFrame>
    </>
  );
}
