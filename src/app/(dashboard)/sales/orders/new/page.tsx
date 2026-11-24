import type { Metadata } from "next";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { loadCustomerOption } from "@/features/customers/queries";
import { businessToday } from "@/features/dashboard/period";
import { loadTakers } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext, uuidParam } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { OrderForm } from "../order-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sales.newOrder };
}

export default async function NewOrderPage({ searchParams }: PageProps<"/sales/orders/new">) {
  const { ctx, t } = await pageContext();
  if (!can(ctx, "sales.create")) return <Forbidden />;
  const fixedTaker = !can(ctx, "sales.view_all");
  const [customer, warehouses, takers] = await Promise.all([loadCustomerOption(uuidParam((await searchParams).customer)), loadWarehouseChoices(), loadTakers()]);
  const active = takers.filter((x) => x.isActive);
  const normal = warehouses.filter((w) => w.type === "main");
  return (
    <>
      <PageHeader title={t.sales.newOrder} breadcrumbs={[{ label: t.sales.tabs.orders, href: "/sales/orders" }]} />
      <OrderForm
        orderId={null} customer={customer} warehouses={warehouses} products={[]} takers={active} fixedTaker={fixedTaker}
        defaults={{
          customerId: customer?.id ?? "", orderTakerId: fixedTaker ? ctx.employeeId ?? "" : active.find((x) => x.id === customer?.orderTakerId)?.id ?? "",
          warehouseId: normal.length === 1 ? normal[0]?.id ?? "" : "", date: businessToday(), requiredDate: "", notes: "", requestId: crypto.randomUUID(), lines: [],
        }}
      />
    </>
  );
}
