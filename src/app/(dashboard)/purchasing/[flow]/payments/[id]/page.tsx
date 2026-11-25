import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Ban } from "lucide-react";
import { voidPaymentAction } from "@/features/purchasing/actions";
import { accountPay, flowOf, flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadPayment, seesAccount } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { sumPaisa, toPaisa } from "@/lib/utils/money";
import { ActionButton } from "@/components/documents/action-button";
import { DocumentLink } from "@/components/documents/document-link";
import { DocumentStatus } from "@/components/documents/document-status";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate } from "@/components/shared/format";
import { SectionCard } from "@/components/shared/section-card";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/payments/[id]">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.purchasing.payment };
}

export default async function PaymentPage({ params }: PageProps<"/purchasing/[flow]/payments/[id]">) {
  const { flow, id, ctx, t, locale, local } = await purchasingPage(params);
  if (!seesAccount(ctx, flow)) return <Forbidden />;
  const payment = await loadPayment(id);
  if (!payment || flowOf(payment.supplier.is_principal) !== flow) notFound();
  const p = t.purchasing;
  const d = t.documents;
  const settled = sumPaisa(payment.supplier_payment_allocations.map((a) => toPaisa(a.amount)));
  return (
    <>
      <PageHeader
        title={payment.doc_no}
        breadcrumbs={[{ label: p.tabs.payments, href: flowPath(flow, "payments") }]}
        description={<span className="flex flex-wrap items-center gap-3"><DocumentStatus status={payment.status} t={t} /><bdi>{local(payment.supplier.name, payment.supplier.name_ur)}</bdi></span>}
        actions={<><DocumentLink kind="supplier_receipt" params={{ id }} label={t.docs.pdf} />{payment.status === "posted" && can(ctx, accountPay(flow)) && (
          <ActionButton label={p.voidPayment} icon={<Ban aria-hidden />} variant="outline" action={voidPaymentAction.bind(null, id)} reasonLabel={d.reason} success={p.voided} confirm={{ title: p.voidTitle, description: p.voidHint, tone: "danger" }} />
        )}</>}
      />
      <div className="grid gap-6">
        <SectionCard title={p.payment}>
          <DescriptionList items={[
            { label: d.date, value: formatDate(payment.payment_date, locale) },
            { label: p.paymentAmount, value: <Money amount={toPaisa(payment.amount)} locale={locale} /> },
            { label: p.paidFrom, value: payment.account?.name },
            { label: p.method, value: p.methods[payment.method] },
            { label: d.reference, value: payment.reference && <Ltr>{payment.reference}</Ltr> },
            { label: p.onAccount, value: payment.status === "posted" ? <Money amount={toPaisa(payment.amount) - settled} locale={locale} /> : null },
            { label: d.journal, value: payment.journal && <Ltr>{payment.journal.doc_no}</Ltr> },
            { label: d.notes, value: payment.notes },
          ]} />
        </SectionCard>
        {payment.supplier_payment_allocations.length > 0 && (
          <SpecTable
            caption={p.allocate}
            rows={payment.supplier_payment_allocations.map((a) => ({ id: a.id, no: a.invoice.invoice_number, noHref: flowPath(flow, "bills", a.invoice.id), doc: a.invoice.doc_no, amount: a.amount }))}
            columns={[{ key: "no", sub: "doc", label: p.billNumber, kind: "link", primary: true }, { key: "amount", label: p.allocated, kind: "money", total: true }]}
            empty={{ title: d.empty }}
          />
        )}
      </div>
    </>
  );
}
