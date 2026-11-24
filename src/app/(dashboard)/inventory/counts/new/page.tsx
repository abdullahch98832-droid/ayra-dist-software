import type { Metadata } from "next";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { businessToday } from "@/features/dashboard/period";
import { inventoryPage, uuidParam } from "@/features/inventory/page-context";
import { loadCountSheet } from "@/features/inventory/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StateMessage } from "@/components/shared/states";
import { UrlSelect } from "@/components/tables/url-filters";
import { CountForm } from "../count-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).stock.newCount };
}

export default async function NewCountPage({ searchParams }: PageProps<"/inventory/counts/new">) {
  const { ctx, t, local } = await inventoryPage();
  if (!can(ctx, "inventory.count")) return <Forbidden />;
  const requested = uuidParam((await searchParams).warehouse);
  const warehouses = await loadWarehouseChoices();
  const warehouse = warehouses.find((w) => w.id === requested);
  const sheet = warehouse ? await loadCountSheet(warehouse.id) : [];
  return (
    <>
      <PageHeader title={t.stock.newCount} description={t.stock.countHint} breadcrumbs={[{ label: t.stock.tabs.counts, href: "/inventory/counts" }]} />
      <div className="grid gap-6">
        <SectionCard title={t.stock.chooseWarehouse}>
          <UrlSelect param="warehouse" label={t.documents.choose} className="sm:w-96" options={warehouses.map((w) => ({ value: w.id, label: local(w.nameEn, w.nameUr) }))} />
        </SectionCard>
        {warehouse && sheet.length === 0 && <StateMessage headingLevel="p" title={t.documents.noProduct} />}
        {warehouse && sheet.length > 0 && (
          <CountForm
            key={warehouse.id} countId={null} warehouseName={local(warehouse.nameEn, warehouse.nameUr)} sheet={sheet} saved={{}}
            defaults={{ warehouseId: warehouse.id, date: businessToday(), notes: "", lines: sheet.map((p) => ({ productId: p.id, counted: "", notes: "" })) }}
          />
        )}
      </div>
    </>
  );
}
