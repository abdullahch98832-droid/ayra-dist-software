import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteInventoryDraftAction, postTransferAction } from "@/features/inventory/actions";
import { inventoryPage } from "@/features/inventory/page-context";
import { loadTransfer } from "@/features/inventory/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { DocumentStatus } from "@/components/documents/document-status";
import { DraftActions } from "@/components/documents/draft-actions";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate } from "@/components/shared/format";
import { SectionCard } from "@/components/shared/section-card";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).stock.transfer };
}

export default async function TransferPage({ params }: PageProps<"/inventory/transfers/[id]">) {
  const { id, ctx, t, locale, local } = await inventoryPage(params);
  if (!can(ctx, "inventory.view")) return <Forbidden />;
  const doc = await loadTransfer(id);
  if (!doc) notFound();
  const s = t.stock;
  const allowed = can(ctx, "inventory.transfer");
  return (
    <>
      <PageHeader
        title={doc.doc_no}
        breadcrumbs={[{ label: s.tabs.transfers, href: "/inventory/transfers" }]}
        description={<DocumentStatus status={doc.status} t={t} />}
        actions={doc.status === "draft" && (
          <DraftActions
            t={t} canEdit={allowed} canPost={allowed} editHref={`/inventory/transfers/${id}/edit`} listHref="/inventory/transfers"
            remove={deleteInventoryDraftAction.bind(null, "stock_transfers", id)} post={postTransferAction.bind(null, id)}
            postConfirm={{ title: t.documents.confirmPostTitle, description: s.confirmTransfer }}
          />
        )}
      />
      <div className="grid gap-6">
        <SectionCard title={s.transfer}>
          <DescriptionList items={[
            { label: s.fromWarehouse, value: local(doc.from.name_en, doc.from.name_ur) },
            { label: s.toWarehouse, value: local(doc.to.name_en, doc.to.name_ur) },
            { label: t.documents.date, value: formatDate(doc.transfer_date, locale) },
            { label: t.documents.notes, value: doc.notes },
          ]} />
        </SectionCard>
        <SpecTable
          caption={t.documents.lines}
          rows={doc.stock_transfer_items.map((l) => ({ id: l.id, product: local(l.product.name_en, l.product.name_ur), sku: l.product.sku, unit: local(l.unit.name_en, l.unit.name_ur), quantity: l.quantity, base: l.base_quantity }))}
          columns={[
            { key: "product", sub: "sku", label: t.documents.product, kind: "text", primary: true }, { key: "unit", label: t.documents.unit, kind: "text" },
            { key: "quantity", label: t.documents.quantity, kind: "quantity" }, { key: "base", label: t.documents.baseQuantity, kind: "quantity" },
          ]}
          empty={{ title: t.documents.noLines }}
        />
      </div>
    </>
  );
}
