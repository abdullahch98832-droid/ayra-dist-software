import type { Metadata } from "next";
import { Banknote, ClipboardList, HandCoins, PackageCheck, Plus, ReceiptText, Wallet } from "lucide-react";
import { accountPay, flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadOrders, loadReceipts, loadSummary } from "@/features/purchasing/queries";
import { fill, isolate } from "@/i18n/format";
import { can } from "@/lib/auth/session";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { DocumentStatus } from "@/components/documents/document-status";
import { formatDate, formatNumber } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatGrid } from "@/components/shared/stat-grid";
import { StateMessage } from "@/components/shared/states";
import Link from "next/link";

const LATEST = { q: "", status: "", page: 1, supplierId: null };
const EMPTY = { rows: [], total: 0 };

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]">): Promise<Metadata> {
  const { flow, t } = await purchasingPage(params);
  return { title: t.purchasing.flows[flow] };
}

export default async function PurchasingOverview({ params }: PageProps<"/purchasing/[flow]">) {
  const { flow, ctx, t, locale, local } = await purchasingPage(params);
  const p = t.purchasing;
  const seesDocuments = can(ctx, "purchasing.view");
  const creates = can(ctx, "purchasing.create");
  const [summary, orders, receipts] = await Promise.all([
    seesDocuments ? loadSummary(flow) : null,
    seesDocuments || creates ? loadOrders(flow, LATEST) : EMPTY,
    seesDocuments || creates ? loadReceipts(flow, LATEST) : EMPTY,
  ]);
  const money = (v: string) => <Ltr>{formatPaisa(toPaisa(v), locale)}</Ltr>;
  const text = (v: string) => isolate(formatPaisa(toPaisa(v), locale));

  return (
    <>
      <PageHeader
        title={p.flows[flow]}
        description={p.flowHints[flow]}
        actions={
          <>
            {can(ctx, accountPay(flow)) && <LinkButton variant="outline" href={flowPath(flow, "payments", "new")}><Banknote aria-hidden />{p.newPayment}</LinkButton>}
            {creates && <LinkButton variant="outline" href={flowPath(flow, "receipts", "new")}><PackageCheck aria-hidden />{p.newReceipt}</LinkButton>}
            {creates && <LinkButton href={flowPath(flow, "orders", "new")}><Plus aria-hidden />{p.newOrder}</LinkButton>}
          </>
        }
      />
      <div className="grid gap-6">
        {summary && (
          <StatGrid>
            <StatCard label={p.openOrders} value={formatNumber(summary.open_orders, locale)} icon={ClipboardList} hint={fill(p.openValue, { amount: text(summary.open_value) })} href={flowPath(flow, "orders")} />
            <StatCard label={p.unbilled} value={money(summary.unbilled_amount)} icon={ReceiptText} tone={summary.unbilled_receipts > 0 ? "attention" : "default"} hint={fill(p.unbilledHint, { count: formatNumber(summary.unbilled_receipts, locale) })} href={flowPath(flow, "bills", "new")} />
            <StatCard label={p.purchasedMonth} value={money(summary.purchased_month)} icon={PackageCheck} />
            {summary.balance !== undefined && <StatCard label={p.payable} value={money(summary.balance)} icon={Wallet} href={flowPath(flow, "account")} />}
            {summary.unpaid_amount !== undefined && <StatCard label={p.unpaidBills} value={money(summary.unpaid_amount)} icon={HandCoins} hint={fill(p.unpaidHint, { count: formatNumber(summary.unpaid_bills ?? 0, locale) })} href={flowPath(flow, "bills")} />}
            {summary.paid_month !== undefined && <StatCard label={p.paidMonth} value={money(summary.paid_month)} icon={Banknote} href={flowPath(flow, "payments")} />}
          </StatGrid>
        )}
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {[
            { title: p.tabs.orders, href: "orders", rows: orders.rows.slice(0, 6).map((o) => ({ id: o.id, no: o.doc_no, date: o.order_date, status: o.status, closed: !!o.closed_at, total: o.total_amount, party: local(o.supplier.name, o.supplier.name_ur) })) },
            { title: p.tabs.receipts, href: "receipts", rows: receipts.rows.slice(0, 6).map((r) => ({ id: r.id, no: r.doc_no, date: r.receipt_date, status: r.status, closed: false, total: r.total_amount, party: local(r.supplier.name, r.supplier.name_ur) })) },
          ].map((list) => (
            <SectionCard key={list.href} title={list.title} action={<LinkButton variant="outline" size="sm" href={flowPath(flow, list.href)}>{t.common.all}</LinkButton>}>
              {list.rows.length === 0 ? <StateMessage headingLevel="p" title={t.documents.empty} className="py-6" /> : (
                <ul className="divide-y">
                  {list.rows.map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-4 -mx-3 px-3 py-2.5 transition-colors hover:bg-accent/50">
                      <div className="min-w-0">
                        <Link href={flowPath(flow, list.href, r.id)} className="text-sm font-medium hover:text-primary hover:underline"><Ltr>{r.no}</Ltr></Link>
                        <p className="text-xs text-muted-foreground"><bdi>{r.party}</bdi> · <bdi>{formatDate(r.date, locale)}</bdi></p>
                      </div>
                      <div className="grid shrink-0 justify-items-end gap-1">
                        <Money amount={toPaisa(r.total)} locale={locale} className="text-sm font-semibold" />
                        <DocumentStatus status={r.status} closed={r.closed} t={t} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          ))}
        </div>
      </div>
    </>
  );
}
