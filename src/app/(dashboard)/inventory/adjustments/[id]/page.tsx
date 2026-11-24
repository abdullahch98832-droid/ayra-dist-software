import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteInventoryDraftAction, postAdjustmentAction } from "@/features/inventory/actions";
import { inventoryPage } from "@/features/inventory/page-context";
import { loadAdjustment } from "@/features/inventory/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { toPaisa } from "@/lib/utils/money";
import { DocumentStatus } from "@/components/documents/document-status";
import { DraftActions } from "@/components/documents/draft-actions";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate } from "@/components/shared/format";
import { SectionCard } from "@/components/shared/section-card";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).stock.adjustment };
}

export default async function AdjustmentPage({ params }: PageProps<"/inventory/adjustments/[id]">) {
  const { id, ctx, t, locale, local } = await inventoryPage(params);
  if (!can(ctx, "inventory.view")) return <Forbidden />;
  const doc = await loadAdjustment(ctx, id);
  if (!doc) notFound();
  const s = t.stock;
  const allowed = can(ctx, "inventory.adjust");
  const posted = doc.status === "posted";
  return (
    <>
      <PageHeader
        title={doc.doc_no}
        breadcrumbs={[{ label: s.tabs.adjustments, href: "/inventory/adjustments" }]}
        description={<span className="flex flex-wrap items-center gap-3"><DocumentStatus status={doc.status} t={t} />{s.kinds[doc.kind]}</span>}
        actions={doc.status === "draft" && doc.kind !== "count" && (
          <DraftActions
            t={t} canEdit={allowed} canPost={allowed} editHref={`/inventory/adjustments/${id}/edit`} listHref="/inventory/adjustments"
            remove={deleteInventoryDraftAction.bind(null, "stock_adjustments", id)} post={postAdjustmentAction.bind(null, id)}
            postConfirm={{ title: t.documents.confirmPostTitle, description: `${s.kindHints[doc.kind]} ${t.documents.confirmPost}` }}
          />
        )}
      />
      <div className="grid gap-6">
        <SectionCard title={s.adjustment}>
          <DescriptionList items={[
            { label: t.documents.warehouse, value: local(doc.warehouse.name_en, doc.warehouse.name_ur) },
            { label: t.documents.date, value: formatDate(doc.adjustment_date, locale) },
            { label: t.documents.reason, value: doc.reason },
            { label: t.documents.journal, value: doc.journal && <Ltr>{doc.journal.doc_no}</Ltr> },
            ...(posted && doc.valueTotal !== null ? [{ label: s.valueChange, value: <Money amount={toPaisa(doc.valueTotal)} locale={locale} /> }] : []),
          ]} />
        </SectionCard>
        <SpecTable
          caption={t.documents.lines}
          rows={doc.stock_adjustment_items.map((l) => ({
            id: l.id, product: local(l.product.name_en, l.product.name_ur), sku: l.product.sku, unit: local(l.unit.name_en, l.unit.name_ur), quantity: l.quantity, base: l.base_quantity, notes: l.notes,
            cost: doc.costs?.get(l.id)?.unit_cost, value: doc.costs?.get(l.id)?.value_change,
          }))}
          columns={[
            { key: "product", sub: "sku", label: t.documents.product, kind: "text", primary: true }, { key: "unit", label: t.documents.unit, kind: "text" },
            { key: "quantity", label: t.documents.quantity, kind: "quantity" }, { key: "base", label: t.documents.baseQuantity, kind: "quantity", hideBelow: "lg" },
            ...(doc.costs ? [
              { key: "cost", label: t.documents.unitCost, kind: "money" as const, hideBelow: "lg" as const },
              ...(posted ? [{ key: "value", label: s.valueChange, kind: "money" as const, total: true }] : []),
            ] : []),
            { key: "notes", label: t.documents.notes, kind: "text", hideBelow: "xl" },
          ]}
          empty={{ title: t.documents.noLines }}
        />
      </div>
    </>
  );
}
