import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Phone } from "lucide-react";
import { loadReceivingAccounts } from "@/features/receivables/queries";
import { loadDelivery } from "@/features/sales/queries";
import { loadDeliveryMoney, loadSupplyStaff } from "@/features/supply/queries";
import { DELIVERY_TONE, documentOptions } from "@/features/sales/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { phoneHref, whatsappHref } from "@/lib/utils/phone";
import { toPaisa } from "@/lib/utils/money";
import { DocumentLink } from "@/components/documents/document-link";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate, formatDateTime } from "@/components/shared/format";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { SpecTable } from "@/components/tables/spec-table";
import { AssignSupplier } from "./assign-supplier";
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
  const mine = ctx.employeeId !== null && delivery.supplied_by === ctx.employeeId;
  const [staff, paid] = await Promise.all([loadSupplyStaff(), loadDeliveryMoney(id)]);
  const supplier = staff.find((x) => x.id === delivery.supplied_by);
  const dispatcher = can(ctx, "sales.dispatch");
  const collects = mine || can(ctx, "receivables.post") || (dispatcher && can(ctx, "receivables.collect"));
  const accounts = inTransit && collects && (can(ctx, "receivables.collect") || can(ctx, "receivables.post")) ? await loadReceivingAccounts() : [];
  const sp = t.supply;
  // The assigned driver confirms too; the database verifies who that is.
  const mayConfirm = dispatcher || mine || (delivery.driver_id !== null && !can(ctx, "sales.view_all") && !can(ctx, "sales.create"));
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
        actions={<DocumentLink kind="delivery_challan" params={{ id }} label={t.docs.pdf} />}
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
            { label: sp.supplier, value: supplier && (can(ctx, "sales.view_all") ? <Link href={`/supply-team/${supplier.id}`} className="text-primary hover:underline">{local(supplier.nameEn, supplier.nameUr)}</Link> : local(supplier.nameEn, supplier.nameUr)) },
            { label: s.vehicle, value: delivery.vehicle && <Ltr>{delivery.vehicle.registration_no}</Ltr> },
            { label: s.dispatchedAt, value: delivery.dispatched_at && formatDateTime(delivery.dispatched_at, locale) },
            { label: s.deliveredAt, value: delivery.delivered_at && formatDateTime(delivery.delivered_at, locale) },
            { label: s.receivedBy, value: delivery.received_by },
            ...(delivery.invoice ? [{ label: s.invoice, value: <Link href={`/sales/invoices/${delivery.invoice.id}`} className="text-primary hover:underline"><Ltr>{delivery.invoice.doc_no}</Ltr></Link> }, { label: t.documents.total, value: <Money amount={toPaisa(delivery.invoice.total_amount)} locale={locale} /> }] : []),
            { label: s.deliveryNote, value: delivery.delivery_note ?? delivery.notes },
          ]} />
        </SectionCard>
        {paid && (
          <SectionCard title={sp.money}>
            <dl className="grid gap-4 text-sm sm:grid-cols-4">
              {([[sp.invoiceTotal, paid.total], [sp.moneyReceived, paid.received], [sp.waiting, paid.waiting], [sp.outstanding, paid.outstanding]] as const).filter(([label, v]) => label !== sp.waiting || toPaisa(v) > BigInt(0)).map(([label, v]) => (
                <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd><Money amount={toPaisa(v)} locale={locale} className="font-semibold" /></dd></div>
              ))}
            </dl>
            {paid.payments.length > 0 && (
              <ul className="mt-4 divide-y border-t">
                {paid.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                    <span>{can(ctx, "receivables.view") || can(ctx, "receivables.post") ? <Link href={`/receivables/payments/${p.id}`} className="font-medium text-primary hover:underline"><Ltr>{p.number}</Ltr></Link> : <Ltr className="font-medium">{p.number}</Ltr>} <span className="text-muted-foreground">· <bdi>{formatDate(p.date, locale)}</bdi> · {t.purchasing.methods[p.method]}{p.held && ` · ${sp.heldBySupplier}`}</span></span>
                    <span className="flex items-center gap-3"><Money amount={toPaisa(p.amount)} locale={locale} className="font-medium" />{p.status !== "posted" && <StatusBadge tone={p.status === "draft" ? "amber" : "gray"}>{p.status === "draft" ? sp.waiting : t.purchasing.statuses.void}</StatusBadge>}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        )}
        {inTransit && dispatcher && staff.length > 0 && <AssignSupplier deliveryId={id} current={delivery.supplied_by ?? ""} staff={staff.filter((x) => x.isActive || x.id === delivery.supplied_by).map((x) => ({ id: x.id, name: local(x.nameEn, x.nameUr) }))} />}
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
        {inTransit && mayConfirm && <div className="print:hidden"><ConfirmForm key={delivery.supplied_by ?? ""} deliveryId={id} lines={lines} canReturn={can(ctx, "sales.return")} shop={customer ? local(customer.name, customer.name_ur) : ""} supplier={delivery.supplied_by ?? ""} due={collects ? paid?.outstanding ?? null : null} accounts={accounts} collects={collects && (mine || delivery.supplied_by !== null || accounts.length > 0)} /></div>}
      </div>
    </>
  );
}
