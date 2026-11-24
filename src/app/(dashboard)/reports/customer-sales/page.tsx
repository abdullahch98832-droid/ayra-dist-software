import type { Metadata } from "next";
import { uuidParam } from "@/lib/page-context";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { reportSalesByCustomer } from "@/features/reports/queries";
import { loadTakers } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.customerSales };
}

export default async function CustomerSalesPage({ searchParams }: PageProps<"/reports/customer-sales">) {
  const { ctx, t, query, today, period, allowed, local } = await reportPage(REPORTS.customerSales, searchParams);
  if (!allowed) return <Forbidden />;
  const r = t.reports;
  const all = can(ctx, "sales.view_all");
  const receivables = can(ctx, "receivables.view");
  const [rows, takers] = await Promise.all([reportSalesByCustomer(period, uuidParam(query.taker)), all ? loadTakers() : []]);
  return (
    <>
      <PageHeader title={r.customerSales} breadcrumbs={[{ label: r.title, href: "/reports" }]} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={r.customerSales} description={r.salesNote}>
        <SpecTable
          caption={r.customerSales}
          exportName={`customer-sales-${period.from}-${period.to}`}
          rows={rows.map((x) => ({
            id: x.customer_id, name: local(x.name, x.name_ur), nameHref: `/customers/${x.customer_id}`, code: x.code, city: x.city, taker: x.taker_en ? local(x.taker_en, x.taker_ur) : null,
            orders: x.orders, invoices: x.invoices, net: x.net, tax: x.tax, returns: x.returns, notes: x.notes, sales: x.net_sales, collected: x.collected, balance: x.balance,
          }))}
          columns={[
            { key: "name", sub: "code", label: t.customers.name, kind: "link", primary: true },
            { key: "city", label: t.customers.city, kind: "text", hideBelow: "2xl" },
            ...(all ? [{ key: "taker", label: t.customers.orderTaker, kind: "text" as const, hideBelow: "xl" as const }] : []),
            { key: "orders", label: t.takers.orders, kind: "quantity", hideBelow: "lg", total: true },
            { key: "invoices", label: r.invoices, kind: "quantity", hideBelow: "2xl", total: true },
            { key: "net", label: r.net, kind: "money", hideBelow: "xl", total: true },
            { key: "tax", label: r.tax, kind: "money", hideBelow: "2xl", total: true },
            { key: "returns", label: r.returns, kind: "money", hideBelow: "xl", total: true },
            { key: "notes", label: r.notes, kind: "money", hideBelow: "2xl", total: true },
            { key: "sales", label: r.netSales, kind: "money", total: true },
            ...(receivables ? [
              { key: "collected", label: r.collected, kind: "money" as const, hideBelow: "lg" as const, total: true },
              { key: "balance", label: t.customers.balance, kind: "money" as const, total: true },
            ] : []),
          ]}
          searchKeys={["name", "code", "city", "taker"]}
          toolbar={takers.length > 0 && <UrlSelect param="taker" label={t.customers.allOrderTakers} options={takers.map((x) => ({ value: x.id, label: local(x.nameEn, x.nameUr) }))} />}
          empty={{ title: r.empty, description: r.emptyHint }}
        />
      </PeriodFrame>
    </>
  );
}
