import type { Metadata } from "next";
import { inventoryPage } from "@/features/inventory/page-context";
import { loadReservations } from "@/features/inventory/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).stock.tabs.reservations };
}

export default async function ReservationsPage() {
  const { ctx, t, local } = await inventoryPage();
  if (!can(ctx, "inventory.view") || !(can(ctx, "sales.view") || can(ctx, "sales.view_all"))) return <Forbidden />;
  const s = t.stock;
  const rows = await loadReservations();
  const dispatch = can(ctx, "sales.dispatch");
  return (
    <>
      <PageHeader title={s.tabs.reservations} description={s.reservationsHint} />
      <SpecTable
        caption={s.tabs.reservations}
        rows={rows.map((r) => ({
          id: r.id, product: local(r.product.name_en, r.product.name_ur), sku: r.product.sku, order: r.order.doc_no, orderHref: `/inventory/dispatch/${r.order.id}`, date: r.order.order_date,
          customer: local(r.order.customer.name, r.order.customer.name_ur), warehouse: local(r.order.warehouse.name_en, r.order.warehouse.name_ur),
          ordered: r.base_quantity, dispatched: r.dispatched_base_quantity, reserved: r.reserved_base_quantity,
        }))}
        columns={[
          { key: "product", sub: "sku", label: t.documents.product, kind: "text", primary: true },
          { key: "order", label: s.order, kind: dispatch ? "link" : "text" },
          { key: "date", label: t.documents.date, kind: "date", hideBelow: "xl" },
          { key: "customer", label: s.customer, kind: "text" },
          { key: "warehouse", label: t.documents.warehouse, kind: "text", hideBelow: "lg" },
          { key: "ordered", label: s.ordered, kind: "quantity", hideBelow: "lg" },
          { key: "dispatched", label: s.dispatched, kind: "quantity", hideBelow: "lg" },
          { key: "reserved", label: s.reserved, kind: "quantity" },
        ]}
        searchKeys={["product", "sku", "order", "customer"]}
        empty={{ title: s.reservationsEmpty }}
      />
    </>
  );
}
