import type { Metadata } from "next";
import { Truck } from "lucide-react";
import { loadDeliveries } from "@/features/sales/queries";
import { deliveryOptions } from "@/features/sales/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { pageContext } from "@/lib/page-context";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSearch, UrlSelect } from "@/components/tables/url-filters";

const STATUSES = ["dispatched", "delivered"] as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sales.tabs.deliveries };
}

export default async function DeliveriesPage({ searchParams }: PageProps<"/sales/deliveries">) {
  const { ctx, t, local } = await pageContext();
  const s = t.sales;
  const filter = listParams(await searchParams, STATUSES);
  const { rows, total } = await loadDeliveries(filter);
  return (
    <>
      <PageHeader title={s.tabs.deliveries} actions={can(ctx, "sales.dispatch") && <LinkButton href="/inventory/dispatch"><Truck aria-hidden />{s.toDispatch}</LinkButton>} />
      <SpecTable
        caption={s.tabs.deliveries}
        rows={rows.map((x) => ({
          id: x.id, no: x.doc_no, noHref: `/sales/deliveries/${x.id}`, date: x.delivery_date, order: x.order?.doc_no, orderHref: x.order ? `/sales/orders/${x.order.id}` : undefined,
          customer: x.order?.customer ? local(x.order.customer.name, x.order.customer.name_ur) : null, city: x.order?.customer?.city, vehicle: x.vehicle?.registration_no, received: x.received_by, status: x.status,
        }))}
        columns={[
          { key: "no", label: t.documents.number, kind: "link", primary: true },
          { key: "customer", sub: "city", label: s.customer, kind: "text" },
          { key: "order", label: s.order, kind: "link" },
          { key: "date", label: t.documents.date, kind: "date" },
          { key: "vehicle", label: s.vehicle, kind: "code", hideBelow: "lg" },
          { key: "received", label: s.receivedBy, kind: "text", hideBelow: "xl" },
          { key: "status", label: t.common.status, kind: "status", options: deliveryOptions(t) },
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={<><UrlSearch placeholder={t.documents.searchNumber} /><UrlSelect param="status" label={t.documents.allStatuses} options={STATUSES.map((x) => ({ value: x, label: s.deliveryStatuses[x] }))} /></>}
        empty={{ title: s.deliveryEmpty }}
      />
    </>
  );
}
