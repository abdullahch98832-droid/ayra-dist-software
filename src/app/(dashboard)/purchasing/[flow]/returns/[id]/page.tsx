import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCheck, Pencil, Trash2 } from "lucide-react";
import { deletePurchasingDraftAction, postReturnAction } from "@/features/purchasing/actions";
import { flowOf, flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadReturn } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { toPaisa } from "@/lib/utils/money";
import { ActionButton } from "@/components/documents/action-button";
import { DocumentLink } from "@/components/documents/document-link";
import { DocumentStatus } from "@/components/documents/document-status";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/returns/[id]">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.purchasing.supplierReturn };
}

export default async function ReturnPage({ params }: PageProps<"/purchasing/[flow]/returns/[id]">) {
  const { flow, id, ctx, t, locale, local } = await purchasingPage(params);
  const doc = await loadReturn(id);
  if (!doc || flowOf(doc.supplier.is_principal) !== flow) notFound();
  const d = t.documents;
  const base = flowPath(flow, "returns");
  return (
    <>
      <PageHeader
        title={doc.doc_no}
        breadcrumbs={[{ label: t.purchasing.tabs.returns, href: base }]}
        description={<span className="flex flex-wrap items-center gap-3"><DocumentStatus status={doc.status} t={t} /><bdi>{local(doc.supplier.name, doc.supplier.name_ur)}</bdi></span>}
        actions={(
          <>
            <DocumentLink kind="supplier_return" params={{ id }} label={t.docs.pdf} />
            {doc.status === "draft" && can(ctx, "purchasing.create") && (
              <>
                <ActionButton label={d.deleteDraft} icon={<Trash2 aria-hidden />} variant="outline" action={deletePurchasingDraftAction.bind(null, "supplier_returns", id)} success={d.deleted} redirectTo={base} confirm={{ title: d.confirmDeleteTitle, description: d.confirmDelete, tone: "danger" }} />
                <LinkButton variant="outline" href={`${base}/${id}/edit`}><Pencil aria-hidden />{d.edit}</LinkButton>
              </>
            )}
            {doc.status === "draft" && can(ctx, "purchasing.post") && (
              <ActionButton label={d.post} icon={<CheckCheck aria-hidden />} action={postReturnAction.bind(null, id)} success={d.posted} confirm={{ title: d.confirmPostTitle, description: d.confirmPost }} />
            )}
          </>
        )}
      />
      <div className="grid gap-6">
        <SectionCard title={t.purchasing.supplierReturn}>
          <DescriptionList items={[
            { label: d.date, value: formatDate(doc.return_date, locale) },
            { label: t.purchasing.returnWarehouse, value: local(doc.warehouse.name_en, doc.warehouse.name_ur) },
            { label: d.total, value: <Money amount={toPaisa(doc.total_amount)} locale={locale} /> },
            { label: d.reason, value: doc.reason },
            { label: d.journal, value: doc.journal && <Ltr>{doc.journal.doc_no}</Ltr> },
          ]} />
        </SectionCard>
        <SpecTable
          caption={d.lines}
          rows={doc.supplier_return_items.map((l) => ({ id: l.id, product: local(l.product.name_en, l.product.name_ur), sku: l.product.sku, unit: local(l.unit.name_en, l.unit.name_ur), quantity: l.quantity, price: l.unit_price, total: l.line_total }))}
          columns={[
            { key: "product", sub: "sku", label: d.product, kind: "text", primary: true }, { key: "unit", label: d.unit, kind: "text" },
            { key: "quantity", label: d.quantity, kind: "quantity" }, { key: "price", label: t.purchasing.creditPrice, kind: "money" }, { key: "total", label: d.lineTotal, kind: "money", total: true },
          ]}
          empty={{ title: d.noLines }}
        />
      </div>
    </>
  );
}
