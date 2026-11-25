import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCheck, Pencil, ReceiptText, Trash2 } from "lucide-react";
import { deletePurchasingDraftAction, postReceiptAction } from "@/features/purchasing/actions";
import { flowOf, flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadBill, loadReceipt } from "@/features/purchasing/queries";
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

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/receipts/[id]">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.purchasing.receipt };
}

export default async function ReceiptPage({ params }: PageProps<"/purchasing/[flow]/receipts/[id]">) {
  const { flow, id, ctx, t, locale, local } = await purchasingPage(params);
  const receipt = await loadReceipt(id);
  if (!receipt || flowOf(receipt.supplier.is_principal) !== flow) notFound();
  const bill = receipt.supplier_invoice_receipts ? await loadBill(receipt.supplier_invoice_receipts.supplier_invoice_id) : null;
  const p = t.purchasing;
  const d = t.documents;
  const base = flowPath(flow, "receipts");
  const link = (href: string, label: string) => <Link href={href} className="text-primary hover:underline"><Ltr>{label}</Ltr></Link>;

  return (
    <>
      <PageHeader
        title={receipt.doc_no}
        breadcrumbs={[{ label: p.tabs.receipts, href: base }]}
        description={<span className="flex flex-wrap items-center gap-3"><DocumentStatus status={receipt.status} t={t} /><bdi>{local(receipt.supplier.name, receipt.supplier.name_ur)}</bdi></span>}
        actions={
          <>
            <DocumentLink kind="goods_receipt" params={{ id }} label={t.docs.pdf} />
            {receipt.status === "draft" && can(ctx, "purchasing.create") && (
              <>
                <ActionButton label={d.deleteDraft} icon={<Trash2 aria-hidden />} variant="outline" action={deletePurchasingDraftAction.bind(null, "goods_receipts", id)} success={d.deleted} redirectTo={base} confirm={{ title: d.confirmDeleteTitle, description: d.confirmDelete, tone: "danger" }} />
                <LinkButton variant="outline" href={`${base}/${id}/edit`}><Pencil aria-hidden />{d.edit}</LinkButton>
              </>
            )}
            {receipt.status === "draft" && can(ctx, "purchasing.post") && (
              <ActionButton label={d.post} icon={<CheckCheck aria-hidden />} action={postReceiptAction.bind(null, id)} success={d.posted} confirm={{ title: d.confirmPostTitle, description: d.confirmPost }} />
            )}
            {receipt.status === "posted" && receipt.total_amount > 0 && !receipt.supplier_invoice_receipts && can(ctx, "purchasing.create") && (
              <LinkButton href={`${flowPath(flow, "bills", "new")}?receipt=${id}`}><ReceiptText aria-hidden />{p.newBill}</LinkButton>
            )}
          </>
        }
      />
      <div className="grid gap-6">
        <SectionCard title={p.receipt}>
          <DescriptionList items={[
            { label: d.date, value: formatDate(receipt.receipt_date, locale) },
            { label: p.supplierReference, value: receipt.supplier_reference && <Ltr>{receipt.supplier_reference}</Ltr> },
            { label: p.againstOrder, value: receipt.order ? link(flowPath(flow, "orders", receipt.order.id), receipt.order.doc_no) : p.withoutOrder },
            { label: d.warehouse, value: local(receipt.warehouse.name_en, receipt.warehouse.name_ur) },
            { label: p.damagedWarehouse, value: receipt.damaged_warehouse && local(receipt.damaged_warehouse.name_en, receipt.damaged_warehouse.name_ur) },
            { label: p.receiptTotal, value: <Money amount={toPaisa(receipt.total_amount)} locale={locale} /> },
            ...(receipt.status === "posted" && receipt.total_amount > 0 ? [
              { label: p.bill, value: bill?.supplier_invoice_id ? link(flowPath(flow, "bills", bill.supplier_invoice_id), bill.invoice_number ?? "") : p.notBilled },
              ...(bill && bill.paid_amount !== null ? [
                { label: p.billPaid, value: <Money amount={toPaisa(bill.paid_amount)} locale={locale} /> },
                { label: p.billOutstanding, value: bill.outstanding === null ? null : <Money amount={toPaisa(bill.outstanding)} locale={locale} /> },
              ] : []),
            ] : []),
            { label: d.journal, value: receipt.journal && <Ltr>{receipt.journal.doc_no}</Ltr> },
            { label: d.notes, value: receipt.notes },
          ]} />
        </SectionCard>
        <section className="grid gap-3">
          <h2 className="text-base font-semibold text-navy">{d.lines}</h2>
          <SpecTable
            caption={d.lines}
            rows={receipt.goods_receipt_items.map((l) => ({
              id: l.id, product: local(l.product.name_en, l.product.name_ur), sku: l.product.sku, unit: local(l.unit.name_en, l.unit.name_ur), expected: l.expected_quantity,
              accepted: l.quantity, damaged: l.damaged_quantity, rejected: l.rejected_quantity, cost: l.unit_cost, total: l.line_total,
            }))}
            columns={[
              { key: "product", sub: "sku", label: d.product, kind: "text", primary: true },
              { key: "unit", label: d.unit, kind: "text" },
              { key: "expected", label: p.expected, kind: "quantity", hideBelow: "lg" },
              { key: "accepted", label: p.accepted, kind: "quantity" },
              { key: "damaged", label: p.damaged, kind: "quantity" },
              { key: "rejected", label: p.rejected, kind: "quantity" },
              { key: "cost", label: d.unitCost, kind: "money", hideBelow: "lg" },
              { key: "total", label: d.lineTotal, kind: "money", total: true },
            ]}
            empty={{ title: d.noLines }}
          />
        </section>
      </div>
    </>
  );
}
