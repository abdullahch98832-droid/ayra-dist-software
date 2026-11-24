import type { Metadata } from "next";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { businessToday } from "@/features/dashboard/period";
import { flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadFlowSuppliers } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { OrderForm } from "../order-form";

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/orders/new">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.purchasing.newOrder };
}

export default async function NewOrderPage({ params }: PageProps<"/purchasing/[flow]/orders/new">) {
  const { flow, ctx, t } = await purchasingPage(params);
  if (!can(ctx, "purchasing.create")) return <Forbidden />;
  const [suppliers, warehouses] = await Promise.all([loadFlowSuppliers(flow), loadWarehouseChoices()]);
  const normal = warehouses.filter((w) => w.type === "main");
  return (
    <>
      <PageHeader title={t.purchasing.newOrder} description={t.purchasing.flows[flow]} breadcrumbs={[{ label: t.purchasing.tabs.orders, href: flowPath(flow, "orders") }]} />
      <OrderForm
        flow={flow} orderId={null} suppliers={suppliers} warehouses={warehouses} products={[]}
        defaults={{
          supplierId: suppliers.length === 1 ? suppliers[0]?.id ?? "" : "", warehouseId: normal.length === 1 ? normal[0]?.id ?? "" : "",
          date: businessToday(), expectedDate: "", notes: "", requestId: crypto.randomUUID(), lines: [],
        }}
      />
    </>
  );
}
