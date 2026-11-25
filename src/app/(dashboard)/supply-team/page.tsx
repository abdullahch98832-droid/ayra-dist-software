import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { EmployeeAvatar } from "@/features/employees/employee-avatar";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { loadSupplyStaff, loadSupplyWork } from "@/features/supply/queries";
import { takerPhotos } from "@/features/takers/queries";
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
  return { title: (await getT()).supply.title };
}

export default async function SupplyTeamPage({ searchParams }: PageProps<"/supply-team">) {
  const { ctx, t, locale, local } = await pageContext();
  if (!can(ctx, "sales.team") && !can(ctx, "sales.view_all")) return <Forbidden />;
  const s = t.supply;
  const today = businessToday();
  const period = parsePeriod(await searchParams, today);
  const [staff, work] = await Promise.all([loadSupplyStaff(), loadSupplyWork(period.from, period.to)]);
  const photos = await takerPhotos(staff);
  const figures = new Map(work.map((r) => [r.employee_id, r]));
  const add = can(ctx, "sales.team") && <LinkButton href="/supply-team/new"><Plus aria-hidden />{s.add}</LinkButton>;
  const money = (v: number | null | undefined) => (v === null || v === undefined ? null : formatPaisa(toPaisa(v), locale));
  const n = (v: number | undefined) => formatNumber(v ?? 0, locale);
  return (
    <>
      <PageHeader title={s.title} description={s.subtitle} actions={add} />
      {staff.length === 0 ? <EmptyState title={s.empty} description={s.emptyHint} actions={add} /> : (
        <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={s.performance} description={s.performanceHint}>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {staff.map((x) => {
              const f = figures.get(x.id);
              const rows: [string, string | null][] = [
                [s.delivered, n(f?.delivered)], [s.onTheWay, n(f?.on_the_way)], [s.shops, n(f?.shops)], [s.amount, money(f?.amount)], [s.moneyReceived, money(f?.money_received)], [s.cashHeld, money(f?.cash_held)],
              ];
              return (
                <li key={x.id} className="rounded-2xl border bg-card p-5 shadow-card">
                  <div className="flex items-start gap-4">
                    <EmployeeAvatar name={x.nameEn} url={photos.get(x.photoPath ?? "")} className="size-14" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/supply-team/${x.id}`} className="font-medium break-words text-navy hover:text-primary hover:underline">{local(x.nameEn, x.nameUr)}</Link>
                      {x.phone && <p><Ltr className="text-sm text-muted-foreground">{x.phone}</Ltr></p>}
                    </div>
                    <StatusBadge tone={x.isActive ? "green" : "gray"}>{x.isActive ? t.employees.statusLabels[x.status] : x.status === "terminated" ? t.employees.statusLabels.terminated : s.inactive}</StatusBadge>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t pt-4 text-sm">
                    {rows.filter(([, v]) => v !== null).map(([label, value]) => (
                      <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd><Ltr className="font-medium tabular-nums">{value}</Ltr></dd></div>
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
