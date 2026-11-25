import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, CircleCheck, ClipboardCheck, PackageCheck, Plus, TrendingUp, Truck } from "lucide-react";
import { loadOrders, loadSalesSummary } from "@/features/sales/queries";
import { orderOptions } from "@/features/sales/status";
import { fill } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { formatDate, formatNumber } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatGrid } from "@/components/shared/stat-grid";
import { StateMessage } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sales.title };
}

export default async function SalesOverview() {
  const { ctx, t, locale, local } = await pageContext();
  const s = t.sales;
  const [summary, latest] = await Promise.all([loadSalesSummary(), loadOrders({ q: "", status: "", page: 1, supplierId: null })]);
  const n = (...statuses: string[]) => statuses.reduce((sum, x) => sum + (summary.orders[x] ?? 0), 0);
  const money = (v: string) => <Ltr>{formatPaisa(toPaisa(v), locale)}</Ltr>;
  const add = can(ctx, "sales.create") && <LinkButton href="/sales/orders/new"><Plus aria-hidden />{s.newOrder}</LinkButton>;
  const dispatch = n("approved", "picking", "partially_dispatched");
  return (
    <>
      <PageHeader title={s.title} description={s.subtitle} actions={add} />
      <div className="grid gap-6">
        <StatGrid>
          <StatCard label={s.today} value={money(summary.today)} icon={TrendingUp} />
          <StatCard label={s.month} value={money(summary.month)} icon={TrendingUp} hint={fill(s.monthInvoices, { count: formatNumber(summary.month_invoices, locale) })} href="/sales/invoices" />
          {summary.collected_month !== undefined && <StatCard label={s.collectedMonth} value={money(summary.collected_month)} icon={Banknote} href="/receivables/payments" />}
          <StatCard label={s.waitingApproval} value={formatNumber(n("submitted"), locale)} icon={ClipboardCheck} tone={n("submitted") ? "attention" : "default"} hint={money(summary.waiting_approval)} href="/sales/orders?status=submitted" />
          <StatCard label={s.toDispatch} value={formatNumber(dispatch, locale)} icon={PackageCheck} tone={dispatch ? "attention" : "default"} href={can(ctx, "sales.dispatch") ? "/inventory/dispatch" : "/sales/orders?status=open"} />
          <StatCard label={s.inTransit} value={formatNumber(summary.in_transit, locale)} icon={Truck} href="/sales/deliveries?status=dispatched" />
          <StatCard label={s.unpaid} value={formatNumber(n("delivered"), locale)} icon={CircleCheck} href="/sales/orders?status=delivered" />
        </StatGrid>
        <SectionCard title={s.tabs.orders} action={<LinkButton variant="outline" size="sm" href="/sales/orders">{t.common.all}</LinkButton>}>
          {latest.rows.length === 0 ? <StateMessage headingLevel="p" title={s.orderEmpty} description={s.orderEmptyHint} className="py-6" /> : (
            <ul className="divide-y">
              {latest.rows.slice(0, 8).map((o) => {
                const status = orderOptions(t)[o.status];
                return (
                  <li key={o.id} className="flex items-start justify-between gap-4 -mx-3 px-3 py-2.5 transition-colors hover:bg-accent/50">
                    <div className="min-w-0">
                      <Link href={`/sales/orders/${o.id}`} className="text-sm font-medium hover:text-primary hover:underline"><Ltr>{o.doc_no}</Ltr></Link>
                      <p className="text-xs text-muted-foreground"><bdi>{o.customer && local(o.customer.name, o.customer.name_ur)}</bdi> · <bdi>{formatDate(o.order_date, locale)}</bdi></p>
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
      </div>
    </>
  );
}
