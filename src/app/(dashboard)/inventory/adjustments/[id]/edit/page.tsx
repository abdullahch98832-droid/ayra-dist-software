import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadProductOptions } from "@/features/catalog/product-options";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { inventoryPage } from "@/features/inventory/page-context";
import { loadAdjustment } from "@/features/inventory/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { AdjustmentForm } from "../../adjustment-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).documents.edit };
}

export default async function EditAdjustmentPage({ params }: PageProps<"/inventory/adjustments/[id]/edit">) {
  const { id, ctx, t } = await inventoryPage(params);
  if (!can(ctx, "inventory.adjust")) return <Forbidden />;
  const doc = await loadAdjustment(ctx, id);
  if (!doc || doc.status !== "draft" || doc.kind === "count") notFound();
  const kind = doc.kind;
  const [warehouses, products] = await Promise.all([loadWarehouseChoices(), loadProductOptions(ctx, doc.stock_adjustment_items.map((l) => l.product_id))]);
  const cost = (itemId: string) => {
    const value = doc.costs?.get(itemId)?.unit_cost;
    return value === null || value === undefined ? "" : toDbAmount(toPaisa(value));
  };
  return (
    <>
      <PageHeader title={`${t.documents.edit} ${doc.doc_no}`} breadcrumbs={[{ label: t.stock.tabs.adjustments, href: "/inventory/adjustments" }]} />
      <AdjustmentForm
        adjustmentId={id} warehouses={warehouses} products={products} costs={can(ctx, "costs.view")}
        defaults={{
          warehouseId: doc.warehouse_id, date: doc.adjustment_date, kind, reason: doc.reason ?? "", requestId: crypto.randomUUID(),
          // Write-offs are stored negative but typed positive. A user who may not see costs enters them again.
          lines: doc.stock_adjustment_items.map((l) => ({ productId: l.product_id, unitId: l.unit_id, quantity: String(kind === "write_off" ? -l.quantity : l.quantity), cost: cost(l.id), notes: l.notes ?? "" })),
        }}
      />
    </>
  );
}
