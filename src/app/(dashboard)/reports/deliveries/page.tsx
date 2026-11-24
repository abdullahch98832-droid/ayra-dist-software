import type { Metadata } from "next";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { reportDeliveries } from "@/features/reports/queries";
import { deliveryOptions } from "@/features/sales/status";
import { getT } from "@/i18n/server";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

const STATUSES = ["dispatched", "delivered"] as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.deliveries };
}

export default async function DeliveryReportPage({ searchParams }: PageProps<"/reports/deliveries">) {
  const { t, query, today, period, allowed, local } = await reportPage(REPORTS.deliveries, searchParams);
  if (!allowed) return <Forbidden />;
  const r = t.reports;
  const s = t.sales;
  const status = STATUSES.find((x) => x === query.status) ?? null;
  const rows = await reportDeliveries(period, status);
  return (
    <>
      <PageHeader title={r.deliveries} breadcrumbs={[{ label: r.title, href: "/reports" }]} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={r.deliveries} description={r.deliveriesHint}>
        <SpecTable
          caption={r.deliveries}
          exportName={`deliveries-${period.from}-${period.to}`}
          rows={rows.map((x) => ({
            id: x.delivery_id, no: x.doc_no, noHref: `/sales/deliveries/${x.delivery_id}`, order: x.order_no, date: x.delivery_date, customer: local(x.customer, x.customer_ur), city: x.city, taker: x.taker_en ? local(x.taker_en, x.taker_ur) : null,
            vehicle: x.vehicle, driver: x.driver_en ? local(x.driver_en, x.driver_ur) : null, delivered: x.delivered_at, received: x.received_by, out: x.dispatched_quantity, back: x.returned_quantity,
            amount: x.amount, returned: x.returned_amount, status: x.status,
          }))}
          columns={[
            { key: "no", sub: "order", label: s.delivery, kind: "link", primary: true },
            { key: "date", label: t.documents.date, kind: "date" },
            { key: "customer", sub: "city", label: s.customer, kind: "text" },
            { key: "taker", label: s.orderTaker, kind: "text", hideBelow: "2xl" },
            { key: "vehicle", sub: "driver", label: s.vehicle, kind: "text", hideBelow: "xl" },
            { key: "delivered", label: s.deliveredAt, kind: "datetime", hideBelow: "2xl" },
            { key: "received", label: s.receivedBy, kind: "text", hideBelow: "2xl" },
            { key: "out", label: s.dispatched, kind: "quantity", hideBelow: "lg", total: true },
            { key: "back", label: s.returned, kind: "quantity", hideBelow: "lg", total: true },
            { key: "amount", label: s.invoice, kind: "money", total: true },
            { key: "returned", label: r.returns, kind: "money", hideBelow: "xl", total: true },
            { key: "status", label: t.common.status, kind: "status", options: deliveryOptions(t) },
          ]}
          searchKeys={["no", "order", "customer", "city", "vehicle", "driver"]}
          toolbar={<UrlSelect param="status" label={t.documents.allStatuses} options={STATUSES.map((x) => ({ value: x, label: s.deliveryStatuses[x] }))} />}
          empty={{ title: r.empty, description: r.emptyHint }}
        />
      </PeriodFrame>
    </>
  );
}
