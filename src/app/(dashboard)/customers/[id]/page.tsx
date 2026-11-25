import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, Clock, CreditCard, FilePlus2, HandCoins, MessageCircle, Pencil, Phone, ShoppingCart } from "lucide-react";
import { loadCustomer, loadCustomerStatement, loadCustomerSummary } from "@/features/customers/queries";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { loadOrders } from "@/features/sales/queries";
import { orderOptions } from "@/features/sales/status";
import { takerNames } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { phoneHref, whatsappHref } from "@/lib/utils/phone";
import { formatPaisa, sumPaisa, toPaisa } from "@/lib/utils/money";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { DocumentLink } from "@/components/documents/document-link";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatGrid } from "@/components/shared/stat-grid";
import { StatusBadge } from "@/components/shared/status-badge";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).customers.title };
}

const documentHref = (kind: string, id: string | null, customerId: string): string | null => {
  if (!id) return null;
  switch (kind) {
    case "sales_invoice": return `/sales/invoices/${id}`;
    case "customer_payment": return `/receivables/payments/${id}`;
    case "customer_return": return `/sales/returns/${id}`;
    case "opening": case "credit_note": case "debit_note": return `/receivables/notes/${id}`;
    case "sol_job": return `/sol/jobs/${id}`;
    default: return `/customers/${customerId}`;
  }
};

export default async function CustomerPage({ params, searchParams }: PageProps<"/customers/[id]">) {
  const { id, ctx, t, locale, local } = await pageContext(params);
  if (!can(ctx, "customers.view")) return <Forbidden />;
  const customer = await loadCustomer(id);
  if (!customer) notFound();
  const c = t.customers;
  const ledger = can(ctx, "receivables.view");
  const seesOrders = can(ctx, "sales.view") || can(ctx, "sales.view_all");
  const today = businessToday();
  const period = parsePeriod(await searchParams, today);
  const [summary, statement, orders, names] = await Promise.all([
    loadCustomerSummary(id),
    ledger ? loadCustomerStatement(id, period.from, period.to) : [],
    seesOrders ? loadOrders({ q: "", status: "", page: 1, supplierId: null, customerId: id }) : { rows: [], total: 0 },
    takerNames(),
  ]);
  const taker = names.get(customer.order_taker_id ?? "");
  const money = (v: string | undefined) => (v === undefined ? "—" : <Ltr>{formatPaisa(toPaisa(v), locale)}</Ltr>);
  const kinds = c.kinds as Record<string, string>;

  // Reversals are shown against the kind they undo, so each figure is what really happened in the period.
  const net = (match: (kind: string) => boolean) =>
    sumPaisa(statement.filter((l) => match(l.kind)).map((l) => toPaisa(l.debit) - toPaisa(l.credit)));
  const opening = statement[0] ? toPaisa(statement[0].balance) : BigInt(0);
  const figures: { label: string; value: bigint; strong?: boolean }[] = [
    { label: c.broughtForward, value: opening + net((k) => k === "opening") },
    { label: kinds.sales_invoice ?? "", value: net((k) => k === "sales_invoice" || k === "sol_job") },
    { label: kinds.debit_note ?? "", value: net((k) => k === "debit_note" || k === "manual") },
    { label: kinds.customer_payment ?? "", value: net((k) => k === "customer_payment") },
    { label: kinds.customer_return ?? "", value: net((k) => k === "customer_return") },
    { label: kinds.credit_note ?? "", value: net((k) => k === "credit_note") },
  ];
  const closing = sumPaisa(figures.map((f) => f.value));
  const tel = phoneHref(customer.phone);
  const chat = whatsappHref(customer.whatsapp);

  return (
    <>
      <PageHeader
        title={local(customer.name, customer.name_ur)}
        breadcrumbs={[{ label: c.title, href: "/customers" }]}
        description={<span className="flex flex-wrap items-center gap-3"><Ltr className="font-mono text-xs">{customer.code}</Ltr><StatusBadge tone={customer.is_active ? "green" : "gray"}>{customer.is_active ? c.active : c.inactive}</StatusBadge></span>}
        actions={
          <>
            {ledger && <DocumentLink kind="customer_statement" params={{ customer: id, range: "custom", from: period.from, to: period.to }} label={t.docs.statement} />}
            {can(ctx, "customers.manage") && <LinkButton variant="outline" href={`/customers/${id}/edit`}><Pencil aria-hidden />{c.edit}</LinkButton>}
            {can(ctx, "receivables.adjust") && <LinkButton variant="outline" href={`/receivables/notes/new?customer=${id}`}><FilePlus2 aria-hidden />{t.receivables.note}</LinkButton>}
            {can(ctx, "receivables.collect") && <LinkButton variant="outline" href={`/receivables/payments/new?customer=${id}`}><Banknote aria-hidden />{t.receivables.newPayment}</LinkButton>}
            {can(ctx, "sales.create") && customer.is_active && <LinkButton href={`/sales/orders/new?customer=${id}`}><ShoppingCart aria-hidden />{t.sales.newOrder}</LinkButton>}
          </>
        }
      />
      <div className="grid gap-6">
        <StatGrid>
          {ledger && <StatCard label={c.balance} value={money(summary.balance)} icon={HandCoins} hint={summary.unallocated !== undefined && toPaisa(summary.unallocated) > BigInt(0) ? <>{c.onAccount}: {money(summary.unallocated)}</> : undefined} />}
          <StatCard label={c.creditLimit} value={summary.credit_limit === undefined ? c.noLimit : money(summary.credit_limit)} icon={CreditCard} hint={summary.credit_available !== undefined ? <>{c.available}: {money(summary.credit_available)}</> : undefined} tone={summary.credit_available !== undefined && toPaisa(summary.credit_available) < BigInt(0) ? "attention" : "default"} />
          {ledger && <StatCard label={c.overdue} value={money(summary.overdue)} icon={Clock} tone={summary.overdue !== undefined && toPaisa(summary.overdue) > BigInt(0) ? "attention" : "default"} />}
          <StatCard label={c.openOrders} value={money(summary.open_orders)} icon={ShoppingCart} href={seesOrders ? `/sales/orders?customer=${id}&status=open` : undefined} />
        </StatGrid>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <SectionCard
            title={c.details}
            action={(tel || chat) && (
              <span className="flex gap-2">
                {tel && <a href={tel} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Phone className="size-4" aria-hidden />{c.call}</a>}
                {chat && <a href={chat} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><MessageCircle className="size-4" aria-hidden />{c.message}</a>}
              </span>
            )}
          >
            <DescriptionList items={[
              { label: c.owner, value: customer.owner_name },
              { label: c.phone, value: customer.phone && <Ltr>{customer.phone}</Ltr> },
              { label: c.whatsapp, value: customer.whatsapp && <Ltr>{customer.whatsapp}</Ltr> },
              { label: c.altPhone, value: customer.alt_phone && <Ltr>{customer.alt_phone}</Ltr> },
              { label: c.address, value: customer.address },
              { label: c.city, value: [customer.area, customer.city].filter(Boolean).join(", ") },
              { label: c.orderTaker, value: taker ? local(taker.nameEn, taker.nameUr) : c.noOrderTaker },
              { label: c.paymentTerms, value: customer.payment_terms_days },
              { label: c.lastOrder, value: formatDate(summary.last_order ?? null, locale) },
              ...(ledger ? [{ label: c.lastPayment, value: formatDate(summary.last_payment ?? null, locale) }] : []),
              { label: c.ntn, value: customer.ntn && <Ltr>{customer.ntn}</Ltr> },
              { label: t.documents.notes, value: customer.notes },
            ]} />
          </SectionCard>
          {seesOrders && (
            <SectionCard title={c.recentOrders} action={<LinkButton variant="outline" size="sm" href={`/sales/orders?customer=${id}`}>{t.common.all}</LinkButton>}>
              {orders.rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t.sales.orderEmpty}</p> : (
                <ul className="divide-y">
                  {orders.rows.slice(0, 6).map((o) => {
                    const status = orderOptions(t)[o.status];
                    return (
                      <li key={o.id} className="flex items-start justify-between gap-4 -mx-3 px-3 py-2.5 transition-colors hover:bg-accent/50">
                        <div className="min-w-0">
                          <Link href={`/sales/orders/${o.id}`} className="text-sm font-medium hover:text-primary hover:underline"><Ltr>{o.doc_no}</Ltr></Link>
                          <p className="text-xs text-muted-foreground"><bdi>{formatDate(o.order_date, locale)}</bdi></p>
                        </div>
                        <div className="grid shrink-0 justify-items-end gap-1">
                          <Money amount={toPaisa(o.total_amount)} locale={locale} className="text-sm font-semibold" />
                          {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>
          )}
        </div>
        {ledger && (
          <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={c.ledger} description={c.ledgerHint}>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border shadow-card sm:grid-cols-4 xl:grid-cols-7">
              {[...figures, { label: c.closing, value: closing, strong: true }].map((f) => (
                <div key={f.label} className="bg-card px-4 py-3">
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className={f.strong ? "mt-1 font-semibold text-navy" : "mt-1 text-sm font-medium"}><Ltr className="tabular-nums">{formatPaisa(f.value, locale)}</Ltr></dd>
                </div>
              ))}
            </dl>
            <SpecTable
              caption={c.ledger}
              exportName={`ledger-${customer.code}-${period.from}-${period.to}`}
              rows={statement.map((l, i) => ({
                id: String(i), date: l.entry_date, kind: kinds[l.kind] ?? l.kind, note: l.is_reversal ? c.reversal : l.kind === "brought_forward" ? null : l.journal_no,
                doc: l.doc_no ?? (l.kind === "brought_forward" ? null : l.journal_no), docHref: documentHref(l.kind, l.source_id, id) ?? undefined,
                debit: toPaisa(l.debit) === BigInt(0) ? null : l.debit, credit: toPaisa(l.credit) === BigInt(0) ? null : l.credit, balance: l.balance,
              }))}
              columns={[
                { key: "date", label: t.documents.date, kind: "date" },
                { key: "kind", sub: "note", label: t.stock.document, kind: "text", primary: true },
                { key: "doc", label: t.documents.number, kind: "link" },
                { key: "debit", label: c.debit, kind: "money", total: true },
                { key: "credit", label: c.credit, kind: "money", total: true },
                { key: "balance", label: c.runningBalance, kind: "money" },
              ]}
              searchKeys={["kind", "doc"]}
              empty={{ title: c.ledgerEmpty }}
            />
          </PeriodFrame>
        )}
      </div>
    </>
  );
}
