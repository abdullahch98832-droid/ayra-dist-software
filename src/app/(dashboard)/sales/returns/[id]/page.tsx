import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteSalesDraftAction, postReturnAction } from "@/features/sales/actions";
import { loadReturn } from "@/features/sales/queries";
import { DOCUMENT_TONE } from "@/features/sales/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { toPaisa } from "@/lib/utils/money";
import { DraftActions } from "@/components/documents/draft-actions";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate } from "@/components/shared/format";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sales.customerReturn };
}

export default async function ReturnPage({ params }: PageProps<"/sales/returns/[id]">) {
  const { id, ctx, t, locale, local } = await pageContext(params);
  const doc = await loadReturn(id);
  if (!doc) notFound();
  const s = t.sales;
  const d = t.documents;
  const allowed = can(ctx, "sales.return");
  const link = (href: string, label: string) => <Link href={href} className="text-primary hover:underline"><Ltr>{label}</Ltr></Link>;
  return (
    <>
      <PageHeader
        title={doc.doc_no}
        breadcrumbs={[{ label: s.tabs.returns, href: "/sales/returns" }]}
        description={<span className="flex flex-wrap items-center gap-3"><StatusBadge tone={DOCUMENT_TONE[doc.status] ?? "gray"}>{t.purchasing.statuses[doc.status]}</StatusBadge><bdi>{local(doc.customer.name, doc.customer.name_ur)}</bdi></span>}
        actions={doc.status === "draft" && (
          <DraftActions
            t={t} canEdit={allowed} canPost={allowed} editHref={`/sales/returns/${id}/edit`} listHref="/sales/returns"
            remove={deleteSalesDraftAction.bind(null, "customer_returns", id)} post={postReturnAction.bind(null, id)}
            postConfirm={{ title: d.confirmPostTitle, description: s.postReturnHint }}
          />
        )}
      />
      <div className="grid gap-6">
        <SectionCard title={s.customerReturn}>
          <DescriptionList items={[
            { label: s.customer, value: <Link href={`/customers/${doc.customer.id}`} className="text-primary hover:underline">{local(doc.customer.name, doc.customer.name_ur)}</Link> },
            { label: d.date, value: formatDate(doc.return_date, locale) },
            { label: s.invoiceNo, value: doc.invoice ? link(`/sales/invoices/${doc.invoice.id}`, doc.invoice.doc_no) : s.withoutInvoice },
            ...(doc.delivery ? [{ label: s.delivery, value: link(`/sales/deliveries/${doc.delivery.id}`, doc.delivery.doc_no) }] : []),
            { label: s.returnWarehouse, value: local(doc.warehouse.name_en, doc.warehouse.name_ur) },
            { label: s.damagedWarehouse, value: doc.damaged && local(doc.damaged.name_en, doc.damaged.name_ur) },
            { label: d.reason, value: doc.reason },
            { label: s.tax, value: <Money amount={toPaisa(doc.tax_total)} locale={locale} /> },
            { label: d.total, value: <Money amount={toPaisa(doc.total_amount)} locale={locale} className="font-semibold" /> },
            { label: d.journal, value: doc.journal && <Ltr>{doc.journal.doc_no}</Ltr> },
          ]} />
        </SectionCard>
        <SpecTable
          caption={s.lines}
          rows={doc.customer_return_items.map((l) => ({
            id: l.id, product: local(l.product.name_en, l.product.name_ur), sku: l.product.sku, unit: local(l.unit.name_en, l.unit.name_ur), quantity: l.quantity, condition: l.condition,
            price: l.unit_price, discount: l.discount_amount || null, tax: l.tax_amount || null, total: l.line_total,
          }))}
          columns={[
            { key: "product", sub: "sku", label: d.product, kind: "text", primary: true }, { key: "quantity", sub: "unit", label: d.quantity, kind: "quantity" },
            { key: "condition", label: s.condition, kind: "status", options: { saleable: { label: s.conditions.saleable, tone: "green" }, damaged: { label: s.conditions.damaged, tone: "red" } } },
            { key: "price", label: s.returnPrice, kind: "money", hideBelow: "lg" }, { key: "discount", label: s.discount, kind: "money", hideBelow: "xl" }, { key: "tax", label: s.tax, kind: "money", hideBelow: "lg" },
            { key: "total", label: d.lineTotal, kind: "money", total: true },
          ]}
          empty={{ title: d.noLines }}
        />
      </div>
    </>
  );
}
