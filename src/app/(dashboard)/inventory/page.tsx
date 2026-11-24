import type { Metadata } from "next";
import { Boxes, CircleCheck, PackageMinus, Scale, TriangleAlert, Wallet } from "lucide-react";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { inventoryPage, uuidParam } from "@/features/inventory/page-context";
import { countNegative, loadCategories, loadOverrideOn, loadReconciliation, loadStock } from "@/features/inventory/queries";
import { fill, isolate } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { formatNumber } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { StatCard } from "@/components/shared/stat-card";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).stock.title };
}

export default async function StockPage({ searchParams }: PageProps<"/inventory">) {
  const { ctx, t, locale, local } = await inventoryPage();
  if (!can(ctx, "inventory.view")) return <Forbidden />;
  const s = t.stock;
  const query = await searchParams;
  const warehouseId = uuidParam(query.warehouse);
  const categoryId = uuidParam(query.category);
  const [rows, negative, reconciliation, overrideOn, warehouses, categories] = await Promise.all([
    loadStock(warehouseId, categoryId), countNegative(warehouseId), loadReconciliation(ctx), loadOverrideOn(), loadWarehouseChoices(), loadCategories(),
  ]);
  const costs = can(ctx, "costs.view");
  const filtered = !!warehouseId || !!categoryId;
  const below = rows.filter((r) => r.reorder_level > 0 && r.available <= r.reorder_level).length;
  const agrees = reconciliation && toPaisa(reconciliation.difference) === BigInt(0) && reconciliation.quantity_mismatches === 0;
  const money = (v: string) => isolate(formatPaisa(toPaisa(v), locale));

  return (
    <>
      <PageHeader
        title={s.title}
        description={s.subtitle}
        actions={can(ctx, "inventory.adjust") && rows.every((r) => r.on_hand === 0) && !filtered
          ? <LinkButton href="/inventory/adjustments/new?kind=opening">{s.newOpening}</LinkButton> : undefined}
      />
      <div className="grid gap-6">
        {overrideOn && <FormAlert tone="info">{s.overrideOn}</FormAlert>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
          <StatCard label={s.productsInStock} value={formatNumber(rows.filter((r) => r.on_hand > 0).length, locale)} icon={Boxes} />
          <StatCard label={s.belowMinimum} value={formatNumber(below, locale)} icon={PackageMinus} tone={below ? "attention" : "default"} href={can(ctx, "reports.view") ? "/reports/low-stock" : undefined} />
          {(negative > 0 || overrideOn) && <StatCard label={s.negative} value={formatNumber(negative, locale)} icon={TriangleAlert} tone={negative ? "attention" : "default"} hint={s.negativeHint} />}
          {reconciliation && (
            <>
              <StatCard label={s.totalValue} value={<Ltr>{formatPaisa(toPaisa(reconciliation.valuation), locale)}</Ltr>} icon={Wallet} hint={s.totalValueHint} />
              <StatCard
                label={s.ledgerValue} value={<Ltr>{formatPaisa(toPaisa(reconciliation.ledger), locale)}</Ltr>} icon={agrees ? CircleCheck : Scale} tone={agrees ? "default" : "attention"}
                hint={agrees ? s.agrees : toPaisa(reconciliation.difference) !== BigInt(0)
                  ? fill(s.disagrees, { amount: money(reconciliation.difference) })
                  : fill(s.quantityMismatch, { count: formatNumber(reconciliation.quantity_mismatches, locale) })}
              />
            </>
          )}
        </div>
        <SpecTable
          caption={s.tabs.stock}
          rows={rows.map((r) => ({
            id: r.product_id, name: local(r.name_en, r.name_ur), nameHref: `/inventory/movements?product=${r.product_id}`, sku: r.sku, barcode: r.barcode, category: local(r.category_en ?? "", r.category_ur), unit: local(r.unit_en, r.unit_ur),
            onHand: r.on_hand, reserved: r.reserved, available: r.available, damaged: r.damaged, minimum: r.reorder_level, cost: r.unit_cost, value: r.stock_value,
          }))}
          columns={[
            { key: "name", sub: "sku", label: t.documents.product, kind: "link", primary: true },
            { key: "category", label: t.catalog.category, kind: "text", hideBelow: "xl" },
            { key: "unit", label: t.documents.unit, kind: "text", hideBelow: "lg" },
            { key: "onHand", label: s.onHand, kind: "quantity" },
            { key: "reserved", label: s.reserved, kind: "quantity", hideBelow: "lg" },
            { key: "available", label: s.available, kind: "quantity" },
            { key: "damaged", label: s.damaged, kind: "quantity", hideBelow: "lg" },
            { key: "minimum", label: s.minimum, kind: "quantity", hideBelow: "xl" },
            ...(costs ? [
              { key: "cost", label: s.unitCost, kind: "money" as const, hideBelow: "xl" as const },
              { key: "value", label: s.value, kind: "money" as const, total: true },
            ] : []),
          ]}
          searchKeys={["name", "sku", "barcode"]}
          searchPlaceholder={t.documents.searchProduct}
          toolbar={
            <>
              <UrlSelect param="warehouse" label={s.allWarehouses} options={warehouses.map((w) => ({ value: w.id, label: local(w.nameEn, w.nameUr) }))} />
              <UrlSelect param="category" label={s.allStock} options={categories.map((c) => ({ value: c.id, label: local(c.name_en, c.name_ur) }))} />
            </>
          }
          empty={filtered ? { title: s.emptyFiltered } : { title: s.emptyStock, description: s.emptyStockHint }}
        />
      </div>
    </>
  );
}
