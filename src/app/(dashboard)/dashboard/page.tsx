import type { Metadata } from "next";
import { hasPerformance, PerformanceView } from "@/components/dashboard/performance";
import {
  LowStockCard, MyRecordsCard, OpenWorkCard, OverdueCard, PendingDeliveriesCard, RecentOrdersCard, RecentTransactionsCard,
} from "@/components/dashboard/lists";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { hasPosition, PositionCards } from "@/components/dashboard/position-cards";
import { QuickEntry } from "@/components/dashboard/quick-entry";
import { DataSection } from "@/components/dashboard/section";
import { dashboardKind } from "@/features/dashboard/layout";
import { businessToday, daysBetween, parsePeriod } from "@/features/dashboard/period";
import {
  loadLowStock, loadMyRecords, loadOpenWork, loadOverdue, loadPendingDeliveries, loadPerformance, loadPosition,
  loadRecentOrders, loadRecentTransactions,
} from "@/features/dashboard/queries";
import { fill, isolate } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { formatDate } from "@/components/shared/format";
import { CardsSkeleton, ChartsSkeleton, ListSkeleton } from "@/components/shared/states";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).dashboard.title };
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const ctx = await requireActiveSession();
  if (!can(ctx, "dashboard.view")) return <Forbidden />;
  const [t, locale, params] = await Promise.all([getT(), getLocale(), searchParams]);
  const d = t.dashboard;
  const kind = dashboardKind(ctx.role?.code, ctx.permissions);
  const today = businessToday();
  const period = parsePeriod(params, today);
  const days = daysBetween(period.from, period.to) + 1;
  const common = { t, locale };

  const position = hasPosition(ctx.permissions, kind) && (
    <section aria-labelledby="dashboard-now" className="grid gap-4">
      <div>
        <h2 id="dashboard-now" className="text-lg font-semibold text-navy">{d.now}</h2>
        <p className="text-sm text-muted-foreground">{fill(d.nowHint, { date: isolate(formatDate(today, locale) ?? "") })}</p>
      </div>
      <DataSection name={d.now} skeleton={<CardsSkeleton count={kind === "executive" || kind === "manager" ? 8 : 2} />} load={loadPosition}>
        {(data) => <PositionCards position={data} kind={kind} {...common} />}
      </DataSection>
    </section>
  );

  const performance = kind !== "entry" && hasPerformance(ctx.permissions) && (
    <PeriodFrame
      period={period}
      today={today}
      title={d.performance}
      description={days === 1 ? d.comparedWithDay : fill(d.comparedWith, { days })}
    >
      <DataSection name={d.performance} skeleton={<ChartsSkeleton />} load={() => loadPerformance(period)}>
        {(data) => <PerformanceView performance={data} {...common} />}
      </DataSection>
    </PeriodFrame>
  );

  const openWork = (
    <DataSection name={d.work.title} skeleton={<ListSkeleton />} load={loadOpenWork}>
      {(rows) => <OpenWorkCard rows={rows} {...common} />}
    </DataSection>
  );
  const lowStock = can(ctx, "inventory.view") && (
    <DataSection name={d.alerts.lowStock} skeleton={<ListSkeleton />} load={loadLowStock}>
      {(data) => <LowStockCard data={data} {...common} />}
    </DataSection>
  );
  const deliveries = can(ctx, "sales.view") && (
    <DataSection name={d.alerts.deliveries} skeleton={<ListSkeleton />} load={loadPendingDeliveries}>
      {(rows) => <PendingDeliveriesCard rows={rows} {...common} />}
    </DataSection>
  );
  const overdue = (can(ctx, "receivables.view") || can(ctx, "payables.view") || can(ctx, "company.view")) && (
    <DataSection name={d.alerts.overdue} skeleton={<ListSkeleton />} load={loadOverdue}>
      {(data) => <OverdueCard data={data} {...common} />}
    </DataSection>
  );
  const orders = can(ctx, "sales.view") && (
    <DataSection name={d.lists.orders} skeleton={<ListSkeleton />} load={loadRecentOrders}>
      {(rows) => <RecentOrdersCard rows={rows} {...common} />}
    </DataSection>
  );
  const transactions = kind !== "entry" && (
    <DataSection name={d.lists.transactions} skeleton={<ListSkeleton />} load={loadRecentTransactions}>
      {(rows) => <RecentTransactionsCard rows={rows} {...common} />}
    </DataSection>
  );
  const myRecords = (
    <DataSection name={d.lists.myRecords} skeleton={<ListSkeleton />} load={loadMyRecords}>
      {(rows) => <MyRecordsCard rows={rows} {...common} />}
    </DataSection>
  );
  const grid = (...items: React.ReactNode[]) => <div className="grid items-stretch gap-6 lg:grid-cols-2">{items.map((item, i) => item && <div key={i} className="min-w-0">{item}</div>)}</div>;

  return (
    <>
      <PageHeader title={fill(d.greeting, { name: isolate(ctx.fullName || ctx.email) })} description={d.subtitles[kind]} />
      <div className="grid gap-8">
        {kind === "executive" && <>{position}{performance}{grid(openWork, lowStock, deliveries, overdue)}{grid(orders, transactions)}</>}
        {kind === "manager" && <>{grid(openWork, deliveries)}{position}{performance}{grid(lowStock, overdue)}{grid(orders, transactions)}</>}
        {kind === "entry" && <><QuickEntry permissions={ctx.permissions} t={t} />{grid(openWork, myRecords)}{position}{grid(lowStock, deliveries)}{grid(orders)}</>}
        {kind === "viewer" && <>{position}{performance}{grid(lowStock, deliveries)}{grid(orders, transactions)}</>}
      </div>
    </>
  );
}
