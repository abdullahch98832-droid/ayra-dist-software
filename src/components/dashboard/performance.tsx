import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleDollarSign, ReceiptText, ShoppingCart, TrendingUp, Wallet, Waypoints, type LucideIcon } from "lucide-react";
import { changeFrom } from "@/features/dashboard/change";
import type { Performance, PeriodTotals } from "@/features/dashboard/schema";
import { fill, isolate, isolateLtr } from "@/i18n/format";
import type { Dictionary } from "@/i18n";
import { cn } from "@/lib/utils";
import { formatPaisa, sumPaisa, toPaisa } from "@/lib/utils/money";
import type { Locale } from "@/types";
import { BarListCard } from "@/components/charts/bar-list";
import { ColumnChartCard } from "@/components/charts/column-chart";
import { LineChartCard } from "@/components/charts/line-chart";
import type { ChartPoint } from "@/components/charts/types";
import { Ltr } from "@/components/shared/bidi";
import { formatBucket, formatNumber } from "@/components/shared/format";
import { StatCard } from "@/components/shared/stat-card";

type Goodness = "higher" | "lower" | "neutral";

function ChangeLine({ current, previous, better, t, locale }: { current: string; previous: string; better: Goodness; t: Dictionary; locale: Locale }) {
  const change = changeFrom(toPaisa(current), toPaisa(previous));
  if (!change) return <p className="text-xs text-muted-foreground">{t.dashboard.noComparison}</p>;
  const Icon = change.direction === "up" ? ArrowUpRight : change.direction === "down" ? ArrowDownRight : ArrowRight;
  const good = better === "neutral" || change.direction === "flat" ? null : (change.direction === "up") === (better === "higher");
  const sign = change.direction === "down" ? "−" : change.direction === "up" ? "+" : "";
  const percent = `${sign}${formatNumber(change.permille / 10, locale)}`;
  return (
    <p className={cn("flex items-center gap-1 text-xs font-medium", good === null ? "text-muted-foreground" : good ? "text-success" : "text-destructive")}>
      <Icon className="size-3.5 rtl:-scale-x-100" aria-hidden />
      <span>{fill(t.dashboard.vsPrevious, { percent: isolateLtr(`${percent}%`) })}</span>
    </p>
  );
}

export function PerformanceView({ performance, t, locale }: { performance: Performance; t: Dictionary; locale: Locale }) {
  const { current, previous, series } = performance;
  const f = t.dashboard.figures;
  const c = t.dashboard.charts;
  const rs = (amount: string) => formatPaisa(toPaisa(amount), locale);

  const figure = (key: keyof PeriodTotals, label: string, icon: LucideIcon, better: Goodness, hint?: React.ReactNode) => {
    const value = current[key];
    if (value === undefined) return null;
    return (
      <StatCard
        key={key} label={label} icon={icon} hint={hint}
        value={<Ltr className={toPaisa(value) < BigInt(0) ? "text-destructive" : undefined}>{rs(value)}</Ltr>}
        footer={<ChangeLine current={value} previous={previous[key] ?? "0"} better={better} t={t} locale={locale} />}
      />
    );
  };

  const figures = [
    figure("sales", performance.sales_scope === "own" ? f.salesOwn : f.sales, ShoppingCart, "higher", fill(f.salesHint, { amount: isolate(rs(current.returns ?? "0")) })),
    figure("purchases", f.purchases, ReceiptText, "neutral", f.purchasesHint),
    figure("expenses", f.expenses, Wallet, "lower", performance.expense_scope === "documents" ? f.expensesDocumentsHint : f.expensesHint),
    figure("gross_profit", f.grossProfit, TrendingUp, "higher", f.grossProfitHint),
    figure("net_profit", f.netProfit, CircleDollarSign, "higher", f.netProfitHint),
    figure("sol_revenue", f.solRevenue, Waypoints, "higher",
      performance.sol_route_sales && toPaisa(performance.sol_route_sales) !== BigInt(0)
        ? fill(f.solRouteHint, { amount: isolate(rs(performance.sol_route_sales)) })
        : f.solRevenueHint),
  ].filter(Boolean);

  type Key = "sales" | "gross_profit" | "net_profit" | "stock_in" | "stock_out";
  const points = (keys: Key[]): ChartPoint[] => {
    if (!series.some((s) => keys.some((k) => Number(s[k] ?? 0) !== 0))) return [];
    return series.map((s) => ({
      label: formatBucket(s.start, performance.bucket, locale),
      values: keys.map((k) => {
        const raw = s[k] ?? "0";
        const isQuantity = k === "stock_in" || k === "stock_out";
        return { value: Number(raw), display: isQuantity ? formatNumber(BigInt(raw), locale) : rs(raw) };
      }),
    }));
  };

  const expenseAccounts = performance.expense_accounts ?? [];
  const name = (a: (typeof expenseAccounts)[number]) => (locale === "ur" ? a.name_ur : a.name_en);
  const rest = sumPaisa(expenseAccounts.slice(6).map((a) => toPaisa(a.amount)));
  const expensePoints: ChartPoint[] = [
    ...expenseAccounts.slice(0, 6).map((a) => ({ label: name(a), values: [{ value: Math.max(0, Number(a.amount)), display: rs(a.amount) }] })),
    ...(expenseAccounts.length > 6 ? [{ label: c.other, values: [{ value: Math.max(0, Number(rest) / 100), display: formatPaisa(rest, locale) }] }] : []),
  ];

  return (
    <>
      {figures.length > 0 && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{figures}</div>}
      <div className="grid gap-6 lg:grid-cols-2">
        {performance.sales_scope && (
          <ColumnChartCard title={c.sales} description={c.salesHint} categoryLabel={c.date} emptyText={c.emptyPeriod}
            series={[{ key: "sales", label: c.sales }]} points={points(["sales"])} />
        )}
        {current.net_profit !== undefined && (
          <LineChartCard title={c.profit} description={c.profitHint} categoryLabel={c.date} emptyText={c.emptyPeriod}
            series={[{ key: "gross", label: c.grossProfit }, { key: "net", label: c.netProfit }]} points={points(["gross_profit", "net_profit"])} />
        )}
        {performance.expense_scope && (
          <BarListCard title={c.expenses} description={performance.expense_scope === "documents" ? f.expensesDocumentsHint : f.expensesHint}
            categoryLabel={c.expenses} emptyText={c.emptyPeriod} series={{ key: "expenses", label: f.expenses }} points={expensePoints} />
        )}
        {series.some((s) => s.stock_in !== undefined) && (
          <ColumnChartCard title={c.stock} description={c.stockHint} categoryLabel={c.date} emptyText={c.emptyPeriod}
            series={[{ key: "in", label: c.stockIn }, { key: "out", label: c.stockOut }]} points={points(["stock_in", "stock_out"])} />
        )}
      </div>
    </>
  );
}

/** False when the user may see none of the period figures, so the whole section is left out. */
export function hasPerformance(permissions: ReadonlySet<string>): boolean {
  return ["sales.view_all", "reports.financial", "expenses.view", "purchasing.view", "inventory.view"].some((p) => permissions.has(p))
    || (permissions.has("sales.view") && permissions.has("sales.create"));
}
