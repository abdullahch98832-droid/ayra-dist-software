import type { Metadata } from "next";
import { reportPayroll } from "@/features/payroll/queries";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { documentOptions } from "@/features/sales/status";
import { getT } from "@/i18n/server";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { formatBucket } from "@/components/shared/format";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.payroll };
}

export default async function PayrollReport({ searchParams }: PageProps<"/reports/payroll">) {
  const { t, locale, today, period, allowed, local } = await reportPage(REPORTS.payroll, searchParams);
  if (!allowed) return <Forbidden />;
  const p = t.payroll;
  const rows = await reportPayroll(period.from, period.to);
  return (
    <>
      <PageHeader title={t.reports.payroll} breadcrumbs={[{ label: t.reports.title, href: "/reports" }]} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={t.reports.payroll} description={t.reports.payrollHint}>
        <SpecTable
          caption={t.reports.payroll}
          exportName={`payroll-${period.from}-${period.to}`}
          rows={rows.map((r) => ({ id: r.payroll_item_id, name: local(r.full_name, r.full_name_ur), nameHref: `/payroll/employees/${r.employee_id}`, month: formatBucket(r.period_month, "month", locale), basic: r.basic_salary, allowances: r.allowances, bonus: r.bonus, deductions: r.deductions, recovery: r.advance_recovery, net: r.net_pay, paid: r.paid, pending: r.pending, status: r.status }))}
          columns={[
            { key: "name", sub: "month", label: p.employee, kind: "link", primary: true }, { key: "basic", label: p.basic, kind: "money", hideBelow: "lg", total: true }, { key: "allowances", label: p.allowances, kind: "money", hideBelow: "2xl", total: true }, { key: "bonus", label: p.bonus, kind: "money", hideBelow: "xl", total: true },
            { key: "deductions", label: p.deductions, kind: "money", hideBelow: "xl", total: true }, { key: "recovery", label: p.recovery, kind: "money", hideBelow: "2xl", total: true }, { key: "net", label: p.net, kind: "money", total: true }, { key: "paid", label: p.paid, kind: "money", total: true },
            { key: "pending", label: p.pending, kind: "money", total: true }, { key: "status", label: t.common.status, kind: "status", options: documentOptions(t) },
          ]}
          searchKeys={["name", "month"]}
          empty={{ title: t.reports.empty, description: t.reports.emptyHint }}
        />
      </PeriodFrame>
    </>
  );
}
