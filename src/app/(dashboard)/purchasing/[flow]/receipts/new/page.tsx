import type { Metadata } from "next";
import { z } from "zod";
import { loadProductOptions } from "@/features/catalog/product-options";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { businessToday } from "@/features/dashboard/period";
import { flowOf, flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadFlowSuppliers, loadOpenOrders, loadOrder } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { convertPrice } from "@/lib/utils/quantity";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { UrlSelect } from "@/components/tables/url-filters";
import { ReceiptForm } from "../receipt-form";

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/receipts/new">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.purchasing.newReceipt };
}

const OPEN = ["approved", "partially_received"];

export default async function NewReceiptPage({ params, searchParams }: PageProps<"/purchasing/[flow]/receipts/new">) {
  const { flow, ctx, t, local } = await purchasingPage(params);
  if (!can(ctx, "purchasing.create")) return <Forbidden />;
  const requested = z.uuid().safeParse((await searchParams).order);
  const [suppliers, warehouses, orders, found] = await Promise.all([
    loadFlowSuppliers(flow), loadWarehouseChoices(), loadOpenOrders(flow), requested.success ? loadOrder(requested.data) : null,
  ]);
  const order = found && OPEN.includes(found.status) && flowOf(found.supplier.is_principal) === flow ? found : null;
  const products = order ? await loadProductOptions(ctx, order.purchase_order_items.map((l) => l.product_id)) : [];
  const normal = warehouses.filter((w) => w.type === "main");
  const damaged = warehouses.filter((w) => w.type === "damaged");
  const remaining = (id: string) => order?.progress.get(id)?.remaining_base ?? 0;
  const due = (order?.purchase_order_items ?? []).filter((l) => remaining(l.id) > 0);

  return (
    <>
      <PageHeader title={t.purchasing.newReceipt} description={t.purchasing.flows[flow]} breadcrumbs={[{ label: t.purchasing.tabs.receipts, href: flowPath(flow, "receipts") }]} />
      <div className="grid gap-6">
        {orders.length > 0 && (
          <SectionCard title={t.purchasing.againstOrder}>
            <UrlSelect
              param="order" label={t.purchasing.withoutOrder} className="sm:w-96"
              options={orders.map((o) => ({ value: o.id, label: `${o.doc_no} · ${local(o.supplier.name, o.supplier.name_ur)}` }))}
            />
          </SectionCard>
        )}
        <ReceiptForm
          key={order?.id ?? "none"}
          flow={flow} receiptId={null} order={order ? { id: order.id, docNo: order.doc_no } : null} suppliers={suppliers} warehouses={warehouses} products={products}
          orderLines={due.map((l) => ({ orderItemId: l.id, factor: l.factor, price: toDbAmount(toPaisa(l.unit_price)), remainingBase: remaining(l.id) }))}
          defaults={{
            supplierId: order?.supplier_id ?? (suppliers.length === 1 ? suppliers[0]?.id ?? "" : ""), orderId: order?.id ?? "",
            warehouseId: order?.warehouse_id ?? (normal.length === 1 ? normal[0]?.id ?? "" : ""), damagedWarehouseId: damaged.length === 1 ? damaged[0]?.id ?? "" : "",
            date: businessToday(), reference: "", notes: "", requestId: crypto.randomUUID(),
            lines: due.map((l) => {
              // Show what is due in the ordered unit; when a part unit is due, in base units.
              const left = remaining(l.id);
              const whole = left % l.factor === 0;
              const base = products.find((x) => x.id === l.product_id)?.baseUnitId ?? l.unit_id;
              const price = toPaisa(l.unit_price);
              return {
                productId: l.product_id, unitId: whole ? l.unit_id : base, orderItemId: l.id, expected: "", damaged: "", rejected: "", notes: "",
                accepted: String(whole ? left / l.factor : left),
                cost: toDbAmount(whole ? price : convertPrice(price, BigInt(l.factor), BigInt(1))),
              };
            }),
          }}
        />
      </div>
    </>
  );
}
