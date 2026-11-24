import "server-only";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { getLocale, getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import type { ReportDefinition } from "./catalog";

/** Session, language and date filter of a report page. `allowed` is false when the user may not open it. */
export async function reportPage(report: ReportDefinition, searchParams?: Promise<Record<string, string | string[] | undefined>>) {
  const [ctx, t, locale, query] = await Promise.all([requireActiveSession(), getT(), getLocale(), searchParams ?? Promise.resolve({})]);
  const today = businessToday();
  return {
    ctx, t, locale, query: query as Record<string, string | string[] | undefined>, today, period: parsePeriod(query, today),
    allowed: can(ctx, "reports.view") && report.permissions.some((p) => can(ctx, p)),
    local: (en: string, ur: string | null | undefined) => (locale === "ur" && ur ? ur : en),
  };
}
