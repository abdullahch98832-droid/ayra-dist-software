import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadProductOptions } from "@/features/catalog/product-options";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { flowOf, flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadFlowSuppliers, loadOrder, loadReceipt } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { ReceiptForm } from "../../receipt-form";

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/receipts/[id]/edit">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.documents.edit };
}

const blankZero = (n: number | null) => (n ? String(n) : "");

export default async function EditReceiptPage({ params }: PageProps<"/purchasing/[flow]/receipts/[id]/edit">) {
  const { flow, id, ctx, t } = await purchasingPage(params);
  if (!can(ctx, "purchasing.create")) return <Forbidden />;
  const receipt = await loadReceipt(id);
  if (!receipt || receipt.status !== "draft" || flowOf(receipt.supplier.is_principal) !== flow) notFound();
  const [suppliers, warehouses, products, order] = await Promise.all([
    loadFlowSuppliers(flow), loadWarehouseChoices(), loadProductOptions(ctx, receipt.goods_receipt_items.map((l) => l.product_id)),
    receipt.purchase_order_id ? loadOrder(receipt.purchase_order_id) : null,
  ]);
  return (
    <>
      <PageHeader title={`${t.documents.edit} ${receipt.doc_no}`} breadcrumbs={[{ label: t.purchasing.tabs.receipts, href: flowPath(flow, "receipts") }]} />
      <ReceiptForm
        flow={flow} receiptId={id} order={receipt.order ? { id: receipt.order.id, docNo: receipt.order.doc_no } : null} suppliers={suppliers} warehouses={warehouses} products={products}
        orderLines={(order?.purchase_order_items ?? []).map((l) => ({
          orderItemId: l.id, factor: l.factor, price: toDbAmount(toPaisa(l.unit_price)), remainingBase: order?.progress.get(l.id)?.remaining_base ?? 0,
        }))}
        defaults={{
          supplierId: receipt.supplier_id, orderId: receipt.purchase_order_id ?? "", warehouseId: receipt.warehouse_id, damagedWarehouseId: receipt.damaged_warehouse_id ?? "",
          date: receipt.receipt_date, reference: receipt.supplier_reference ?? "", notes: receipt.notes ?? "", requestId: crypto.randomUUID(),
          lines: receipt.goods_receipt_items.map((l) => ({
            productId: l.product_id, unitId: l.unit_id, orderItemId: l.purchase_order_item_id ?? "", expected: blankZero(l.expected_quantity), accepted: blankZero(l.quantity),
            damaged: blankZero(l.damaged_quantity), rejected: blankZero(l.rejected_quantity), cost: toDbAmount(toPaisa(l.unit_cost)), notes: l.notes ?? "",
          })),
        }}
      />
    </>
  );
}
