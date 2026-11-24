import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Phone, Printer } from "lucide-react";
import { loadDelivery } from "@/features/sales/queries";
import { DELIVERY_TONE, documentOptions } from "@/features/sales/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { phoneHref, whatsappHref } from "@/lib/utils/phone";
import { toPaisa } from "@/lib/utils/money";
import { PrintButton } from "@/components/documents/print-button";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate, formatDateTime } from "@/components/shared/format";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { SpecTable } from "@/components/tables/spec-table";
import { ConfirmForm } from "./confirm-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sales.delivery };
}

export default async function DeliveryPage({ params }: PageProps<"/sales/deliveries/[id]">) {
  const { id, ctx, t, locale, local } = await pageContext(params);
  const delivery = await loadDelivery(id);
  if (!delivery) notFound();
  const s = t.sales;
  const customer = delivery.order?.customer;
  const inTransit = delivery.status === "dispatched";
  // The assigned driver confirms too; the database verifies who that is.
  const mayConfirm = can(ctx, "sales.dispatch") || (delivery.driver_id !== null && !can(ctx, "sales.view_all") && !can(ctx, "sales.create"));
  const tel = phoneHref(customer?.phone ?? null);
  const chat = whatsappHref(customer?.whatsapp ?? null);
  const lines = delivery.delivery_items.map((l) => ({
    itemId: l.id, name: local(l.item.product.name_en, l.item.product.name_ur), sku: l.item.product.sku, unit: local(l.item.unit.name_en, l.item.unit.name_ur), quantity: l.quantity, returned: l.returned_quantity,
  }));
  return (
    <>
      <PageHeader
        title={delivery.doc_no}
        breadcrumbs={[{ label: s.tabs.deliveries, href: "/sales/deliveries" }]}
        description={<span className="flex flex-wrap items-center gap-3"><StatusBadge tone={DELIVERY_TONE[delivery.status] ?? "gray"}>{s.deliveryStatuses[delivery.status]}</StatusBadge><bdi>{customer && local(customer.name, customer.name_ur)}</bdi></span>}
        actions={<PrintButton label={s.print} icon={<Printer aria-hidden />} />}
      />
      <div className="grid gap-6">
        <SectionCard
          title={s.delivery}
          action={(tel || chat) && (
            <span className="flex gap-3 print:hidden">
              {tel && <a href={tel} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Phone className="size-4" aria-hidden />{t.customers.call}</a>}
              {chat && <a href={chat} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><MessageCircle className="size-4" aria-hidden />{t.customers.message}</a>}
            </span>
          )}
        >
          <DescriptionList items={[
            { label: s.customer, value: customer && local(customer.name, customer.name_ur) },
            { label: t.customers.address, value: customer && [customer.address, customer.city].filter(Boolean).join(", ") },
            { label: t.customers.phone, value: customer?.phone && <Ltr>{customer.phone}</Ltr> },
            { label: s.order, value: delivery.order && <Link href={`/sales/orders/${delivery.order.id}`} className="text-primary hover:underline"><Ltr>{delivery.order.doc_no}</Ltr></Link> },
            { label: t.documents.date, value: formatDate(delivery.delivery_date, locale) },
            { label: s.vehicle, value: delivery.vehicle && <Ltr>{delivery.vehicle.registration_no}</Ltr> },
            { label: s.dispatchedAt, value: delivery.dispatched_at && formatDateTime(delivery.dispatched_at, locale) },
            { label: s.deliveredAt, value: delivery.delivered_at && formatDateTime(delivery.delivered_at, locale) },
            { label: s.receivedBy, value: delivery.received_by },
            ...(delivery.invoice ? [{ label: s.invoice, value: <Link href={`/sales/invoices/${delivery.invoice.id}`} className="text-primary hover:underline"><Ltr>{delivery.invoice.doc_no}</Ltr></Link> }, { label: t.documents.total, value: <Money amount={toPaisa(delivery.invoice.total_amount)} locale={locale} /> }] : []),
            { label: s.deliveryNote, value: delivery.delivery_note ?? delivery.notes },
          ]} />
        </SectionCard>
        <SpecTable
          caption={s.lines}
          rows={lines.map((l) => ({ id: l.itemId, product: l.name, sku: l.sku, unit: l.unit, quantity: l.quantity, returned: l.returned, accepted: l.quantity - l.returned }))}
          columns={[
            { key: "product", sub: "sku", label: t.documents.product, kind: "text", primary: true }, { key: "unit", label: t.documents.unit, kind: "text" }, { key: "quantity", label: s.dispatched, kind: "quantity" },
            ...(inTransit ? [] : [{ key: "returned", label: s.returned, kind: "quantity" as const }, { key: "accepted", label: s.accepted, kind: "quantity" as const }]),
          ]}
          empty={{ title: t.documents.noLines }}
        />
        {delivery.returns.length > 0 && (
          <SpecTable
            caption={s.tabs.returns}
            rows={delivery.returns.map((r) => ({ id: r.id, no: r.doc_no, noHref: `/sales/returns/${r.id}`, total: r.total_amount, status: r.status }))}
            columns={[{ key: "no", label: s.customerReturn, kind: "link", primary: true }, { key: "total", label: t.documents.total, kind: "money" }, { key: "status", label: t.common.status, kind: "status", options: documentOptions(t) }]}
            empty={{ title: s.returnEmpty }}
          />
        )}
        <p className="hidden pt-16 text-sm print:block">{s.signature}: ______________________________</p>
        {inTransit && mayConfirm && <div className="print:hidden"><ConfirmForm deliveryId={id} lines={lines} canReturn={can(ctx, "sales.return")} /></div>}
      </div>
    </>
  );
}
