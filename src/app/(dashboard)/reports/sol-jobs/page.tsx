import type { Metadata } from "next";
import { seesSettlements } from "@/features/sales/access";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { loadJobTypes, loadSolSummary, reportSolJobs } from "@/features/sol/queries";
import { JOB_STATUSES, jobOptions } from "@/features/sol/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { uuidParam } from "@/lib/page-context";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { formatDate, formatNumber } from "@/components/shared/format";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.solJobs };
}

export default async function SolJobsReport({ searchParams }: PageProps<"/reports/sol-jobs">) {
  const { ctx, t, locale, query, today, period, allowed, local } = await reportPage(REPORTS.solJobs, searchParams);
  if (!allowed) return <Forbidden />;
  const s = t.sol;
  const statuses = ["pending", ...JOB_STATUSES];
  const status = typeof query.status === "string" && statuses.includes(query.status) ? query.status : "";
  const [rows, x, types] = await Promise.all([reportSolJobs({ from: period.from, to: period.to, status, typeId: uuidParam(query.type) }), loadSolSummary(period.from, period.to), loadJobTypes()]);
  const paid = seesSettlements(ctx);
  const costs = can(ctx, "costs.view");
  const n = (v: number) => formatNumber(v, locale);
  const rs = (v: string | undefined) => (v === undefined ? null : formatPaisa(toPaisa(v), locale));
  const figures: [string, string | null][] = [
    [s.totalJobs, n(x.total_jobs)], [s.completedJobs, n(x.completed_jobs)], [s.pendingJobs, n(x.pending_jobs)], [s.totalContract, rs(x.contract_value)], [s.receivedPayments, rs(x.received)], [s.pendingPayments, rs(x.pending_payments)],
    [s.directCosts, rs(x.direct_costs)], [s.vehicleExpenses, rs(x.vehicle_expenses)], [s.profit, rs(x.profit)],
  ];
  return (
    <>
      <PageHeader title={t.reports.solJobs} breadcrumbs={[{ label: t.reports.title, href: "/reports" }]} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={t.reports.solJobs} description={t.reports.solJobsHint}>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border shadow-card sm:grid-cols-3">
          {figures.filter(([, v]) => v !== null).map(([label, value]) => (
            <div key={label} className="bg-card px-4 py-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold text-navy"><Ltr>{value}</Ltr></dd></div>
          ))}
        </dl>
        <SpecTable
          caption={t.reports.solJobs}
          exportName={`sol-jobs-${period.from}-${period.to}`}
          rows={rows.map((j) => ({
            id: j.job_id, no: j.doc_no, noHref: `/sol/jobs/${j.job_id}`, date: formatDate(j.job_date, locale), client: local(j.customer, j.customer_ur), type: j.type_en ? local(j.type_en, j.type_ur) : null, responsible: j.responsible_en ? local(j.responsible_en, j.responsible_ur) : null,
            status: j.status,
            // As in the totals above: drafts and cancelled jobs have no contract in force.
            contract: j.status === "draft" || j.status === "cancelled" ? 0 : j.contract_value, received: j.received, pending: j.pending, direct: j.direct_costs, vehicle: j.vehicle_expenses, profit: j.profit,
          }))}
          columns={[
            { key: "no", sub: "date", label: s.jobNo, kind: "link", primary: true }, { key: "client", sub: "type", label: s.client, kind: "text" },
            { key: "status", label: t.common.status, kind: "status", options: jobOptions(t) }, { key: "contract", label: s.contract, kind: "money", total: true },
            ...(paid ? [{ key: "received", label: s.received, kind: "money" as const, hideBelow: "2xl" as const, total: true }, { key: "pending", label: s.outstanding, kind: "money" as const, hideBelow: "lg" as const, total: true }] : []),
            ...(costs ? [{ key: "direct", label: s.directCosts, kind: "money" as const, hideBelow: "xl" as const, total: true }, { key: "vehicle", label: s.vehicleExpenses, kind: "money" as const, hideBelow: "xl" as const, total: true }, { key: "profit", label: s.profit, kind: "money" as const, total: true }] : []),
          ]}
          searchKeys={["no", "client", "type", "responsible"]}
          toolbar={
            <>
              <UrlSelect param="status" label={t.documents.allStatuses} options={statuses.map((v) => ({ value: v, label: v === "pending" ? s.pendingStatus : s.statuses[v as "draft"] }))} />
              {types.length > 1 && <UrlSelect param="type" label={s.allTypes} options={types.map((v) => ({ value: v.id, label: local(v.nameEn, v.nameUr) }))} />}
            </>
          }
          empty={{ title: t.reports.empty, description: t.reports.emptyHint }}
        />
      </PeriodFrame>
    </>
  );
}
