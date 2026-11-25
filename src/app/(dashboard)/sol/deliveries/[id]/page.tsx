import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, MessageCircle, Pencil, Phone, Truck } from "lucide-react";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { loadDriverList } from "@/features/fleet/queries";
import { cancelSolDeliveryAction, dispatchSolAction } from "@/features/sol/actions";
import { itemName, loadSolDelivery } from "@/features/sol/queries";
import { solDeliveryOptions } from "@/features/sol/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { phoneHref, whatsappHref } from "@/lib/utils/phone";
import { DocumentLink } from "@/components/documents/document-link";
import { ActionButton } from "@/components/documents/action-button";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate, formatDateTime, formatNumber } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { SpecTable } from "@/components/tables/spec-table";
import { ArrivalForm, ReturnForm } from "./arrival-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sol.delivery };
}

const plain = (n: number) => n.toFixed(2).replace(/\.?0+$/, "") || "0";

export default async function SolDeliveryPage({ params }: PageProps<"/sol/deliveries/[id]">) {
  const { id, ctx, t, locale, local } = await pageContext(params);
  if (!can(ctx, "sol.view")) return <Forbidden />;
  const delivery = await loadSolDelivery(id);
  if (!delivery) notFound();
  const [drivers, warehouses] = await Promise.all([loadDriverList(), loadWarehouseChoices()]);
  const s = t.sol;
  const driver = drivers.find((x) => x.id === delivery.driver_id);
  const status = solDeliveryOptions(t)[delivery.status];
  const dispatcher = can(ctx, "sol.dispatch");
  const planned = delivery.status === "draft";
  const planner = dispatcher || can(ctx, "sol.manage");
  // The assigned driver confirms too; the database verifies who that is.
  const own = driver !== undefined && ctx.employeeId !== null && driver.employeeId === ctx.employeeId;
  const client = delivery.job?.customer;
  const tel = phoneHref(delivery.job?.contact_phone ?? client?.phone ?? null);
  const chat = whatsappHref(client?.whatsapp ?? null);
  const lines = delivery.items.map((l) => ({
    id: l.id, name: itemName(local, l.item), detail: l.item.product?.sku ?? (l.item.kind === "other" ? null : l.item.description), product: l.item.kind === "product",
    unit: l.item.unit ? local(l.item.unit.name_en, l.item.unit.name_ur) : l.item.service?.unit_label ? local(l.item.service.unit_label, l.item.service.unit_label_ur) : null,
    quantity: l.quantity, returned: l.returned_quantity, max: plain(l.quantity - l.returned_quantity),
  }));
  const left = lines.filter((l) => Number(l.max) > 0);
  const km = (v: number | null) => v === null ? null : <Ltr>{formatNumber(v, locale)}</Ltr>;
  return (
    <>
      <PageHeader
        title={delivery.doc_no}
        breadcrumbs={[{ label: s.tabs.deliveries, href: "/sol/deliveries" }]}
        description={<span className="flex flex-wrap items-center gap-3">{status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}<bdi>{client && local(client.name, client.name_ur)}</bdi></span>}
        actions={
          <>
            <DocumentLink kind="sol_challan" params={{ id }} label={t.docs.pdf} />
            {planned && planner && (
              <>
                <ActionButton label={s.cancelDelivery} icon={<Ban aria-hidden />} variant="outline" action={cancelSolDeliveryAction.bind(null, id)} success={s.deliveryCancelled} confirm={{ title: s.cancelDeliveryTitle, description: s.cancelDeliveryHint, tone: "danger" }} />
                <LinkButton variant="outline" href={`/sol/deliveries/${id}/edit`}><Pencil aria-hidden />{s.editDelivery}</LinkButton>
              </>
            )}
            {planned && dispatcher && <ActionButton label={s.dispatch} icon={<Truck aria-hidden />} action={dispatchSolAction.bind(null, id)} success={s.dispatched} confirm={{ title: s.dispatchTitle, description: s.dispatchHint }} />}
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <SectionCard
          title={s.delivery}
          action={(tel || chat) && (
            <span className="flex flex-wrap gap-3 print:hidden">
              {tel && <a href={tel} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Phone className="size-4" aria-hidden />{t.customers.call}</a>}
              {chat && <a href={chat} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><MessageCircle className="size-4" aria-hidden />{t.customers.message}</a>}
            </span>
          )}
        >
          <DescriptionList items={[
            { label: s.job, value: delivery.job && <Link href={`/sol/jobs/${delivery.job.id}`} className="text-primary hover:underline"><Ltr>{delivery.job.doc_no}</Ltr></Link> },
            { label: s.client, value: client && local(client.name, client.name_ur) },
            { label: s.destination, value: delivery.destination },
            { label: s.contact, value: delivery.job && [delivery.job.contact_name, delivery.job.contact_phone].some(Boolean) ? <>{delivery.job.contact_name} {delivery.job.contact_phone && <Ltr>{delivery.job.contact_phone}</Ltr>}</> : null },
            { label: s.vehicle, value: delivery.vehicle && (can(ctx, "vehicles.view") ? <Link href={`/vehicles/${delivery.vehicle.id}`} className="text-primary hover:underline"><Ltr>{delivery.vehicle.registration_no}</Ltr></Link> : <Ltr>{delivery.vehicle.registration_no}</Ltr>) },
            { label: s.driver, value: driver && <>{local(driver.nameEn, driver.nameUr)} {driver.phone && <Ltr className="text-muted-foreground">{driver.phone}</Ltr>}</> },
            { label: s.deliveryDate, value: formatDate(delivery.delivery_date, locale) },
            { label: s.fromWarehouse, value: delivery.warehouse && local(delivery.warehouse.name_en, delivery.warehouse.name_ur) },
            { label: s.dispatchedAt, value: delivery.dispatched_at && formatDateTime(delivery.dispatched_at, locale) },
            { label: s.deliveredAt, value: delivery.delivered_at && formatDateTime(delivery.delivered_at, locale) },
            ...(delivery.odometer_start !== null ? [{ label: s.odometerStart, value: km(delivery.odometer_start) }] : []),
            ...(delivery.odometer_end !== null ? [{ label: s.odometerEnd, value: km(delivery.odometer_end) }] : []),
            ...(delivery.odometer_start !== null && delivery.odometer_end !== null ? [{ label: s.distance, value: km(delivery.odometer_end - delivery.odometer_start) }] : []),
            { label: s.receivedBy, value: delivery.received_by },
            ...(delivery.journal ? [{ label: t.documents.journal, value: <Ltr>{delivery.journal.doc_no}</Ltr> }] : []),
            { label: s.deliveryNote, value: delivery.delivery_note ?? delivery.notes },
          ]} />
        </SectionCard>
        {lines.length > 0 && (
          <SpecTable
            caption={s.items}
            rows={lines.map((l) => ({ id: l.id, name: l.name, detail: l.detail, unit: l.unit, quantity: l.quantity, returned: l.returned, kept: l.quantity - l.returned }))}
            columns={[
              { key: "name", sub: "detail", label: s.itemDescription, kind: "text", primary: true }, { key: "unit", label: t.documents.unit, kind: "text" }, { key: "quantity", label: planned ? s.send : s.sent, kind: "decimal" },
              ...(planned ? [] : [{ key: "returned", label: s.returnedQty, kind: "decimal" as const }, { key: "kept", label: s.delivered, kind: "decimal" as const }]),
            ]}
            empty={{ title: s.noItems }}
          />
        )}
        {delivery.sol_returns.length > 0 && (
          <section className="grid gap-3">
            <h2 className="text-base font-semibold text-navy">{s.returns}</h2>
            <SpecTable
              caption={s.returns}
              rows={delivery.sol_returns.map((r) => ({ id: r.id, no: r.doc_no, date: r.return_date, reason: r.reason, warehouse: r.warehouse ? local(r.warehouse.name_en, r.warehouse.name_ur) : null }))}
              columns={[{ key: "no", label: t.documents.number, kind: "code", primary: true }, { key: "date", label: t.documents.date, kind: "date" }, { key: "reason", label: t.documents.reason, kind: "text" }, { key: "warehouse", label: t.documents.warehouse, kind: "text" }]}
              empty={{ title: s.returns }}
            />
          </section>
        )}
        <p className="hidden pt-16 text-sm print:block">{t.sales.signature}: ______________________________</p>
        {delivery.status === "dispatched" && (dispatcher || own) && (
          <div className="print:hidden"><ArrivalForm deliveryId={id} lines={left} warehouses={warehouses} warehouseId={delivery.warehouse_id ?? ""} odometerStart={delivery.odometer_start} hasVehicle={delivery.vehicle_id !== null} canReturn={dispatcher} /></div>
        )}
        {delivery.status === "delivered" && dispatcher && left.length > 0 && (
          <details className="print:hidden">
            <summary className="cursor-pointer text-sm font-medium text-primary">{s.returnGoods}</summary>
            <div className="mt-4"><ReturnForm key={left.map((l) => l.max).join()} deliveryId={id} lines={left} warehouses={warehouses} warehouseId={delivery.warehouse_id ?? ""} /></div>
          </details>
        )}
      </div>
    </>
  );
}
