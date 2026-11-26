import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, CheckCheck, Trash2 } from "lucide-react";
import { z } from "zod";
import { deleteReceivableDraftAction, postPaymentAction, voidPaymentAction } from "@/features/receivables/actions";
import { loadOpenInvoices, loadPayment } from "@/features/receivables/queries";
import { ContributorsList } from "@/features/payments/contributors-list";
import { DOCUMENT_TONE } from "@/features/sales/status";
import { takerNames } from "@/features/takers/queries";
import { fill } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { sumPaisa, toDbAmount, toPaisa } from "@/lib/utils/money";
import { DocumentLink } from "@/components/documents/document-link";
import { ActionButton } from "@/components/documents/action-button";
import { FormAlert } from "@/components/forms/field";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate } from "@/components/shared/format";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { SpecTable } from "@/components/tables/spec-table";
import { SettleForm } from "./settle-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).receivables.payment };
}

const requested = z.array(z.object({ invoice_id: z.string(), amount: z.union([z.string(), z.number()]) })).nullable().catch(null);

export default async function PaymentPage({ params }: PageProps<"/receivables/payments/[id]">) {
  const { id, ctx, t, locale, local } = await pageContext(params);
  const payment = await loadPayment(id);
  if (!payment) notFound();
  const r = t.receivables;
  const d = t.documents;
  const draft = payment.status === "draft";
  const posted = payment.status === "posted";
  const poster = can(ctx, "receivables.post");
  const settled = sumPaisa(payment.customer_payment_allocations.map((a) => toPaisa(a.amount)));
  const left = toPaisa(payment.amount) - settled;
  const asked = draft ? requested.parse(payment.requested_allocations) ?? [] : [];
  const settle = posted && poster && left > BigInt(0);
  const [names, open] = await Promise.all([takerNames(), settle || asked.length ? loadOpenInvoices(payment.customer_id) : []]);
  const collector = names.get(payment.collected_by ?? "");
  // Received by more than one person: each with their share, in place of one account.
  const split = Array.isArray(payment.contributors) && payment.contributors.length > 0;
  return (
    <>
      <PageHeader
        title={payment.doc_no}
        breadcrumbs={[{ label: r.tabs.payments, href: "/receivables/payments" }]}
        description={<span className="flex flex-wrap items-center gap-3"><StatusBadge tone={DOCUMENT_TONE[payment.status] ?? "gray"}>{t.purchasing.statuses[payment.status]}</StatusBadge><bdi>{payment.customer && local(payment.customer.name, payment.customer.name_ur)}</bdi></span>}
        actions={
          <>
            {!draft && <DocumentLink kind={payment.sol_job ? "sol_receipt" : "customer_receipt"} params={{ id }} label={t.docs.pdf} />}
            {draft && can(ctx, "receivables.collect") && <ActionButton label={d.deleteDraft} icon={<Trash2 aria-hidden />} variant="outline" action={deleteReceivableDraftAction.bind(null, "customer_payments", id)} success={d.deleted} redirectTo="/receivables/payments" confirm={{ title: d.confirmDeleteTitle, description: d.confirmDelete, tone: "danger" }} />}
            {posted && poster && <ActionButton label={r.void} icon={<Ban aria-hidden />} variant="outline" action={voidPaymentAction.bind(null, id)} reasonLabel={d.reason} success={r.voided} confirm={{ title: r.voidTitle, description: r.voidHint, tone: "danger" }} />}
            {draft && poster && <ActionButton label={r.post} icon={<CheckCheck aria-hidden />} action={postPaymentAction.bind(null, id)} success={r.posted} confirm={{ title: r.postTitle, description: r.postHint }} />}
          </>
        }
      />
      <div className="grid gap-6">
        {payment.void_reason && <FormAlert tone="info">{fill(r.voidNote, { reason: payment.void_reason })}</FormAlert>}
        <SectionCard title={r.payment}>
          <DescriptionList items={[
            { label: t.sales.customer, value: payment.customer && <Link href={`/customers/${payment.customer_id}`} className="text-primary hover:underline">{local(payment.customer.name, payment.customer.name_ur)}</Link> },
            { label: r.date, value: formatDate(payment.payment_date, locale) },
            { label: r.amount, value: <Money amount={toPaisa(payment.amount)} locale={locale} className="font-semibold" /> },
            { label: r.method, value: t.purchasing.methods[payment.method] },
            { label: r.destination, value: split ? <ContributorsList contributors={payment.contributors} locale={locale} /> : payment.account?.name ?? (payment.financial_account_id ? null : r.heldByTaker) },
            ...(payment.payer_account ? [{ label: t.sol.payerAccount, value: <Ltr>{payment.payer_account}</Ltr> }] : []),
            ...(payment.sol_job ? [{ label: t.sol.job, value: can(ctx, "sol.view") ? <Link href={`/sol/jobs/${payment.sol_job.id}`} className="text-primary hover:underline"><Ltr>{payment.sol_job.doc_no}</Ltr></Link> : <Ltr>{payment.sol_job.doc_no}</Ltr> }] : []),
            { label: r.collectedBy, value: collector ? local(collector.nameEn, collector.nameUr) : payment.collected_by ? null : r.nobody },
            { label: r.reference, value: payment.reference && <Ltr>{payment.reference}</Ltr> },
            ...(posted ? [{ label: r.onAccount, value: <Money amount={left} locale={locale} /> }] : []),
            { label: d.journal, value: payment.journal && <Ltr>{payment.journal.doc_no}</Ltr> },
            { label: d.notes, value: payment.notes },
          ]} />
        </SectionCard>
        {payment.customer_payment_allocations.length > 0 && (
          <SpecTable
            caption={r.settled}
            rows={payment.customer_payment_allocations.map((a) => ({ id: a.id, no: a.invoice?.doc_no ?? a.job?.doc_no, noHref: a.invoice ? `/sales/invoices/${a.invoice.id}` : a.job && can(ctx, "sol.view") ? `/sol/jobs/${a.job.id}` : undefined, amount: a.amount }))}
            columns={[{ key: "no", label: t.sales.invoiceNo, kind: "link", primary: true }, { key: "amount", label: r.settled, kind: "money", total: true }]}
            empty={{ title: r.noOpenInvoices }}
          />
        )}
        {asked.length > 0 && (
          <section className="grid gap-3">
            <h2 className="text-base font-semibold text-navy">{r.requested}</h2>
            <SpecTable
              caption={r.requested}
              rows={asked.map((a) => ({ id: a.invoice_id, no: open.find((i) => i.id === a.invoice_id)?.number ?? "—", amount: a.amount }))}
              columns={[{ key: "no", label: t.sales.invoiceNo, kind: "text", primary: true }, { key: "amount", label: r.amount, kind: "money", total: true }]}
              empty={{ title: r.noOpenInvoices }}
            />
          </section>
        )}
        {settle && open.length > 0 && <div className="print:hidden"><SettleForm key={toDbAmount(left)} paymentId={id} invoices={open} available={toDbAmount(left)} /></div>}
      </div>
    </>
  );
}
