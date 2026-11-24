import type { Metadata } from "next";
import { loadCategories } from "@/features/inventory/queries";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { reportSalesByProduct } from "@/features/reports/queries";
import { getT } from "@/i18n/server";
import { uuidParam } from "@/lib/page-context";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.productSales };
}

export default async function ProductSalesPage({ searchParams }: PageProps<"/reports/product-sales">) {
  const { t, query, today, period, allowed, local } = await reportPage(REPORTS.productSales, searchParams);
  if (!allowed) return <Forbidden />;
  const r = t.reports;
  const [rows, categories] = await Promise.all([reportSalesByProduct(period, uuidParam(query.category)), loadCategories()]);
  return (
    <>
      <PageHeader title={r.productSales} breadcrumbs={[{ label: r.title, href: "/reports" }]} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={r.productSales} description={r.productSalesHint}>
        <SpecTable
          caption={r.productSales}
          exportName={`product-sales-${period.from}-${period.to}`}
          rows={rows.map((x) => ({
            id: x.product_id, name: local(x.name_en, x.name_ur), sku: x.sku, unit: local(x.unit_en, x.unit_ur), category: x.category_en ? local(x.category_en, x.category_ur) : null, quantity: x.quantity, gross: x.gross,
            discounts: x.discounts, net: x.net, returned: x.returned_quantity, returns: x.returns, netQuantity: x.net_quantity, sales: x.net_sales,
          }))}
          columns={[
            { key: "name", sub: "sku", label: t.documents.product, kind: "text", primary: true },
            { key: "category", label: t.catalog.category, kind: "text", hideBelow: "2xl" },
            { key: "unit", label: t.documents.unit, kind: "text", hideBelow: "lg" },
            { key: "quantity", label: r.soldQuantity, kind: "quantity" },
            { key: "returned", label: r.returnedQuantity, kind: "quantity", hideBelow: "lg" },
            { key: "netQuantity", label: r.netQuantity, kind: "quantity", hideBelow: "xl" },
            { key: "gross", label: r.gross, kind: "money", hideBelow: "xl", total: true },
            { key: "discounts", label: r.discounts, kind: "money", hideBelow: "xl", total: true },
            { key: "returns", label: r.returns, kind: "money", hideBelow: "lg", total: true },
            { key: "sales", label: r.netSales, kind: "money", total: true },
          ]}
          searchKeys={["name", "sku", "category"]}
          toolbar={categories.length > 0 && <UrlSelect param="category" label={t.stock.allStock} options={categories.map((c) => ({ value: c.id, label: local(c.name_en, c.name_ur) }))} />}
          empty={{ title: r.empty, description: r.emptyHint }}
        />
      </PeriodFrame>
    </>
  );
}
