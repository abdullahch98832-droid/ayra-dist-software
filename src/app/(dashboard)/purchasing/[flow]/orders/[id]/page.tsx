import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Ban, CheckCheck, Lock, PackageCheck, Pencil, Trash2 } from "lucide-react";
import { approveOrderAction, cancelOrderAction, closeOrderAction, deletePurchasingDraftAction } from "@/features/purchasing/actions";
import { flowOf, flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadOrder } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { ActionButton } from "@/components/documents/action-button";
import { DocumentStatus } from "@/components/documents/document-status";
import { PageHeader } from "@/components/layout/page-header";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/orders/[id]">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.purchasing.order };
}

export default async function OrderPage({ params }: PageProps<"/purchasing/[flow]/orders/[id]">) {
  const { flow, id, ctx, t, locale, local } = await purchasingPage(params);
  const order = await loadOrder(id);
  if (!order || flowOf(order.supplier.is_principal) !== flow) notFound();
  const p = t.purchasing;
  const d = t.documents;
  const open = order.status === "approved" || order.status === "partially_received";
  const base = flowPath(flow, "orders");

  return (
    <>
      <PageHeader
        title={order.doc_no}
        breadcrumbs={[{ label: p.tabs.orders, href: base }]}
        description={<span className="flex flex-wrap items-center gap-3"><DocumentStatus status={order.status} closed={!!order.closed_at} t={t} /><bdi>{local(order.supplier.name, order.supplier.name_ur)}</bdi></span>}
        actions={
          <>
            {order.status === "draft" && can(ctx, "purchasing.create") && (
              <>
                <ActionButton label={d.deleteDraft} icon={<Trash2 aria-hidden />} variant="outline" action={deletePurchasingDraftAction.bind(null, "purchase_orders", id)} success={d.deleted} redirectTo={base} confirm={{ title: d.confirmDeleteTitle, description: d.confirmDelete, tone: "danger" }} />
                <LinkButton variant="outline" href={`${base}/${id}/edit`}><Pencil aria-hidden />{d.edit}</LinkButton>
              </>
            )}
            {(order.status === "draft" || order.status === "approved") && can(ctx, "purchasing.approve") && order.receipts.length === 0 && (
              <ActionButton label={d.cancelDocument} icon={<Ban aria-hidden />} variant="outline" action={cancelOrderAction.bind(null, id)} success={d.cancelled} confirm={{ title: d.confirmCancelTitle, description: d.confirmCancel, tone: "danger" }} />
            )}
            {order.status === "draft" && can(ctx, "purchasing.approve") && (
              <ActionButton label={d.approve} icon={<CheckCheck aria-hidden />} action={approveOrderAction.bind(null, id)} success={d.approved} confirm={{ title: d.confirmApproveTitle, description: d.confirmApprove }} />
            )}
            {order.status === "partially_received" && can(ctx, "purchasing.approve") && (
              <ActionButton label={p.closeOrder} icon={<Lock aria-hidden />} variant="outline" action={closeOrderAction.bind(null, id)} reasonLabel={p.closeReason} success={p.closedDone} confirm={{ title: p.closeTitle, description: p.closeHint }} />
            )}
            {open && can(ctx, "purchasing.create") && <LinkButton href={`${flowPath(flow, "receipts", "new")}?order=${id}`}><PackageCheck aria-hidden />{p.receiveOrder}</LinkButton>}
          </>
        }
      />
      <div className="grid gap-6">
        <SectionCard title={p.order}>
          <DescriptionList items={[
            { label: d.date, value: formatDate(order.order_date, locale) },
            { label: p.expectedDate, value: formatDate(order.expected_date, locale) },
            { label: d.warehouse, value: local(order.warehouse.name_en, order.warehouse.name_ur) },
            { label: d.notes, value: order.notes },
            ...(order.close_reason ? [{ label: p.closed, value: order.close_reason }] : []),
          ]} />
        </SectionCard>
        <section className="grid gap-3">
          <h2 className="text-base font-semibold text-navy">{p.progress}</h2>
          <SpecTable
            caption={p.progress}
            rows={order.purchase_order_items.map((l) => {
              const g = order.progress.get(l.id);
              return {
                id: l.id, product: local(l.product.name_en, l.product.name_ur), sku: l.product.sku, unit: local(l.unit.name_en, l.unit.name_ur), quantity: l.quantity,
                ordered: Number(l.quantity) * l.factor, accepted: g?.accepted_base ?? 0, damaged: g?.damaged_base ?? 0, rejected: g?.rejected_base ?? 0, remaining: g?.remaining_base ?? 0,
                price: l.unit_price, total: l.line_total,
              };
            })}
            columns={[
              { key: "product", sub: "sku", label: d.product, kind: "text", primary: true },
              { key: "quantity", sub: "unit", label: d.quantity, kind: "quantity" },
              { key: "ordered", label: p.ordered, kind: "quantity", hideBelow: "lg", total: true },
              { key: "accepted", label: p.accepted, kind: "quantity", total: true },
              { key: "damaged", label: p.damaged, kind: "quantity", hideBelow: "lg", total: true },
              { key: "rejected", label: p.rejected, kind: "quantity", hideBelow: "lg", total: true },
              { key: "remaining", label: p.remaining, kind: "quantity", total: true },
              { key: "price", label: d.unitCost, kind: "money", hideBelow: "xl" },
              { key: "total", label: d.lineTotal, kind: "money", total: true },
            ]}
            empty={{ title: d.noLines }}
          />
        </section>
        {order.receipts.length > 0 && (
          <section className="grid gap-3">
            <h2 className="text-base font-semibold text-navy">{p.tabs.receipts}</h2>
            <SpecTable
              caption={p.tabs.receipts}
              rows={order.receipts.map((r) => ({ id: r.id, no: r.doc_no, noHref: flowPath(flow, "receipts", r.id), date: r.receipt_date, status: r.status, total: r.total_amount }))}
              columns={[
                { key: "no", label: d.number, kind: "link", primary: true }, { key: "date", label: d.date, kind: "date" },
                { key: "status", label: t.common.status, kind: "status", options: { draft: { label: p.statuses.draft, tone: "gray" }, posted: { label: p.statuses.posted, tone: "green" } } },
                { key: "total", label: d.total, kind: "money", total: true },
              ]}
              empty={{ title: d.empty }}
            />
          </section>
        )}
      </div>
    </>
  );
}
