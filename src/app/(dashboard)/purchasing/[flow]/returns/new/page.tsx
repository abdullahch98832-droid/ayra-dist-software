import type { Metadata } from "next";
import { z } from "zod";
import { loadProductOptions } from "@/features/catalog/product-options";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { businessToday } from "@/features/dashboard/period";
import { flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadFlowSuppliers } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { ReturnForm } from "../return-form";

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/returns/new">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.purchasing.newReturn };
}

export default async function NewReturnPage({ params, searchParams }: PageProps<"/purchasing/[flow]/returns/new">) {
  const { flow, ctx, t } = await purchasingPage(params);
  if (!can(ctx, "purchasing.create")) return <Forbidden />;
  const query = await searchParams;
  const product = z.uuid().safeParse(query.product);
  const [suppliers, warehouses, products] = await Promise.all([
    loadFlowSuppliers(flow), loadWarehouseChoices(), product.success ? loadProductOptions(ctx, [product.data]) : [],
  ]);
  return (
    <>
      <PageHeader title={t.purchasing.newReturn} description={t.purchasing.flows[flow]} breadcrumbs={[{ label: t.purchasing.tabs.returns, href: flowPath(flow, "returns") }]} />
      <ReturnForm
        flow={flow} returnId={null} suppliers={suppliers} warehouses={warehouses} products={products}
        defaults={{
          supplierId: suppliers.find((s) => s.id === query.supplier)?.id ?? (suppliers.length === 1 ? suppliers[0]?.id ?? "" : ""),
          warehouseId: warehouses.find((w) => w.id === query.warehouse)?.id ?? "", date: businessToday(), reason: "", requestId: crypto.randomUUID(),
          lines: products.map((x) => ({ productId: x.id, unitId: x.baseUnitId, quantity: "", price: x.units.find((u) => u.unitId === x.baseUnitId)?.purchasePrice ?? "" })),
        }}
      />
    </>
  );
}
