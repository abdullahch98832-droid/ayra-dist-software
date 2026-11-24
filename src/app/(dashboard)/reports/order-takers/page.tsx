import type { Metadata } from "next";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { loadTakerReport } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.orderTakers };
}

export default async function OrderTakerReportPage({ searchParams }: PageProps<"/reports/order-takers">) {
  const { t, today, period, allowed, local } = await reportPage(REPORTS.orderTakers, searchParams);
  if (!allowed) return <Forbidden />;
  const r = t.reports;
  const k = t.takers;
  const rows = await loadTakerReport(period.from, period.to);
  return (
    <>
      <PageHeader title={r.orderTakers} breadcrumbs={[{ label: r.title, href: "/reports" }]} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={r.orderTakers} description={k.performanceHint}>
        <SpecTable
          caption={r.orderTakers}
          exportName={`order-takers-${period.from}-${period.to}`}
          rows={rows.map((x) => ({
            id: x.employee_id, name: local(x.full_name, x.full_name_ur), nameHref: `/order-takers/${x.employee_id}`, territory: x.territory, customers: x.customers, orders: x.orders, value: x.order_value,
            delivered: x.delivered_orders, cancelled: x.cancelled_orders, open: x.open_orders, sales: x.total_sales, collected: x.collected, pending: x.pending_collections, held: x.cash_held,
          }))}
          columns={[
            { key: "name", sub: "territory", label: t.sales.orderTaker, kind: "link", primary: true },
            { key: "customers", label: k.customers, kind: "quantity", hideBelow: "2xl", total: true },
            { key: "orders", label: k.orders, kind: "quantity", total: true },
            { key: "value", label: k.orderValue, kind: "money", hideBelow: "2xl", total: true },
            { key: "delivered", label: k.delivered, kind: "quantity", hideBelow: "lg", total: true },
            { key: "cancelled", label: k.cancelled, kind: "quantity", hideBelow: "xl", total: true },
            { key: "open", label: k.open, kind: "quantity", hideBelow: "2xl", total: true },
            { key: "sales", label: k.totalSales, kind: "money", total: true },
            { key: "collected", label: k.collected, kind: "money", hideBelow: "lg", total: true },
            { key: "pending", label: k.pending, kind: "money", hideBelow: "xl", total: true },
            { key: "held", label: k.cashHeld, kind: "money", hideBelow: "lg", total: true },
          ]}
          searchKeys={["name", "territory"]}
          empty={{ title: r.empty, description: r.emptyHint }}
        />
      </PeriodFrame>
    </>
  );
}
