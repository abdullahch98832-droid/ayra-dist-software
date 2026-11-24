import type { Metadata } from "next";
import { loadProductOptions } from "@/features/catalog/product-options";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { businessToday } from "@/features/dashboard/period";
import { inventoryPage, uuidParam } from "@/features/inventory/page-context";
import { ADJUSTMENT_KINDS } from "@/features/inventory/schema";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { AdjustmentForm } from "../adjustment-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).stock.newAdjustment };
}

export default async function NewAdjustmentPage({ searchParams }: PageProps<"/inventory/adjustments/new">) {
  const { ctx, t } = await inventoryPage();
  if (!can(ctx, "inventory.adjust")) return <Forbidden />;
  const query = await searchParams;
  const productId = uuidParam(query.product);
  const kind = ADJUSTMENT_KINDS.find((k) => k === query.kind) ?? "other";
  const [warehouses, products] = await Promise.all([loadWarehouseChoices(), productId ? loadProductOptions(ctx, [productId]) : []]);
  const normal = warehouses.filter((w) => w.type === "main");
  return (
    <>
      <PageHeader title={kind === "opening" ? t.stock.newOpening : kind === "write_off" ? t.stock.writeOff : t.stock.newAdjustment} breadcrumbs={[{ label: t.stock.tabs.adjustments, href: "/inventory/adjustments" }]} />
      <AdjustmentForm
        adjustmentId={null} warehouses={warehouses} products={products} costs={can(ctx, "costs.view")}
        defaults={{
          warehouseId: warehouses.find((w) => w.id === query.warehouse)?.id ?? (normal.length === 1 ? normal[0]?.id ?? "" : ""), date: businessToday(), kind, reason: "", requestId: crypto.randomUUID(),
          lines: products.map((p) => ({ productId: p.id, unitId: p.baseUnitId, quantity: "", cost: "", notes: "" })),
        }}
      />
    </>
  );
}
