import type { Metadata } from "next";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { reportLowStock } from "@/features/reports/queries";
import { getT } from "@/i18n/server";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.lowStock };
}

export default async function LowStockPage() {
  const { t, today, allowed, local } = await reportPage(REPORTS.lowStock);
  if (!allowed) return <Forbidden />;
  const r = t.reports;
  const rows = await reportLowStock();
  return (
    <>
      <PageHeader title={r.lowStock} description={r.lowStockHint} breadcrumbs={[{ label: r.title, href: "/reports" }]} />
      <SpecTable
        caption={r.lowStock}
        exportName={`low-stock-${today}`}
        rows={rows.map((x) => ({
          id: x.product_id, name: local(x.name_en, x.name_ur), nameHref: `/products/${x.product_id}`, sku: x.sku, unit: local(x.unit_en, x.unit_ur), available: x.available, minimum: x.reorder_level,
          shortage: x.shortage, onOrder: x.on_order, supplier: local(x.supplier_en ?? "", x.supplier_ur), last: x.last_received,
        }))}
        columns={[
          { key: "name", sub: "sku", label: t.documents.product, kind: "link", primary: true },
          { key: "unit", label: t.documents.unit, kind: "text", hideBelow: "lg" },
          { key: "available", label: t.stock.available, kind: "quantity" },
          { key: "minimum", label: t.stock.minimum, kind: "quantity" },
          { key: "shortage", label: r.shortage, kind: "quantity" },
          { key: "onOrder", label: r.onOrder, kind: "quantity" },
          { key: "supplier", label: t.documents.supplier, kind: "text", hideBelow: "lg" },
          { key: "last", label: r.lastReceived, kind: "date", hideBelow: "xl" },
        ]}
        searchKeys={["name", "sku", "supplier"]}
        initialSort={{ id: "shortage", descending: true }}
        empty={{ title: r.lowStockEmpty }}
      />
    </>
  );
}
