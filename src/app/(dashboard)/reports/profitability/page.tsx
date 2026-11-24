import type { Metadata } from "next";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { reportProfitability } from "@/features/reports/queries";
import { getT } from "@/i18n/server";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.profitability };
}

export default async function ProfitabilityPage({ searchParams }: PageProps<"/reports/profitability">) {
  const { t, today, period, allowed, local } = await reportPage(REPORTS.profitability, searchParams);
  if (!allowed) return <Forbidden />;
  const r = t.reports;
  const rows = await reportProfitability(period);
  return (
    <>
      <PageHeader title={r.profitability} breadcrumbs={[{ label: r.title, href: "/reports" }]} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={r.profitability} description={r.profitabilityHint}>
        <SpecTable
          caption={r.profitability}
          exportName={`profitability-${period.from}-${period.to}`}
          rows={rows.map((x) => ({
            id: x.product_id, name: local(x.name_en, x.name_ur), sku: x.sku, unit: local(x.unit_en, x.unit_ur), quantity: x.quantity, sales: x.net_sales, cost: x.cost, profit: x.gross_profit, margin: x.margin_percent,
          }))}
          columns={[
            { key: "name", sub: "sku", label: t.documents.product, kind: "text", primary: true },
            { key: "quantity", sub: "unit", label: r.soldQuantity, kind: "quantity" },
            { key: "sales", label: r.netSales, kind: "money", total: true },
            { key: "cost", label: r.cost, kind: "money", total: true },
            { key: "profit", label: r.grossProfit, kind: "money", total: true },
            { key: "margin", label: r.margin, kind: "percent" },
          ]}
          searchKeys={["name", "sku"]}
          initialSort={{ id: "profit", descending: true }}
          empty={{ title: r.empty, description: r.emptyHint }}
        />
      </PeriodFrame>
    </>
  );
}
