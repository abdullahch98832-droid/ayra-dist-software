import type { Metadata } from "next";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { reportDamaged } from "@/features/reports/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.damaged };
}

export default async function DamagedReportPage({ searchParams }: PageProps<"/reports/damaged">) {
  const { ctx, t, today, period, allowed, local } = await reportPage(REPORTS.damaged, searchParams);
  if (!allowed) return <Forbidden />;
  const s = t.stock;
  const rows = await reportDamaged(period);
  return (
    <>
      <PageHeader title={t.reports.damaged} breadcrumbs={[{ label: t.reports.title, href: "/reports" }]} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={t.reports.damaged} description={t.reports.damagedHint}>
        <SpecTable
          caption={t.reports.damaged}
          exportName={`damaged-${period.from}-${period.to}`}
          rows={rows.map((x) => ({
            id: x.product_id, name: local(x.name_en, x.name_ur), sku: x.sku, unit: local(x.unit_en, x.unit_ur), onHand: x.on_hand, value: x.stock_value,
            received: x.received_damaged, customer: x.customer_returns, moved: x.moved_in, written: x.written_off, returned: x.returned_to_supplier,
          }))}
          columns={[
            { key: "name", sub: "sku", label: t.documents.product, kind: "text", primary: true },
            { key: "onHand", sub: "unit", label: t.reports.damagedNow, kind: "quantity", total: true },
            ...(can(ctx, "costs.view") ? [{ key: "value", label: s.value, kind: "money" as const, total: true }] : []),
            { key: "received", label: s.receivedDamaged, kind: "quantity", total: true },
            { key: "customer", label: s.customerReturns, kind: "quantity", hideBelow: "lg", total: true },
            { key: "moved", label: s.movedIn, kind: "quantity", hideBelow: "lg", total: true },
            { key: "written", label: s.writtenOff, kind: "quantity", total: true },
            { key: "returned", label: s.returnedToSupplier, kind: "quantity", hideBelow: "lg", total: true },
          ]}
          searchKeys={["name", "sku"]}
          empty={{ title: t.reports.empty, description: t.reports.emptyHint }}
        />
      </PeriodFrame>
    </>
  );
}
