import type { Metadata } from "next";
import Link from "next/link";
import { REPORTS } from "@/features/reports/catalog";
import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/states";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.title };
}

export default async function ReportsPage() {
  const ctx = await requireActiveSession();
  if (!can(ctx, "reports.view")) return <Forbidden />;
  const t = await getT();
  const reports = Object.values(REPORTS).filter((r) => r.permissions.some((p) => can(ctx, p)));
  return (
    <>
      <PageHeader title={t.reports.title} description={t.reports.subtitle} />
      {reports.length === 0 ? <EmptyState title={t.reports.empty} /> : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {reports.map(({ slug, title, hint, icon: Icon }) => (
            <li key={slug}>
              <Link href={`/reports/${slug}`} className="flex h-full items-start gap-4 rounded-xl border bg-card p-5 shadow-card outline-none transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/40">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-5" aria-hidden /></span>
                <span className="min-w-0">
                  <span className="block font-medium text-navy">{t.reports[title]}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{t.reports[hint]}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
