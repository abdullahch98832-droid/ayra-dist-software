import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { inventoryPage } from "@/features/inventory/page-context";
import { loadCount, loadCountSheet } from "@/features/inventory/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { CountForm } from "../../count-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).documents.edit };
}

export default async function EditCountPage({ params }: PageProps<"/inventory/counts/[id]/edit">) {
  const { id, ctx, t, local } = await inventoryPage(params);
  if (!can(ctx, "inventory.count")) return <Forbidden />;
  const doc = await loadCount(id);
  if (!doc || doc.status !== "draft") notFound();
  const sheet = await loadCountSheet(doc.warehouse_id);
  const saved = new Map(doc.stock_count_items.map((i) => [i.product_id, i]));
  return (
    <>
      <PageHeader title={`${t.documents.edit} ${doc.doc_no}`} breadcrumbs={[{ label: t.stock.tabs.counts, href: "/inventory/counts" }]} />
      <CountForm
        countId={id} warehouseName={local(doc.warehouse.name_en, doc.warehouse.name_ur)} sheet={sheet}
        saved={Object.fromEntries(doc.stock_count_items.map((i) => [i.product_id, i.system_quantity]))}
        defaults={{
          warehouseId: doc.warehouse_id, date: doc.count_date, notes: doc.notes ?? "",
          lines: sheet.map((p) => {
            const line = saved.get(p.id);
            return { productId: p.id, counted: line ? String(line.counted_quantity) : "", notes: line?.notes ?? "" };
          }),
        }}
      />
    </>
  );
}
