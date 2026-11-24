import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadProductOptions } from "@/features/catalog/product-options";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { loadCustomerOption } from "@/features/customers/queries";
import { loadOrder } from "@/features/sales/queries";
import { canEditOrder } from "@/features/sales/access";
import { loadTakers } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { OrderForm } from "../../order-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sales.editOrder };
}

export default async function EditOrderPage({ params }: PageProps<"/sales/orders/[id]/edit">) {
  const { id, ctx, t } = await pageContext(params);
  const order = await loadOrder(id);
  if (!order) notFound();
  if (!canEditOrder(ctx, order)) return <Forbidden />;
  const [customer, warehouses, takers, products] = await Promise.all([
    loadCustomerOption(order.customer_id), loadWarehouseChoices(), loadTakers(), loadProductOptions(ctx, order.sales_order_items.map((l) => l.product_id)),
  ]);
  return (
    <>
      <PageHeader title={`${t.sales.editOrder} ${order.doc_no}`} breadcrumbs={[{ label: t.sales.tabs.orders, href: "/sales/orders" }]} />
      <OrderForm
        orderId={id} customer={customer} warehouses={warehouses} products={products} takers={takers.filter((x) => x.isActive || x.id === order.order_taker_id)} fixedTaker={!can(ctx, "sales.view_all")}
        defaults={{
          customerId: order.customer_id, orderTakerId: order.order_taker_id ?? "", warehouseId: order.warehouse_id, date: order.order_date, requiredDate: order.required_date ?? "", notes: order.notes ?? "",
          requestId: crypto.randomUUID(),
          lines: order.sales_order_items.map((l) => ({
            productId: l.product_id, unitId: l.unit_id, quantity: String(l.quantity), price: toDbAmount(toPaisa(l.unit_price)), discount: l.discount_amount ? toDbAmount(toPaisa(l.discount_amount)) : "",
          })),
        }}
      />
    </>
  );
}
