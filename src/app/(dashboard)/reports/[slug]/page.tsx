import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadReport } from "@/features/reports/load";
import { findReport } from "@/features/reports/registry";
import { getLocale, getT } from "@/i18n/server";
import { requireActiveSession } from "@/lib/auth/session";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { ExportButtons } from "@/components/reports/export-buttons";
import { ReportBody } from "@/components/reports/report-body";

export async function generateMetadata({ params }: PageProps<"/reports/[slug]">): Promise<Metadata> {
  const [{ slug }, t, locale] = await Promise.all([params, getT(), getLocale()]);
  return { title: findReport(slug)?.title[locale] ?? t.reports.title };
}

export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[slug]">) {
  const [{ slug }, query, ctx, t, locale] = await Promise.all([params, searchParams, requireActiveSession(), getT(), getLocale()]);
  const report = await loadReport(slug, ctx, query);
  if (report === "notFound") notFound();
  if (report === "forbidden") return <Forbidden />;
  const { definition, period, today } = report;
  const title = definition.title[locale];
  const body = <ReportBody report={report} ctx={ctx} t={t} locale={locale} />;
  return (
    <>
      <PageHeader
        title={title} description={definition.dates === "period" ? undefined : definition.dates === "now" ? `${definition.hint[locale]} ${t.analytics.asOfNow}` : definition.hint[locale]}
        breadcrumbs={[{ label: t.reports.title, href: "/reports" }]} actions={<ExportButtons slug={slug} params={report.params} />}
      />
      {definition.dates === "period"
        ? <PeriodFrame compact key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={title} description={definition.hint[locale]}>{body}</PeriodFrame>
        : body}
    </>
  );
}
