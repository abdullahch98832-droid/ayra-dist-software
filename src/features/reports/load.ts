import "server-only";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { asOfBi, periodBi } from "@/features/documents/build";
import { can, type SessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isIsoDate } from "@/features/dashboard/period";
import { findReport } from "./registry";
import type { LoadedReport, Query, ReportDefinition } from "./model";

export const mayView = (ctx: SessionContext, report: ReportDefinition) => can(ctx, "reports.view") && report.permissions.some((p) => can(ctx, p)) && (report.allowed?.(ctx) ?? true);
export const mayExport = (ctx: SessionContext, report: ReportDefinition) => mayView(ctx, report) && can(ctx, "reports.export");

/** The only way to the figures of a report, for the screen and for every export. Refuses before anything is read. */
export async function loadReport(slug: string, ctx: SessionContext, query: Query, exporting = false): Promise<LoadedReport | "notFound" | "forbidden"> {
  const definition = findReport(slug);
  if (!definition) return "notFound";
  if (!(exporting ? mayExport(ctx, definition) : mayView(ctx, definition))) return "forbidden";
  const today = businessToday();
  const period = parsePeriod(query, today);
  const day = definition.dates === "day" && isIsoDate(query.date) && query.date <= today ? query.date : today;
  const filters = (await definition.filters?.(ctx, query)) ?? [];
  const value = (param: string) => filters.find((f) => f.param === param)?.options.find((o) => o.value === query[param]) ?? null;
  const active = filters.flatMap((f) => { const option = value(f.param); return option ? [{ filter: f, option }] : []; });
  const model = await definition.load({ ctx, period, day, today, query, filter: (param) => value(param)?.value ?? null, whole: active.every((a) => a.filter.keeps) });
  return {
    definition, model, period, day, today, filters,
    chosen: active.map((a) => ({ label: a.filter.label, value: a.option.label })),
    dates: definition.dates === "period" ? periodBi(period.from, period.to) : asOfBi(day),
    params: {
      ...(definition.dates === "period" ? { range: "custom", from: period.from, to: period.to } : definition.dates === "day" ? { date: day } : {}),
      ...Object.fromEntries(active.map((a) => [a.filter.param, a.option.value])),
    },
  };
}

/** The database checks the permission again and keeps a record of the export. */
export async function recordExport(report: LoadedReport, format: "pdf" | "xlsx" | "csv"): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_report_export", { p_report: report.definition.slug, p_format: format, p_filters: report.params });
  if (error) throw error;
}
