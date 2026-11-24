import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadFlowSuppliers, loadOrders } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { ListFilters } from "@/components/documents/list-filters";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

const STATUSES = ["draft", "approved", "partially_received", "received", "cancelled"] as const;

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/orders">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.purchasing.tabs.orders };
}

export default async function OrdersPage({ params, searchParams }: PageProps<"/purchasing/[flow]/orders">) {
  const { flow, ctx, t, local } = await purchasingPage(params);
  const p = t.purchasing;
  const filter = listParams(await searchParams, STATUSES);
  const [{ rows: orders, total }, suppliers] = await Promise.all([loadOrders(flow, filter), flow === "suppliers" ? loadFlowSuppliers(flow, true) : []]);
  const add = can(ctx, "purchasing.create") && <LinkButton href={flowPath(flow, "orders", "new")}><Plus aria-hidden />{p.newOrder}</LinkButton>;
  return (
    <>
      <PageHeader title={p.tabs.orders} description={p.flows[flow]} actions={add} />
      <SpecTable
        caption={p.tabs.orders}
        rows={orders.map((o) => ({
          id: o.id, no: o.doc_no, noHref: flowPath(flow, "orders", o.id), date: o.order_date, supplier: local(o.supplier.name, o.supplier.name_ur),
          expected: o.expected_date, status: o.closed_at ? "closed" : o.status, total: o.total_amount,
          progress: o.progress && o.progress.ordered > BigInt(0) ? Number((o.progress.received * BigInt(100)) / o.progress.ordered) : null,
        }))}
        columns={[
          { key: "no", label: t.documents.number, kind: "link", primary: true },
          ...(flow === "suppliers" ? [{ key: "supplier", label: t.documents.supplier, kind: "text" as const }] : []),
          { key: "date", label: t.documents.date, kind: "date" },
          { key: "expected", label: p.expectedDate, kind: "date", hideBelow: "xl" },
          { key: "progress", label: p.received, kind: "percent", hideBelow: "lg" },
          { key: "total", label: t.documents.total, kind: "money" },
          { key: "status", label: t.common.status, kind: "status", options: {
            draft: { label: p.statuses.draft, tone: "gray" }, approved: { label: p.statuses.approved, tone: "blue" }, partially_received: { label: p.statuses.partially_received, tone: "amber" },
            received: { label: p.statuses.received, tone: "green" }, cancelled: { label: p.statuses.cancelled, tone: "gray" }, closed: { label: p.closed, tone: "amber" },
          } },
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={<ListFilters t={t} local={local} suppliers={suppliers}><UrlSelect param="status" label={t.documents.allStatuses} options={STATUSES.map((s) => ({ value: s, label: p.statuses[s] }))} /></ListFilters>}
        empty={{ title: t.documents.empty, description: t.documents.emptyHint, action: add }}
      />
    </>
  );
}
