import type { Metadata } from "next";
import Link from "next/link";
import { CalendarOff, Plus, UserCheck, UserCog, UserRoundX, Users } from "lucide-react";
import { visibleNavigation } from "@/config/navigation";
import { loadAccessAudit } from "@/features/audit/access-audit";
import { loadEmployeeFigures, loadUserFigures } from "@/features/dashboard/queries";
import { fill } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { BarListCard } from "@/components/charts/bar-list";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { formatDateTime, formatNumber } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).dashboard.title };
}

export default async function DashboardPage() {
  const ctx = await requireActiveSession();
  if (!can(ctx, "dashboard.view")) return <Forbidden />;
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const [employees, users, audit] = await Promise.all([
    loadEmployeeFigures(ctx),
    loadUserFigures(ctx),
    can(ctx, "audit.view") ? loadAccessAudit(ctx, t, locale, 5) : null,
  ]);
  const modules = visibleNavigation(ctx.permissions).flatMap((g) => g.items).filter((i) => i.href !== "/dashboard");
  const n = (value: number) => formatNumber(value, locale);

  return (
    <>
      <PageHeader
        title={fill(t.dashboard.greeting, { name: ctx.fullName || ctx.email })}
        description={t.dashboard.subtitle}
        actions={
          <>
            {can(ctx, "users.manage") && <LinkButton variant="outline" href="/admin/users"><UserCog aria-hidden />{t.nav.users}</LinkButton>}
            {can(ctx, "employees.manage") && <LinkButton href="/employees/new"><Plus aria-hidden />{t.employees.add}</LinkButton>}
          </>
        }
      />

      {(employees || users) && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {employees && (
            <>
              <StatCard label={t.dashboard.employeesActive} value={n(employees.active)} icon={Users} href="/employees?status=active" />
              <StatCard label={t.dashboard.employeesOnLeave} value={n(employees.onLeave)} icon={CalendarOff} href="/employees?status=on_leave" />
            </>
          )}
          {users && (
            <>
              <StatCard label={t.dashboard.usersActive} value={n(users.active)} icon={UserCheck} href="/admin/users" />
              <StatCard
                label={t.dashboard.usersNoRole} value={n(users.withoutRole)} icon={UserRoundX} href="/admin/users"
                tone={users.withoutRole > 0 ? "attention" : "default"}
              />
            </>
          )}
        </div>
      )}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        {employees?.byDepartment && (
          <BarListCard
            title={t.dashboard.byDepartment}
            description={t.dashboard.byDepartmentHint}
            categoryLabel={t.employees.department}
            series={{ key: "employees", label: t.employees.title }}
            points={employees.byDepartment.map((d) => ({
              label: d.department ?? t.dashboard.noDepartment,
              values: [{ value: d.count, display: n(d.count) }],
            }))}
          />
        )}
        {audit && (
          <SectionCard
            title={t.dashboard.recentAccess}
            action={<LinkButton variant="ghost" size="sm" href="/admin/audit">{t.dashboard.viewAll}</LinkButton>}
          >
            {audit.length === 0 ? <p className="text-sm text-muted-foreground">{t.common.noResults}</p> : (
              <ul className="grid gap-4">
                {audit.map((row) => (
                  <li key={row.id} className="flex gap-3 text-sm">
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                    <div className="min-w-0">
                      <p className="break-words"><bdi className="font-medium">{row.subject || row.action}</bdi>{row.subject && <span className="text-muted-foreground"> — {row.action}</span>}</p>
                      <p className="text-xs text-muted-foreground"><bdi>{row.actor}</bdi> · <bdi>{formatDateTime(row.occurredAt, locale)}</bdi></p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        )}
        <SectionCard title={t.dashboard.modules} description={t.dashboard.modulesHint} className="lg:col-span-2">
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors outline-none hover:border-primary/40 hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/40">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><item.icon className="size-4.5" aria-hidden /></span>
                  <span className="min-w-0 flex-1 text-sm font-medium">{item.label(t)}</span>
                  <StatusBadge tone={item.planned ? "gray" : "green"} dot={!item.planned}>{item.planned ? t.nav.planned : t.dashboard.available}</StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
