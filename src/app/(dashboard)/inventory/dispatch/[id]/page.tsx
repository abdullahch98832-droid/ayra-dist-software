import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PackageOpen, Printer } from "lucide-react";
import { businessToday } from "@/features/dashboard/period";
import { inventoryPage } from "@/features/inventory/page-context";
import { loadDispatchOrder, loadVehiclesAndDrivers } from "@/features/inventory/queries";
import { startPickingAction } from "@/features/sales/actions";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { ActionButton } from "@/components/documents/action-button";
import { PrintButton } from "@/components/documents/print-button";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";
import { SpecTable } from "@/components/tables/spec-table";
import { DispatchForm } from "./dispatch-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).stock.dispatchOrder };
}

const OPEN = ["approved", "picking", "partially_dispatched"];

export default async function DispatchOrderPage({ params }: PageProps<"/inventory/dispatch/[id]">) {
  const { id, ctx, t, locale, local } = await inventoryPage(params);
  if (!can(ctx, "sales.dispatch")) return <Forbidden />;
  const [order, choices] = await Promise.all([loadDispatchOrder(id), loadVehiclesAndDrivers(ctx)]);
  if (!order || !OPEN.includes(order.status)) notFound();
  const s = t.sales;
  // Dispatched quantities are always whole order units: dispatch_delivery() posts them that way.
  const lines = order.sales_order_items.map((l) => {
    const dispatched = Math.floor(l.dispatched_base_quantity / l.factor);
    return { itemId: l.id, name: local(l.product.name_en, l.product.name_ur), sku: l.product.sku, unit: local(l.unit.name_en, l.unit.name_ur), ordered: l.quantity, dispatched, remaining: l.quantity - dispatched };
  }).filter((l) => l.remaining > 0);
  const approved = order.status === "approved";
  return (
    <>
      <PageHeader
        title={`${approved ? s.pickList : t.stock.dispatchNow} ${order.doc_no}`}
        description={<span><bdi>{order.customer && local(order.customer.name, order.customer.name_ur)}</bdi> · <bdi>{local(order.warehouse.name_en, order.warehouse.name_ur)}</bdi></span>}
        breadcrumbs={[{ label: t.stock.tabs.dispatch, href: "/inventory/dispatch" }]}
        actions={
          <>
            <LinkButton variant="outline" href={`/sales/orders/${id}`}>{s.order}</LinkButton>
            <PrintButton label={s.pickList} icon={<Printer aria-hidden />} />
            {approved && <ActionButton label={s.startPicking} icon={<PackageOpen aria-hidden />} action={startPickingAction.bind(null, id)} success={s.pickingStarted} />}
          </>
        }
      />
      <div className="grid gap-6">
        <SectionCard title={s.order}>
          <DescriptionList items={[
            { label: t.customers.address, value: order.customer && [order.customer.address, order.customer.city].filter(Boolean).join(", ") },
            { label: t.customers.phone, value: order.customer?.phone && <Ltr>{order.customer.phone}</Ltr> },
            { label: s.deliveryDate, value: formatDate(order.required_date, locale) },
            { label: t.documents.notes, value: order.notes },
          ]} />
        </SectionCard>
        <div className={approved ? "" : "hidden print:block"}>
          <SpecTable
            caption={s.pickList}
            rows={lines.map((l) => ({ id: l.itemId, product: l.name, sku: l.sku, unit: l.unit, quantity: l.remaining }))}
            columns={[{ key: "product", sub: "sku", label: t.documents.product, kind: "text", primary: true }, { key: "unit", label: t.documents.unit, kind: "text" }, { key: "quantity", label: t.documents.quantity, kind: "quantity" }]}
            empty={{ title: t.documents.noLines }}
          />
        </div>
        {!approved && (
          <div className="print:hidden">
            <DispatchForm
              lines={lines} {...choices}
              defaults={{ orderId: id, date: businessToday(), vehicleId: "", driverId: "", suppliedBy: "", notes: "", requestId: crypto.randomUUID(), lines: lines.map((l) => ({ itemId: l.itemId, quantity: String(l.remaining) })) }}
            />
          </div>
        )}
      </div>
    </>
  );
}
