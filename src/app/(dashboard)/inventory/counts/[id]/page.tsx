import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteInventoryDraftAction, postCountAction } from "@/features/inventory/actions";
import { inventoryPage } from "@/features/inventory/page-context";
import { loadCount, loadOnHand } from "@/features/inventory/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { DocumentStatus } from "@/components/documents/document-status";
import { DraftActions } from "@/components/documents/draft-actions";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate, formatNumber } from "@/components/shared/format";
import { SectionCard } from "@/components/shared/section-card";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).stock.count };
}

export default async function CountPage({ params }: PageProps<"/inventory/counts/[id]">) {
  const { id, ctx, t, locale, local } = await inventoryPage(params);
  if (!can(ctx, "inventory.view")) return <Forbidden />;
  const doc = await loadCount(id);
  if (!doc) notFound();
  const s = t.stock;
  const draft = doc.status === "draft";
  const onHand = draft ? await loadOnHand(doc.warehouse_id) : null;
  const moved = (productId: string, system: number) => onHand !== null && (onHand.get(productId) ?? 0) !== system;
  const stale = doc.stock_count_items.some((i) => moved(i.product_id, i.system_quantity));
  const differences = doc.stock_count_items.filter((i) => i.difference !== 0).length;
  return (
    <>
      <PageHeader
        title={doc.doc_no}
        breadcrumbs={[{ label: s.tabs.counts, href: "/inventory/counts" }]}
        description={<DocumentStatus status={doc.status} t={t} />}
        actions={draft && (
          <DraftActions
            t={t} canEdit={can(ctx, "inventory.count")} canPost={can(ctx, "inventory.adjust") && !stale} editHref={`/inventory/counts/${id}/edit`} listHref="/inventory/counts"
            remove={deleteInventoryDraftAction.bind(null, "stock_counts", id)} post={postCountAction.bind(null, id)}
            postLabel={s.postCount} postConfirm={{ title: s.reconcileTitle, description: s.reconcile }}
          />
        )}
      />
      <div className="grid gap-6">
        {stale && <FormAlert tone="info">{s.recountHint}</FormAlert>}
        <SectionCard title={s.count}>
          <DescriptionList items={[
            { label: t.documents.warehouse, value: local(doc.warehouse.name_en, doc.warehouse.name_ur) },
            { label: t.documents.date, value: formatDate(doc.count_date, locale) },
            { label: s.differences, value: differences === 0 ? s.noDifferences : formatNumber(differences, locale) },
            { label: s.adjustment, value: doc.adjustment && <Link href={`/inventory/adjustments/${doc.adjustment.id}`} className="text-primary hover:underline"><Ltr>{doc.adjustment.doc_no}</Ltr></Link> },
            { label: t.documents.notes, value: doc.notes },
          ]} />
        </SectionCard>
        <SpecTable
          caption={t.documents.lines}
          rows={doc.stock_count_items.map((i) => ({
            id: i.id, product: local(i.product.name_en, i.product.name_ur), sku: i.product.sku, system: i.system_quantity, counted: i.counted_quantity, difference: i.difference, notes: i.notes,
            now: onHand ? onHand.get(i.product_id) ?? 0 : null, moved: moved(i.product_id, i.system_quantity) ? "yes" : null,
          }))}
          columns={[
            { key: "product", sub: "sku", label: t.documents.product, kind: "text", primary: true },
            { key: "system", label: s.system, kind: "quantity" }, { key: "counted", label: s.counted, kind: "quantity" }, { key: "difference", label: s.difference, kind: "quantity", total: true },
            ...(stale ? [
              { key: "now", label: s.onHand, kind: "quantity" as const },
              { key: "moved", label: t.common.status, kind: "status" as const, options: { yes: { label: s.recount, tone: "amber" as const } } },
            ] : []),
            { key: "notes", label: t.documents.notes, kind: "text", hideBelow: "lg" },
          ]}
          searchKeys={["product", "sku"]}
          empty={{ title: t.documents.noLines }}
        />
      </div>
    </>
  );
}
