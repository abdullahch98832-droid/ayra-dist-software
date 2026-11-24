import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Banknote, CheckCheck, Pencil, Trash2 } from "lucide-react";
import { deletePurchasingDraftAction, postBillAction } from "@/features/purchasing/actions";
import { accountPay, flowOf, flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadBill } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { sumPaisa, toPaisa } from "@/lib/utils/money";
import { ActionButton } from "@/components/documents/action-button";
import { DocumentStatus } from "@/components/documents/document-status";
import { PageHeader } from "@/components/layout/page-header";
import { Money } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/bills/[id]">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.purchasing.bill };
}

export default async function BillPage({ params }: PageProps<"/purchasing/[flow]/bills/[id]">) {
  const { flow, id, ctx, t, locale, local } = await purchasingPage(params);
  const bill = await loadBill(id);
  if (!bill || flowOf(bill.is_principal ?? false) !== flow) notFound();
  const p = t.purchasing;
  const d = t.documents;
  const base = flowPath(flow, "bills");
  const receiptsTotal = sumPaisa(bill.receipts.map((r) => toPaisa(r.total_amount)));
  const money = (v: number | null) => (v === null ? null : <Money amount={toPaisa(v)} locale={locale} />);

  return (
    <>
      <PageHeader
        title={bill.invoice_number ?? ""}
        breadcrumbs={[{ label: p.tabs.bills, href: base }]}
        description={<span className="flex flex-wrap items-center gap-3"><DocumentStatus status={bill.status ?? "draft"} t={t} /><bdi>{local(bill.supplier_name ?? "", bill.supplier_name_ur)}</bdi></span>}
        actions={
          <>
            {bill.status === "draft" && can(ctx, "purchasing.create") && (
              <>
                <ActionButton label={d.deleteDraft} icon={<Trash2 aria-hidden />} variant="outline" action={deletePurchasingDraftAction.bind(null, "supplier_invoices", id)} success={d.deleted} redirectTo={base} confirm={{ title: d.confirmDeleteTitle, description: d.confirmDelete, tone: "danger" }} />
                <LinkButton variant="outline" href={`${base}/${id}/edit`}><Pencil aria-hidden />{d.edit}</LinkButton>
              </>
            )}
            {bill.status === "draft" && can(ctx, "purchasing.post") && (
              <ActionButton label={d.post} icon={<CheckCheck aria-hidden />} action={postBillAction.bind(null, id)} success={d.posted} confirm={{ title: d.confirmPostTitle, description: p.confirmPostBill }} />
            )}
            {bill.status === "posted" && (bill.outstanding ?? 0) > 0 && can(ctx, accountPay(flow)) && (
              <LinkButton href={`${flowPath(flow, "payments", "new")}?bill=${id}`}><Banknote aria-hidden />{p.payBill}</LinkButton>
            )}
          </>
        }
      />
      <div className="grid gap-6">
        <SectionCard title={p.bill}>
          <DescriptionList items={[
            { label: d.number, value: bill.doc_no },
            { label: p.billDate, value: formatDate(bill.invoice_date, locale) },
            { label: p.dueDate, value: formatDate(bill.due_date, locale) },
            { label: p.amount, value: money(bill.amount) },
            { label: p.receiptsTotal, value: <Money amount={receiptsTotal} locale={locale} /> },
            { label: p.variance, value: <Money amount={toPaisa(bill.amount ?? 0) - receiptsTotal} locale={locale} /> },
            ...(bill.paid_amount === null ? [] : [{ label: p.paid, value: money(bill.paid_amount) }, { label: p.outstanding, value: money(bill.outstanding) }]),
            { label: d.notes, value: bill.notes },
          ]} />
        </SectionCard>
        <section className="grid gap-3">
          <h2 className="text-base font-semibold text-navy">{p.chooseReceipts}</h2>
          <SpecTable
            caption={p.chooseReceipts}
            rows={bill.receipts.map((r) => ({ id: r.id, no: r.doc_no, noHref: flowPath(flow, "receipts", r.id), date: r.receipt_date, total: r.total_amount }))}
            columns={[{ key: "no", label: d.number, kind: "link", primary: true }, { key: "date", label: d.date, kind: "date" }, { key: "total", label: d.total, kind: "money", total: true }]}
            empty={{ title: d.empty }}
          />
        </section>
        {bill.payments.length > 0 && (
          <section className="grid gap-3">
            <h2 className="text-base font-semibold text-navy">{p.tabs.payments}</h2>
            <SpecTable
              caption={p.tabs.payments}
              rows={bill.payments.map((a) => ({ id: a.id, no: a.payment.doc_no, noHref: flowPath(flow, "payments", a.payment.id), date: a.payment.payment_date, method: p.methods[a.payment.method], amount: a.amount }))}
              columns={[
                { key: "no", label: d.number, kind: "link", primary: true }, { key: "date", label: d.date, kind: "date" },
                { key: "method", label: p.method, kind: "text" }, { key: "amount", label: p.allocated, kind: "money", total: true },
              ]}
              empty={{ title: d.empty }}
            />
          </section>
        )}
      </div>
    </>
  );
}
