import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, CircleCheck, Coins, Hourglass, ListChecks, Plus, Receipt, TrendingUp, Truck, Wallet } from "lucide-react";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { loadJobs, loadSolSummary } from "@/features/sol/queries";
import { jobOptions } from "@/features/sol/status";
import { fill, isolate } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { formatDate, formatNumber } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StateMessage } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sol.title };
}

export default async function SolOverview({ searchParams }: PageProps<"/sol">) {
  const { ctx, t, locale, local } = await pageContext();
  if (!can(ctx, "sol.view")) return <Forbidden />;
  const s = t.sol;
  const today = businessToday();
  const period = parsePeriod(await searchParams, today);
  const [x, open] = await Promise.all([loadSolSummary(period.from, period.to), loadJobs({ q: "", status: "pending", page: 1, supplierId: null })]);
  const n = (v: number) => formatNumber(v, locale);
  const rs = (v: string) => formatPaisa(toPaisa(v), locale);
  const money = (v: string) => <Ltr>{rs(v)}</Ltr>;
  const options = jobOptions(t);
  const add = can(ctx, "sol.manage") && <LinkButton href="/sol/jobs/new"><Plus aria-hidden />{s.newJob}</LinkButton>;
  const notes = [x.draft_jobs > 0 && fill(s.draftJobs, { count: n(x.draft_jobs) }), x.cancelled_jobs > 0 && fill(s.cancelledJobs, { count: n(x.cancelled_jobs) })].filter(Boolean).join(" · ");
  return (
    <>
      <PageHeader title={s.title} description={s.subtitle} actions={add} />
      <div className="grid gap-6">
        <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={s.tabs.overview} description={s.overviewHint}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label={s.totalJobs} value={n(x.total_jobs)} icon={ListChecks} hint={notes || undefined} href="/sol/jobs" />
            <StatCard label={s.completedJobs} value={n(x.completed_jobs)} icon={CircleCheck} href="/sol/jobs?status=completed" />
            <StatCard label={s.pendingJobs} value={n(x.pending_jobs)} icon={Hourglass} tone={x.overdue_jobs ? "attention" : "default"} hint={x.overdue_jobs ? fill(s.overdueJobs, { count: n(x.overdue_jobs) }) : undefined} href="/sol/jobs?status=pending" />
            <StatCard label={s.totalContract} value={money(x.contract_value)} icon={Receipt} />
            {x.received !== undefined && <StatCard label={s.receivedPayments} value={money(x.received)} icon={Banknote} hint={x.advances && toPaisa(x.advances) > BigInt(0) ? fill(s.advances, { amount: isolate(rs(x.advances)) }) : undefined} href="/sol/payments" />}
            {x.pending_payments !== undefined && <StatCard label={s.pendingPayments} value={money(x.pending_payments)} icon={Wallet} tone={x.due_now && toPaisa(x.due_now) > BigInt(0) ? "attention" : "default"} hint={x.due_now ? fill(s.dueNow, { amount: isolate(rs(x.due_now)) }) : undefined} />}
            {x.direct_costs !== undefined && <StatCard label={s.directCosts} value={money(x.direct_costs)} icon={Coins} />}
            {x.vehicle_expenses !== undefined && <StatCard label={s.vehicleExpenses} value={money(x.vehicle_expenses)} icon={Truck} />}
            {x.profit !== undefined && <StatCard label={s.profit} value={money(x.profit)} icon={TrendingUp} hint={s.profitHint} href={can(ctx, "reports.view") ? "/reports/sol-jobs" : undefined} />}
          </div>
        </PeriodFrame>
        <SectionCard title={s.openJobs} action={<LinkButton variant="ghost" size="sm" href="/sol/jobs?status=pending">{t.common.all}</LinkButton>}>
          {open.rows.length === 0 ? <StateMessage headingLevel="p" title={s.noOpenJobs} className="py-6" /> : (
            <ul className="divide-y">
              {open.rows.slice(0, 8).map((j) => {
                const status = options[j.status];
                const late = j.due_date !== null && j.due_date < today;
                return (
                  <li key={j.id} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link href={`/sol/jobs/${j.id}`} className="text-sm font-medium hover:text-primary hover:underline"><Ltr>{j.doc_no}</Ltr></Link>
                      <p className="text-xs break-words text-muted-foreground"><bdi>{j.customer && local(j.customer.name, j.customer.name_ur)}</bdi>{j.due_date && <> · {s.dueDate} <bdi>{formatDate(j.due_date, locale)}</bdi></>}</p>
                    </div>
                    <div className="grid shrink-0 justify-items-end gap-1">
                      <Money amount={toPaisa(j.contract_value)} locale={locale} className="text-sm font-semibold" />
                      <span className="flex flex-wrap justify-end gap-1.5">{late && <StatusBadge tone="red">{s.overdue}</StatusBadge>}{status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
