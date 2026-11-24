import type { Metadata } from "next";
import { flowOf, flowPath } from "@/features/purchasing/flow";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { reportSuppliers } from "@/features/reports/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.suppliers };
}

export default async function SupplierReportPage({ searchParams }: PageProps<"/reports/suppliers">) {
  const { ctx, t, today, period, allowed, local } = await reportPage(REPORTS.suppliers, searchParams);
  if (!allowed) return <Forbidden />;
  const p = t.payables;
  const rows = await reportSuppliers(period);
  return (
    <>
      <PageHeader title={t.reports.suppliers} breadcrumbs={[{ label: t.reports.title, href: "/reports" }]} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={t.reports.suppliers} description={t.reports.suppliersHint}>
        <SpecTable
          caption={t.reports.suppliers}
          exportName={`suppliers-${period.from}-${period.to}`}
          rows={rows.map((r) => ({
            id: r.supplier_id, name: local(r.name, r.name_ur), code: r.code,
            nameHref: r.is_principal ? flowPath("company", "account") : `${flowPath(flowOf(r.is_principal), "account")}?supplier=${r.supplier_id}`,
            opening: r.opening, purchases: r.purchases, differences: r.bill_differences, returns: r.returns, payments: r.payments, other: r.other, closing: r.closing, open: r.open_orders,
          }))}
          columns={[
            { key: "name", sub: "code", label: t.documents.supplier, kind: "link", primary: true },
            { key: "opening", label: p.opening, kind: "money", total: true },
            { key: "purchases", label: p.purchases, kind: "money", total: true },
            { key: "differences", label: p.differences, kind: "money", hideBelow: "xl", total: true },
            { key: "returns", label: p.returns, kind: "money", hideBelow: "lg", total: true },
            { key: "payments", label: p.payments, kind: "money", total: true },
            { key: "other", label: p.other, kind: "money", hideBelow: "xl", total: true },
            { key: "closing", label: p.closing, kind: "money", total: true },
            ...(can(ctx, "purchasing.view") ? [{ key: "open", label: p.openOrders, kind: "money" as const, hideBelow: "xl" as const, total: true }] : []),
          ]}
          searchKeys={["name", "code"]}
          empty={{ title: t.reports.empty, description: t.reports.emptyHint }}
        />
      </PeriodFrame>
    </>
  );
}
