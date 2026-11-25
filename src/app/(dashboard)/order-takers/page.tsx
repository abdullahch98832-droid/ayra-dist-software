import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { EmployeeAvatar } from "@/features/employees/employee-avatar";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { loadTakerReport, loadTakers, takerPhotos } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { formatNumber } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).takers.title };
}

export default async function OrderTakersPage({ searchParams }: PageProps<"/order-takers">) {
  const { ctx, t, locale, local } = await pageContext();
  if (!can(ctx, "sales.team") && !can(ctx, "sales.view_all")) return <Forbidden />;
  const k = t.takers;
  const today = businessToday();
  const period = parsePeriod(await searchParams, today);
  const [takers, report] = await Promise.all([loadTakers(), can(ctx, "sales.view_all") ? loadTakerReport(period.from, period.to) : []]);
  const photos = await takerPhotos(takers);
  const figures = new Map(report.map((r) => [r.employee_id, r]));
  const add = can(ctx, "sales.team") && <LinkButton href="/order-takers/new"><Plus aria-hidden />{k.add}</LinkButton>;
  const money = (v: number | null | undefined) => (v === null || v === undefined ? null : formatPaisa(toPaisa(v), locale));
  return (
    <>
      <PageHeader title={k.title} description={k.subtitle} actions={add} />
      {takers.length === 0 ? <EmptyState title={k.empty} description={k.emptyHint} actions={add} /> : (
        <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={k.performance} description={k.performanceHint}>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {takers.map((x) => {
              const f = figures.get(x.id);
              const rows: [string, string | null][] = [
                [k.orders, f ? formatNumber(f.orders, locale) : null], [k.totalSales, money(f?.total_sales)], [k.customers, formatNumber(x.customers, locale)],
                [k.delivered, f ? formatNumber(f.delivered_orders, locale) : null], [k.cancelled, f ? formatNumber(f.cancelled_orders, locale) : null],
                [k.collected, money(f?.collected)], [k.pending, money(f?.pending_collections)], [k.cashHeld, money(f?.cash_held)],
              ];
              return (
                <li key={x.id} className="rounded-2xl border bg-card p-5 shadow-card">
                  <div className="flex items-start gap-4">
                    <EmployeeAvatar name={x.nameEn} url={photos.get(x.photoPath ?? "")} className="size-14" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/order-takers/${x.id}`} className="font-medium break-words text-navy hover:text-primary hover:underline">{local(x.nameEn, x.nameUr)}</Link>
                      <p className="text-sm text-muted-foreground"><bdi>{x.territory ?? "—"}</bdi></p>
                      {x.phone && <Ltr className="text-sm text-muted-foreground">{x.phone}</Ltr>}
                    </div>
                    <StatusBadge tone={x.isActive ? "green" : "gray"}>{x.isActive ? t.employees.statusLabels[x.status] : x.status === "terminated" ? t.employees.statusLabels.terminated : k.inactive}</StatusBadge>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t pt-4 text-sm">
                    {rows.filter(([, v]) => v !== null).map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd><Ltr className="font-medium tabular-nums">{value}</Ltr></dd>
                      </div>
                    ))}
                  </dl>
                </li>
              );
            })}
          </ul>
        </PeriodFrame>
      )}
    </>
  );
}
