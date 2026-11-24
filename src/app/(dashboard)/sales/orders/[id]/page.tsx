import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, Banknote, CheckCheck, ClipboardList, Lock, PackageOpen, Pencil, Printer, Send, Trash2, Truck, Undo2 } from "lucide-react";
import { loadCustomerSummary } from "@/features/customers/queries";
import { canEditOrder, seesSettlements } from "@/features/sales/access";
import { approveOrderAction, cancelOrderAction, closeOrderAction, deleteSalesDraftAction, sendBackOrderAction, startPickingAction, submitOrderAction } from "@/features/sales/actions";
import { loadOrder } from "@/features/sales/queries";
import { deliveryOptions, ORDER_TONE, payOptions } from "@/features/sales/status";
import { takerNames } from "@/features/takers/queries";
import { fill, isolate } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { formatPaisa, sumPaisa, toPaisa } from "@/lib/utils/money";
import { ActionButton } from "@/components/documents/action-button";
import { OrderSteps } from "@/components/documents/order-steps";
import { PrintButton } from "@/components/documents/print-button";
import { FormAlert } from "@/components/forms/field";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate, formatDateTime } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sales.order };
}

export default async function OrderPage({ params }: PageProps<"/sales/orders/[id]">) {
  const { id, ctx, t, locale, local } = await pageContext(params);
  const order = await loadOrder(id);
  if (!order) notFound();
  const s = t.sales;
  const d = t.documents;
  const status = order.status;
  const draft = status === "draft";
  const submitted = status === "submitted";
  const approver = can(ctx, "sales.approve");
  const dispatcher = can(ctx, "sales.dispatch");
  const edit = canEditOrder(ctx, order);
  const total = toPaisa(order.total_amount);
  const summary = submitted && approver ? await loadCustomerSummary(order.customer_id) : null;
  const available = summary?.credit_available === undefined ? null : toPaisa(summary.credit_available);
  const over = available !== null && total > available;
  const taker = (await takerNames()).get(order.order_taker_id ?? "");
  const unpaid = order.invoices.find((i) => (i.outstanding ?? 0) > 0);
  const gross = sumPaisa(order.sales_order_items.map((l) => BigInt(l.quantity) * toPaisa(l.unit_price)));
  const discount = gross - total;
  const started = order.sales_order_items.some((l) => l.reserved_base_quantity > 0 || l.dispatched_base_quantity > 0);

  return (
    <>
      <PageHeader
        title={order.doc_no}
        breadcrumbs={[{ label: s.tabs.orders, href: "/sales/orders" }]}
        description={<span className="flex flex-wrap items-center gap-3"><StatusBadge tone={ORDER_TONE[status] ?? "gray"}>{s.statuses[status]}</StatusBadge><bdi>{order.customer && local(order.customer.name, order.customer.name_ur)}</bdi></span>}
        actions={
          <>
            {draft && edit && <ActionButton label={d.deleteDraft} icon={<Trash2 aria-hidden />} variant="outline" action={deleteSalesDraftAction.bind(null, "sales_orders", id)} success={d.deleted} redirectTo="/sales/orders" confirm={{ title: d.confirmDeleteTitle, description: d.confirmDelete, tone: "danger" }} />}
            {edit && <LinkButton variant="outline" href={`/sales/orders/${id}/edit`}><Pencil aria-hidden />{s.editOrder}</LinkButton>}
            {approver && ["submitted", "approved", "picking"].includes(status) && (
              <ActionButton label={s.cancelOrder} icon={<Ban aria-hidden />} variant="outline" action={cancelOrderAction.bind(null, id)} reasonLabel={d.reason} success={s.cancelled} confirm={{ title: s.cancelTitle, description: s.cancelHint, tone: "danger" }} />
            )}
            {submitted && approver && <ActionButton label={s.sendBack} icon={<Undo2 aria-hidden />} variant="outline" action={sendBackOrderAction.bind(null, id)} reasonLabel={d.reason} success={s.sentBack} confirm={{ title: s.sendBackTitle, description: s.sendBackHint }} />}
            {status === "partially_dispatched" && approver && <ActionButton label={s.closeOrder} icon={<Lock aria-hidden />} variant="outline" action={closeOrderAction.bind(null, id)} reasonLabel={d.reason} success={s.closed} confirm={{ title: s.closeTitle, description: s.closeHint }} />}
            {draft && edit && <ActionButton label={s.submit} icon={<Send aria-hidden />} action={submitOrderAction.bind(null, id)} success={s.submitted} confirm={{ title: s.submitTitle, description: s.submitHint }} />}
            {submitted && approver && !over && <ActionButton label={s.approve} icon={<CheckCheck aria-hidden />} action={approveOrderAction.bind(null, id, false)} success={s.approved} confirm={{ title: s.approveTitle, description: s.approveHint }} />}
            {submitted && approver && over && can(ctx, "sales.credit_override") && (
              <ActionButton label={s.approveOver} icon={<CheckCheck aria-hidden />} action={approveOrderAction.bind(null, id, true)} success={s.approved} confirm={{ title: s.approveTitle, description: s.approveOverHint, tone: "danger" }} />
            )}
            {status === "approved" && dispatcher && <ActionButton label={s.startPicking} icon={<PackageOpen aria-hidden />} action={startPickingAction.bind(null, id)} success={s.pickingStarted} />}
            {(status === "picking" || status === "partially_dispatched") && (
              <>
                <PrintButton label={s.pickList} icon={<ClipboardList aria-hidden />} />
                {dispatcher && <LinkButton href={`/inventory/dispatch/${id}`}><Truck aria-hidden />{s.dispatch}</LinkButton>}
              </>
            )}
            {unpaid && can(ctx, "receivables.collect") && <LinkButton href={`/receivables/payments/new?customer=${order.customer_id}&invoice=${unpaid.sales_invoice_id}`}><Banknote aria-hidden />{s.recordPayment}</LinkButton>}
            {(draft || submitted || status === "approved") && <PrintButton label={s.print} icon={<Printer aria-hidden />} />}
          </>
        }
      />
      <div className="grid gap-6">
        <OrderSteps status={status} t={t} />
        {order.sent_back_reason && draft && <FormAlert tone="info">{fill(s.sentBackNote, { reason: order.sent_back_reason })}</FormAlert>}
        {over && available !== null && <FormAlert tone="error">{fill(s.overLimit, { amount: isolate(formatPaisa(available, locale)) })}</FormAlert>}
        {order.cancel_reason && <FormAlert tone="info">{fill(s.cancelledNote, { reason: order.cancel_reason })}</FormAlert>}
        {order.close_reason && <FormAlert tone="info">{fill(s.closedNote, { reason: order.close_reason })}</FormAlert>}
        <SectionCard title={s.order}>
          <DescriptionList items={[
            { label: s.customer, value: order.customer && (can(ctx, "customers.view") ? <Link href={`/customers/${order.customer.id}`} className="text-primary hover:underline">{local(order.customer.name, order.customer.name_ur)}</Link> : local(order.customer.name, order.customer.name_ur)) },
            { label: t.customers.address, value: order.customer && [order.customer.address, order.customer.area, order.customer.city].filter(Boolean).join(", ") },
            { label: t.customers.phone, value: order.customer?.phone && <Ltr>{order.customer.phone}</Ltr> },
            { label: s.orderTaker, value: taker && local(taker.nameEn, taker.nameUr) },
            { label: s.orderDate, value: formatDate(order.order_date, locale) },
            { label: s.deliveryDate, value: formatDate(order.required_date, locale) },
            { label: d.warehouse, value: local(order.warehouse.name_en, order.warehouse.name_ur) },
            ...(order.approved_at ? [{ label: s.statuses.approved, value: formatDateTime(order.approved_at, locale) }] : []),
            ...(order.picking_at ? [{ label: s.statuses.picking, value: formatDateTime(order.picking_at, locale) }] : []),
            ...(order.delivered_at ? [{ label: s.statuses.delivered, value: formatDateTime(order.delivered_at, locale) }] : []),
            ...(order.completed_at ? [{ label: s.statuses.completed, value: formatDateTime(order.completed_at, locale) }] : []),
            ...(discount > BigInt(0) ? [{ label: s.gross, value: <Money amount={gross} locale={locale} /> }, { label: s.totalDiscount, value: <Money amount={discount} locale={locale} /> }] : []),
            { label: d.total, value: <Money amount={total} locale={locale} className="font-semibold" /> },
            { label: d.notes, value: order.notes },
          ]} />
        </SectionCard>
        <section className="grid gap-3">
          <h2 className="text-base font-semibold text-navy">{s.lines}</h2>
          <SpecTable
            caption={s.lines}
            rows={order.sales_order_items.map((l) => {
              const dispatched = Math.floor(l.dispatched_base_quantity / l.factor);
              return {
                id: l.id, product: local(l.product.name_en, l.product.name_ur), sku: l.product.sku, unit: local(l.unit.name_en, l.unit.name_ur), quantity: l.quantity,
                price: l.unit_price, discount: l.discount_amount || null, total: l.line_total, dispatched, returned: order.returned.get(l.id) ?? 0,
                remaining: order.closed_at || status === "cancelled" ? 0 : l.quantity - dispatched,
              };
            })}
            columns={[
              { key: "product", sub: "sku", label: d.product, kind: "text", primary: true },
              { key: "quantity", sub: "unit", label: s.ordered, kind: "quantity" },
              ...(started ? [
                { key: "dispatched", label: s.dispatched, kind: "quantity" as const }, { key: "returned", label: s.returned, kind: "quantity" as const, hideBelow: "lg" as const },
                { key: "remaining", label: s.remaining, kind: "quantity" as const, hideBelow: "lg" as const },
              ] : []),
              { key: "price", label: d.unitPrice, kind: "money", hideBelow: "lg" },
              { key: "discount", label: s.discount, kind: "money", hideBelow: "xl", total: true },
              { key: "total", label: d.lineTotal, kind: "money", total: true },
            ]}
            empty={{ title: d.noLines }}
          />
        </section>
        {order.deliveries.length > 0 && (
          <section className="grid gap-3">
            <h2 className="text-base font-semibold text-navy">{s.tabs.deliveries}</h2>
            <SpecTable
              caption={s.tabs.deliveries}
              rows={order.deliveries.map((x) => ({ id: x.id, no: x.doc_no, noHref: `/sales/deliveries/${x.id}`, date: x.delivery_date, status: x.status, received: x.received_by, delivered: x.delivered_at }))}
              columns={[
                { key: "no", label: d.number, kind: "link", primary: true }, { key: "date", label: d.date, kind: "date" }, { key: "status", label: t.common.status, kind: "status", options: deliveryOptions(t) },
                { key: "received", label: s.receivedBy, kind: "text" }, { key: "delivered", label: s.deliveredAt, kind: "datetime", hideBelow: "lg" },
              ]}
              empty={{ title: s.deliveryEmpty }}
            />
          </section>
        )}
        {order.invoices.length > 0 && (
          <section className="grid gap-3">
            <h2 className="text-base font-semibold text-navy">{s.tabs.invoices}</h2>
            <SpecTable
              caption={s.tabs.invoices}
              rows={order.invoices.map((x) => ({
                id: x.sales_invoice_id ?? "", no: x.doc_no, noHref: `/sales/invoices/${x.sales_invoice_id}`, date: x.invoice_date, total: x.total_amount, paid: x.paid_amount, returned: x.returned_amount, outstanding: x.outstanding, status: x.payment_status,
              }))}
              columns={[
                { key: "no", label: s.invoiceNo, kind: "link", primary: true }, { key: "date", label: d.date, kind: "date" }, { key: "total", label: d.total, kind: "money", total: true },
                ...(seesSettlements(ctx) ? [
                  { key: "returned", label: s.returned, kind: "money" as const, hideBelow: "lg" as const, total: true }, { key: "paid", label: s.paid, kind: "money" as const, hideBelow: "lg" as const, total: true },
                  { key: "outstanding", label: s.outstanding, kind: "money" as const, total: true }, { key: "status", label: t.common.status, kind: "status" as const, options: payOptions(t) },
                ] : []),
              ]}
              empty={{ title: s.invoiceEmpty }}
            />
          </section>
        )}
      </div>
    </>
  );
}
