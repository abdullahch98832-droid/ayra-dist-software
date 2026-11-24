import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadProductOptions } from "@/features/catalog/product-options";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { flowOf, flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadFlowSuppliers, loadOrder } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { OrderForm } from "../../order-form";

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/orders/[id]/edit">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.documents.edit };
}

export default async function EditOrderPage({ params }: PageProps<"/purchasing/[flow]/orders/[id]/edit">) {
  const { flow, id, ctx, t } = await purchasingPage(params);
  if (!can(ctx, "purchasing.create")) return <Forbidden />;
  const order = await loadOrder(id);
  if (!order || order.status !== "draft" || flowOf(order.supplier.is_principal) !== flow) notFound();
  const [suppliers, warehouses, products] = await Promise.all([
    loadFlowSuppliers(flow), loadWarehouseChoices(), loadProductOptions(ctx, order.purchase_order_items.map((l) => l.product_id)),
  ]);
  return (
    <>
      <PageHeader title={`${t.documents.edit} ${order.doc_no}`} breadcrumbs={[{ label: t.purchasing.tabs.orders, href: flowPath(flow, "orders") }]} />
      <OrderForm
        flow={flow} orderId={id} suppliers={suppliers} warehouses={warehouses} products={products}
        defaults={{
          supplierId: order.supplier_id, warehouseId: order.warehouse_id, date: order.order_date, expectedDate: order.expected_date ?? "", notes: order.notes ?? "", requestId: crypto.randomUUID(),
          lines: order.purchase_order_items.map((l) => ({ productId: l.product_id, unitId: l.unit_id, quantity: String(l.quantity), price: toDbAmount(toPaisa(l.unit_price)) })),
        }}
      />
    </>
  );
}
