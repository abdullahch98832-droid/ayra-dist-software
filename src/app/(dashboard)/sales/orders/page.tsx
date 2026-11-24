import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { loadOrders, ORDER_STATUSES } from "@/features/sales/queries";
import { orderOptions } from "@/features/sales/status";
import { loadTakers, takerNames } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { pageContext, uuidParam } from "@/lib/page-context";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSearch, UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sales.tabs.orders };
}

export default async function OrdersPage({ searchParams }: PageProps<"/sales/orders">) {
  const { ctx, t, local } = await pageContext();
  const s = t.sales;
  const query = await searchParams;
  const filter = { ...listParams(query, [...ORDER_STATUSES, "open"]), takerId: uuidParam(query.taker), customerId: uuidParam(query.customer) };
  const all = can(ctx, "sales.view_all");
  const [{ rows, total }, takers, names] = await Promise.all([loadOrders(filter), all ? loadTakers() : [], takerNames()]);
  const add = can(ctx, "sales.create") && <LinkButton href="/sales/orders/new"><Plus aria-hidden />{s.newOrder}</LinkButton>;
  return (
    <>
      <PageHeader title={s.tabs.orders} actions={add} />
      <SpecTable
        caption={s.tabs.orders}
        rows={rows.map((o) => {
          const taker = names.get(o.order_taker_id ?? "");
          return {
            id: o.id, no: o.doc_no, noHref: `/sales/orders/${o.id}`, customer: o.customer ? local(o.customer.name, o.customer.name_ur) : null, city: o.customer?.city, date: o.order_date, required: o.required_date,
            taker: taker ? local(taker.nameEn, taker.nameUr) : null, total: o.total_amount, status: o.status,
          };
        })}
        columns={[
          { key: "no", label: t.documents.number, kind: "link", primary: true },
          { key: "customer", sub: "city", label: s.customer, kind: "text" },
          { key: "date", label: t.documents.date, kind: "date", hideBelow: "lg" },
          { key: "required", label: s.deliveryDate, kind: "date", hideBelow: "xl" },
          ...(all ? [{ key: "taker", label: s.orderTaker, kind: "text" as const, hideBelow: "lg" as const }] : []),
          { key: "total", label: t.documents.total, kind: "money" },
          { key: "status", label: t.common.status, kind: "status", options: orderOptions(t) },
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={
          <>
            <UrlSearch placeholder={t.documents.searchNumber} />
            <UrlSelect param="status" label={t.documents.allStatuses} options={[{ value: "open", label: t.takers.open }, ...ORDER_STATUSES.map((x) => ({ value: x, label: s.statuses[x] }))]} />
            {takers.length > 0 && <UrlSelect param="taker" label={t.customers.allOrderTakers} options={takers.map((x) => ({ value: x.id, label: local(x.nameEn, x.nameUr) }))} />}
          </>
        }
        empty={{ title: s.orderEmpty, description: s.orderEmptyHint, action: add }}
      />
    </>
  );
}
