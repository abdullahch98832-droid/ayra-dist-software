import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, FileMinus, Undo2 } from "lucide-react";
import { APP_CONFIG } from "@/config/app";
import { loadCustomerSummary } from "@/features/customers/queries";
import { seesSettlements } from "@/features/sales/access";
import { loadInvoice } from "@/features/sales/queries";
import { documentOptions, PAY_TONE } from "@/features/sales/status";
import { takerNames } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { toPaisa } from "@/lib/utils/money";
import { DocumentLink } from "@/components/documents/document-link";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { formatDate, formatNumber } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sales.invoice };
}

const ZERO = BigInt(0);

export default async function InvoicePage({ params }: PageProps<"/sales/invoices/[id]">) {
  const { id, ctx, t, locale, local } = await pageContext(params);
  const invoice = await loadInvoice(ctx, id);
  if (!invoice) notFound();
  const s = t.sales;
  const d = t.documents;
  const customer = invoice.customer;
  const [names, summary] = await Promise.all([takerNames(), can(ctx, "receivables.view") ? loadCustomerSummary(invoice.customer_id) : null]);
  const taker = names.get(invoice.order_taker_id ?? "");
  const outstanding = toPaisa(invoice.balance?.outstanding ?? 0);
  const settlements = seesSettlements(ctx);
  const status = invoice.balance?.payment_status ?? null;
  const money = (v: number | string | null | undefined) => <Money amount={toPaisa(v ?? 0)} locale={locale} />;
  const taxed = toPaisa(invoice.tax_total) !== ZERO;
  const discounted = invoice.sales_invoice_items.some((l) => l.discount_amount > 0);
  const totals: { label: string; value: React.ReactNode; strong?: boolean; show: boolean }[] = [
    { label: s.subtotal, value: money(invoice.subtotal), show: taxed },
    { label: s.tax, value: money(invoice.tax_total), show: taxed },
    { label: d.total, value: money(invoice.total_amount), strong: true, show: true },
    { label: s.returned, value: money(invoice.balance?.returned_amount), show: toPaisa(invoice.balance?.returned_amount ?? 0) !== ZERO },
    { label: s.credited, value: money(invoice.balance?.credited_amount), show: toPaisa(invoice.balance?.credited_amount ?? 0) !== ZERO },
    { label: s.paid, value: money(invoice.balance?.paid_amount), show: settlements },
    { label: s.outstanding, value: money(invoice.balance?.outstanding), strong: true, show: settlements },
  ];
  const statusLabel = status && ((s.payStatuses as Record<string, string>)[status] ?? status);

  return (
    <div className="page-portrait">
      <PageHeader
        title={invoice.doc_no}
        breadcrumbs={[{ label: s.tabs.invoices, href: "/sales/invoices" }]}
        description={<span className="flex flex-wrap items-center gap-3">{status && <StatusBadge tone={PAY_TONE[status] ?? "gray"}>{statusLabel}</StatusBadge>}<bdi>{local(customer.name, customer.name_ur)}</bdi></span>}
        actions={
          <>
            <DocumentLink kind="sales_invoice" params={{ id }} label={t.docs.pdf} />
            {can(ctx, "receivables.adjust") && outstanding > ZERO && <LinkButton variant="outline" href={`/receivables/notes/new?kind=credit&customer=${invoice.customer_id}&invoice=${id}`}><FileMinus aria-hidden />{t.receivables.newCredit}</LinkButton>}
            {can(ctx, "sales.return") && <LinkButton variant="outline" href={`/sales/returns/new?invoice=${id}`}><Undo2 aria-hidden />{s.newReturn}</LinkButton>}
            {can(ctx, "receivables.collect") && outstanding > ZERO && <LinkButton href={`/receivables/payments/new?customer=${invoice.customer_id}&invoice=${id}`}><Banknote aria-hidden />{s.recordPayment}</LinkButton>}
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <article className="rounded-2xl border bg-card p-5 shadow-card sm:p-8 print:border-0 print:p-0 print:shadow-none">
          <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-5">
            <div className="min-w-0">
              <p className="font-heading text-xl text-navy">{APP_CONFIG.name}</p>
              <p className="text-sm text-muted-foreground">{s.invoice}</p>
            </div>
            <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm">
              {([
                [s.invoiceNo, <Ltr key="n" className="font-semibold">{invoice.doc_no}</Ltr>], [s.invoiceDate, <bdi key="d">{formatDate(invoice.invoice_date, locale)}</bdi>],
                ...(invoice.due_date ? [[s.dueDate, <bdi key="u">{formatDate(invoice.due_date, locale)}</bdi>]] : []),
                ...(invoice.order ? [[s.order, <Link key="o" href={`/sales/orders/${invoice.order.id}`} className="hover:underline"><Ltr>{invoice.order.doc_no}</Ltr></Link>]] : []),
                ...(taker ? [[s.orderTaker, local(taker.nameEn, taker.nameUr)]] : []),
              ] as [string, React.ReactNode][]).map(([label, value]) => (
                <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="text-end">{value}</dd></div>
              ))}
            </dl>
          </header>
          <section className="py-5 text-sm">
            <p className="text-xs text-muted-foreground">{s.customer}</p>
            <p className="text-base font-semibold"><Link href={`/customers/${customer.id}`} className="hover:underline">{local(customer.name, customer.name_ur)}</Link></p>
            {customer.owner_name && <p>{customer.owner_name}</p>}
            <p className="text-muted-foreground">{[customer.address, customer.city].filter(Boolean).join(", ")}</p>
            {customer.phone && <Ltr className="text-muted-foreground">{customer.phone}</Ltr>}
          </section>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-muted/60 text-xs text-muted-foreground">
                  <th scope="col" className="px-2 py-2 text-start font-medium">{d.product}</th>
                  <th scope="col" className="px-2 py-2 text-end font-medium">{d.quantity}</th>
                  <th scope="col" className="max-sm:hidden print:table-cell px-2 py-2 text-end font-medium">{d.unitPrice}</th>
                  {discounted && <th scope="col" className="max-sm:hidden print:table-cell px-2 py-2 text-end font-medium">{s.discount}</th>}
                  {taxed && <th scope="col" className="max-sm:hidden print:table-cell px-2 py-2 text-end font-medium">{s.tax}</th>}
                  <th scope="col" className="px-2 py-2 text-end font-medium">{d.total}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoice.sales_invoice_items.map((l) => (
                  <tr key={l.id}>
                    <td className="px-2 py-2.5"><span className="font-medium">{local(l.product.name_en, l.product.name_ur)}</span> <Ltr className="block text-xs text-muted-foreground">{l.product.sku}</Ltr>
                      <span className="mt-1 grid gap-0.5 text-xs text-muted-foreground sm:hidden print:hidden">
                        <span>{d.unitPrice}: {money(l.unit_price)}</span>
                        {l.discount_amount > 0 && <span>{s.discount}: {money(l.discount_amount)}</span>}
                        {taxed && <span>{s.tax}: {money(l.tax_amount)}</span>}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-end whitespace-nowrap"><Ltr className="tabular-nums">{formatNumber(l.quantity, locale)}</Ltr> {local(l.unit.name_en, l.unit.name_ur)}</td>
                    <td className="max-sm:hidden print:table-cell px-2 py-2.5 text-end whitespace-nowrap">{money(l.unit_price)}</td>
                    {discounted && <td className="max-sm:hidden print:table-cell px-2 py-2.5 text-end whitespace-nowrap">{l.discount_amount > 0 ? money(l.discount_amount) : "—"}</td>}
                    {taxed && <td className="max-sm:hidden print:table-cell px-2 py-2.5 text-end whitespace-nowrap">{money(l.tax_amount)}</td>}
                    <td className="px-2 py-2.5 text-end whitespace-nowrap">{money(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="ms-auto mt-4 grid max-w-sm gap-1.5 border-t pt-4 text-sm">
            {totals.filter((x) => x.show).map((x) => (
              <div key={x.label} className={x.strong ? "flex justify-between gap-6 font-semibold text-navy" : "flex justify-between gap-6"}><dt className={x.strong ? "" : "text-muted-foreground"}>{x.label}</dt><dd>{x.value}</dd></div>
            ))}
            {summary?.balance !== undefined && <div className="flex justify-between gap-6 border-t pt-2"><dt className="text-muted-foreground">{s.previousBalance}</dt><dd>{money(summary.balance)}</dd></div>}
          </dl>
          <p className="hidden pt-16 text-sm print:block">{s.signature}: ______________________________</p>
        </article>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 print:hidden">
          {invoice.profit && invoice.profit.gross_profit !== null && (
            <p className="text-sm text-muted-foreground">{s.profit}: <Money amount={toPaisa(invoice.profit.gross_profit)} locale={locale} className="font-semibold text-foreground" /></p>
          )}
          {invoice.payments.length > 0 && (
            <section className="grid gap-3">
              <h2 className="text-base font-semibold text-navy">{t.receivables.tabs.payments}</h2>
              <SpecTable
                caption={t.receivables.tabs.payments}
                rows={invoice.payments.map((p) => ({ id: p.id, no: p.payment?.doc_no, noHref: p.payment ? `/receivables/payments/${p.payment.id}` : undefined, date: p.payment?.payment_date, method: p.payment ? t.purchasing.methods[p.payment.method] : null, amount: p.amount }))}
                columns={[{ key: "no", label: d.number, kind: "link", primary: true }, { key: "date", label: d.date, kind: "date" }, { key: "method", label: t.receivables.method, kind: "text" }, { key: "amount", label: t.receivables.settled, kind: "money", total: true }]}
                empty={{ title: t.receivables.paymentEmpty }}
              />
            </section>
          )}
          {(invoice.returns.length > 0 || invoice.notes.length > 0) && (
            <section className="grid gap-3">
              <h2 className="text-base font-semibold text-navy">{s.tabs.returns}</h2>
              <SpecTable
                caption={s.tabs.returns}
                rows={[
                  ...invoice.returns.map((r) => ({ id: r.id, no: r.doc_no, noHref: `/sales/returns/${r.id}`, date: r.return_date, reason: r.reason, total: r.total_amount, status: r.status as string })),
                  ...invoice.notes.map((n) => ({ id: n.id, no: n.doc_no, noHref: `/receivables/notes/${n.id}`, date: n.note_date, reason: n.reason, total: n.amount, status: n.status })),
                ]}
                columns={[
                  { key: "no", label: d.number, kind: "link", primary: true }, { key: "date", label: d.date, kind: "date" }, { key: "reason", label: d.reason, kind: "text", hideBelow: "lg" },
                  { key: "total", label: d.total, kind: "money" }, { key: "status", label: t.common.status, kind: "status", options: documentOptions(t) },
                ]}
                empty={{ title: s.returnEmpty }}
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
