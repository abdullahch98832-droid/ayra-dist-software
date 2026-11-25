import { figureText } from "@/features/reports/export";
import type { LoadedReport, ReportChart, ReportTable } from "@/features/reports/model";
import { inLocale, localRows } from "@/features/reports/values";
import { can, type SessionContext } from "@/lib/auth/session";
import type { Dictionary } from "@/i18n";
import { fill } from "@/i18n/format";
import { formatPaisa } from "@/lib/utils/money";
import type { Locale } from "@/types";
import { Statement } from "@/components/accounting/statement";
import { BarListCard } from "@/components/charts/bar-list";
import { ColumnChartCard } from "@/components/charts/column-chart";
import { FormAlert } from "@/components/forms/field";
import { formatNumber } from "@/components/shared/format";
import { Ltr } from "@/components/shared/bidi";
import { SectionHeading } from "@/components/shared/section-heading";
import { StatCard } from "@/components/shared/stat-card";
import { StatGrid } from "@/components/shared/stat-grid";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlDate, UrlSelect } from "@/components/tables/url-filters";
import { Reconciliation } from "./reconciliation";

function Chart({ chart, locale }: { chart: ReportChart; locale: Locale }) {
  // The number only sets the size of a mark; the text is exact.
  const values = (v: bigint) => (chart.counts ? { value: Number(v), display: formatNumber(v, locale) } : { value: Number(v / BigInt(100)), display: formatPaisa(v, locale) });
  const points = chart.points.map((p) => ({ label: p.label[locale], values: p.values.map(values) }));
  const shared = { title: chart.title[locale], description: chart.hint[locale], categoryLabel: chart.category[locale], points };
  const [first] = chart.series;
  if (chart.type === "bars") return first ? <BarListCard {...shared} series={{ key: first.key, label: first.label[locale] }} /> : null;
  return <ColumnChartCard {...shared} series={chart.series.map((s) => ({ key: s.key, label: s.label[locale] }))} />;
}

function Table({ table, t, locale }: { table: ReportTable; t: Dictionary; locale: Locale }) {
  return (
    <SpecTable
      caption={table.title[locale]} rows={localRows(table, locale)} searchKeys={table.search} initialSort={table.sort}
      columns={table.columns.map((c) => ({
        key: c.key, label: c.label[locale], kind: c.kind, sub: c.sub, hideBelow: c.hideBelow, primary: c.primary, total: c.total,
        options: c.options && Object.fromEntries(Object.entries(c.options).map(([k, o]) => [k, { label: o.label[locale], tone: o.tone }])),
      }))}
      empty={table.empty ? { title: table.empty[locale] } : { title: t.reports.empty, description: t.reports.emptyHint }}
    />
  );
}

/** Everything of a report between its title and the end of the page. */
export function ReportBody({ report, ctx, t, locale }: { report: LoadedReport; ctx: SessionContext; t: Dictionary; locale: Locale }) {
  const { model, definition, filters } = report;
  const several = model.tables.length > 1;
  const checks = model.checks ?? [];
  const compared = can(ctx, "reports.financial") && checks.length === 0 && report.chosen.length > 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {(filters.length > 0 || definition.dates === "day") && (
        <div className="flex flex-wrap gap-3 print:hidden">
          {definition.dates === "day" && <UrlDate param="date" label={t.receivables.asOf} max={report.today} fallback={report.today} />}
          {filters.map((f) => <UrlSelect key={f.param} param={f.param} label={f.all[locale]} options={f.options.map((o) => ({ value: o.value, label: inLocale(o.label, locale) }))} />)}
        </div>
      )}
      {!!model.figures?.length && (
        <StatGrid>
          {model.figures.map((f) => <StatCard key={f.key} label={f.label[locale]} value={<Ltr>{figureText(f, locale)}</Ltr>} hint={f.hint?.[locale]} icon={f.icon ?? definition.icon} tone={f.attention ? "attention" : "default"} />)}
        </StatGrid>
      )}
      {checks.length > 0 ? <Reconciliation checks={checks} t={t} locale={locale} /> : compared && <p className="text-xs text-muted-foreground print:hidden">{t.analytics.filtered}</p>}
      {model.charts?.map((c) => <div key={c.key} className="print:hidden"><Chart chart={c} locale={locale} /></div>)}
      {model.statement && (
        <Statement caption={definition.title[locale]} locale={locale} sections={model.statement.map((p) => ({
          key: p.key, title: p.title?.[locale], strong: p.strong, rows: p.rows.map((r) => ({ key: r.key, label: inLocale(r.label, locale), code: r.code, amount: r.amount })), total: p.total && { label: p.total.label[locale], amount: p.total.amount },
        }))} />
      )}
      {model.tables.map((table) => (
        <section key={table.key} aria-label={table.title[locale]} className="grid grid-cols-[minmax(0,1fr)] gap-3">
          {several && <SectionHeading title={table.title[locale]} />}
          {table.limited && table.limited.total > table.limited.shown && <FormAlert tone="info">{fill(t.reports.limited, { count: formatNumber(table.limited.shown, locale), total: formatNumber(table.limited.total, locale) })}</FormAlert>}
          <Table table={table} t={t} locale={locale} />
        </section>
      ))}
      {!!model.notes?.length && <ul className="grid gap-1 text-xs text-muted-foreground">{model.notes.map((n, i) => <li key={i}>{n[locale]}</li>)}</ul>}
    </div>
  );
}
