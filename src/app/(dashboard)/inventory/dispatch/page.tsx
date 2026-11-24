import type { Metadata } from "next";
import { Truck } from "lucide-react";
import { inventoryPage } from "@/features/inventory/page-context";
import { loadDispatchQueue } from "@/features/inventory/queries";
import { orderOptions } from "@/features/sales/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { formatDate } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";
import { StateMessage } from "@/components/shared/states";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).stock.tabs.dispatch };
}

export default async function DispatchPage() {
  const { ctx, t, locale, local } = await inventoryPage();
  if (!can(ctx, "sales.dispatch")) return <Forbidden />;
  const s = t.stock;
  const { orders, deliveries } = await loadDispatchQueue();
  return (
    <>
      <PageHeader title={s.tabs.dispatch} description={s.dispatchHint} />
      <div className="grid gap-6">
        <section className="grid gap-3">
          <h2 className="text-base font-semibold text-navy">{s.awaiting}</h2>
          <SpecTable
            caption={s.awaiting}
            rows={orders.map((o) => ({ id: o.id, no: o.doc_no, noHref: `/inventory/dispatch/${o.id}`, date: o.order_date, required: o.required_date, customer: local(o.customer.name, o.customer.name_ur), warehouse: local(o.warehouse.name_en, o.warehouse.name_ur), status: o.status }))}
            columns={[
              { key: "no", label: s.order, kind: "link", primary: true }, { key: "date", label: t.documents.date, kind: "date" }, { key: "required", label: s.requiredDate, kind: "date", hideBelow: "lg" },
              { key: "customer", label: s.customer, kind: "text" }, { key: "warehouse", label: t.documents.warehouse, kind: "text", hideBelow: "lg" },
              { key: "status", label: t.common.status, kind: "status", options: orderOptions(t) },
            ]}
            searchKeys={["no", "customer"]}
            empty={{ title: s.dispatchEmpty }}
          />
        </section>
        <SectionCard title={s.inTransit}>
          {deliveries.length === 0 ? <StateMessage headingLevel="p" icon={Truck} title={s.deliveriesEmpty} className="py-6" /> : (
            <ul className="divide-y">
              {deliveries.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium"><Ltr>{x.doc_no}</Ltr> · <bdi>{x.order.customer && local(x.order.customer.name, x.order.customer.name_ur)}</bdi></p>
                    <p className="text-xs text-muted-foreground"><Ltr>{x.order.doc_no}</Ltr> · <bdi>{formatDate(x.delivery_date, locale)}</bdi>{x.vehicle && <> · <Ltr>{x.vehicle.registration_no}</Ltr></>}</p>
                  </div>
                  <LinkButton variant="outline" href={`/sales/deliveries/${x.id}`}>{s.confirmDelivered}</LinkButton>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
