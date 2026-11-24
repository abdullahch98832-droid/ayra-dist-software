import type { Metadata } from "next";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { uuidParam } from "@/features/inventory/page-context";
import { loadCategories, loadStock } from "@/features/inventory/queries";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.stock };
}

export default async function StockReportPage({ searchParams }: PageProps<"/reports/stock">) {
  const { ctx, t, query, today, allowed, local } = await reportPage(REPORTS.stock, searchParams);
  if (!allowed) return <Forbidden />;
  const s = t.stock;
  const [rows, warehouses, categories] = await Promise.all([loadStock(uuidParam(query.warehouse), uuidParam(query.category)), loadWarehouseChoices(), loadCategories()]);
  return (
    <>
      <PageHeader title={t.reports.stock} description={t.reports.stockHint} breadcrumbs={[{ label: t.reports.title, href: "/reports" }]} />
      <SpecTable
        caption={t.reports.stock}
        exportName={`stock-${today}`}
        rows={rows.map((r) => ({
          id: r.product_id, name: local(r.name_en, r.name_ur), sku: r.sku, barcode: r.barcode, category: local(r.category_en ?? "", r.category_ur), brand: local(r.brand_en ?? "", r.brand_ur), unit: local(r.unit_en, r.unit_ur),
          onHand: r.on_hand, reserved: r.reserved, available: r.available, damaged: r.damaged, minimum: r.reorder_level, cost: r.unit_cost, value: r.stock_value,
        }))}
        columns={[
          { key: "name", sub: "sku", label: t.documents.product, kind: "text", primary: true },
          { key: "category", label: t.catalog.category, kind: "text", hideBelow: "xl" },
          { key: "brand", label: t.catalog.brand, kind: "text", hideBelow: "2xl" },
          { key: "unit", label: t.documents.unit, kind: "text", hideBelow: "lg" },
          { key: "onHand", label: s.onHand, kind: "quantity" },
          { key: "reserved", label: s.reserved, kind: "quantity", hideBelow: "lg" },
          { key: "available", label: s.available, kind: "quantity" },
          { key: "damaged", label: s.damaged, kind: "quantity", hideBelow: "lg" },
          { key: "minimum", label: s.minimum, kind: "quantity", hideBelow: "xl" },
          ...(can(ctx, "costs.view") ? [
            { key: "cost", label: s.unitCost, kind: "money" as const, hideBelow: "lg" as const },
            { key: "value", label: s.value, kind: "money" as const, total: true },
          ] : []),
        ]}
        searchKeys={["name", "sku", "barcode", "category", "brand"]}
        toolbar={
          <>
            <UrlSelect param="warehouse" label={s.allWarehouses} options={warehouses.map((w) => ({ value: w.id, label: local(w.nameEn, w.nameUr) }))} />
            <UrlSelect param="category" label={s.allStock} options={categories.map((c) => ({ value: c.id, label: local(c.name_en, c.name_ur) }))} />
          </>
        }
        empty={{ title: t.reports.empty, description: t.reports.emptyHint }}
      />
    </>
  );
}
