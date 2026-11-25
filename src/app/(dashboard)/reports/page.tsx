import type { Metadata } from "next";
import { mayView } from "@/features/reports/load";
import { REPORT_GROUPS } from "@/features/reports/model";
import { REPORTS } from "@/features/reports/registry";
import { getLocale, getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { ReportHub } from "@/components/reports/report-hub";
import { IconTile } from "@/components/shared/icon-tile";
import { EmptyState } from "@/components/shared/states";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.title };
}

export default async function ReportsPage() {
  const ctx = await requireActiveSession();
  if (!can(ctx, "reports.view")) return <Forbidden />;
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const reports = REPORTS.filter((r) => mayView(ctx, r));
  const groups = REPORT_GROUPS.map((key) => ({
    key, title: t.analytics.groups[key], hint: t.analytics.groupHints[key],
    // Both languages are searched, whichever is shown.
    reports: reports.filter((r) => r.group === key).map(({ slug, title, hint, icon }) => ({ slug, title: title[locale], hint: hint[locale], words: `${title.en} ${title.ur} ${hint.en} ${hint.ur}`.toLowerCase(), icon: <IconTile icon={icon} size="sm" /> })),
  })).filter((g) => g.reports.length > 0);
  return (
    <>
      <PageHeader title={t.reports.title} description={t.reports.subtitle} />
      {groups.length === 0 ? <EmptyState title={t.reports.empty} /> : <ReportHub groups={groups} />}
    </>
  );
}
