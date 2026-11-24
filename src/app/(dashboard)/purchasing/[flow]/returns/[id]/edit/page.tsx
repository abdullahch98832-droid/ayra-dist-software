import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadProductOptions } from "@/features/catalog/product-options";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { flowOf, flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadFlowSuppliers, loadReturn } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { ReturnForm } from "../../return-form";

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/returns/[id]/edit">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.documents.edit };
}

export default async function EditReturnPage({ params }: PageProps<"/purchasing/[flow]/returns/[id]/edit">) {
  const { flow, id, ctx, t } = await purchasingPage(params);
  if (!can(ctx, "purchasing.create")) return <Forbidden />;
  const doc = await loadReturn(id);
  if (!doc || doc.status !== "draft" || flowOf(doc.supplier.is_principal) !== flow) notFound();
  const [suppliers, warehouses, products] = await Promise.all([
    loadFlowSuppliers(flow), loadWarehouseChoices(), loadProductOptions(ctx, doc.supplier_return_items.map((l) => l.product_id)),
  ]);
  return (
    <>
      <PageHeader title={`${t.documents.edit} ${doc.doc_no}`} breadcrumbs={[{ label: t.purchasing.tabs.returns, href: flowPath(flow, "returns") }]} />
      <ReturnForm
        flow={flow} returnId={id} suppliers={suppliers} warehouses={warehouses} products={products}
        defaults={{
          supplierId: doc.supplier_id, warehouseId: doc.warehouse_id, date: doc.return_date, reason: doc.reason ?? "", requestId: crypto.randomUUID(),
          lines: doc.supplier_return_items.map((l) => ({ productId: l.product_id, unitId: l.unit_id, quantity: String(l.quantity), price: toDbAmount(toPaisa(l.unit_price)) })),
        }}
      />
    </>
  );
}
