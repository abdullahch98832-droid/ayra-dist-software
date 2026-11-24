import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPayrollEmployees, loadRun } from "@/features/payroll/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { formatBucket } from "@/components/shared/format";
import { PayrollForm } from "./payroll-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).payroll.edit };
}

export default async function EditPayrollPage({ params }: PageProps<"/payroll/[id]/edit">) {
  const { id, ctx, t, locale } = await pageContext(params);
  if (!can(ctx, "payroll.manage")) return <Forbidden />;
  const [run, employees] = await Promise.all([loadRun(id), loadPayrollEmployees()]);
  if (!run || run.status !== "draft") notFound();
  const used = new Set(run.payroll_items.map((i) => i.employee_id));
  const amount = (n: number) => (n === 0 ? "" : toDbAmount(toPaisa(n)));
  const month = formatBucket(run.period_month, "month", locale);
  return (
    <>
      <PageHeader title={`${t.payroll.edit}: ${month}`} breadcrumbs={[{ label: t.payroll.title, href: "/payroll" }, { label: month, href: `/payroll/${id}` }]} />
      <PayrollForm
        runId={id} employees={employees.filter((e) => e.is_active || used.has(e.employee_id)).map((e) => ({ id: e.employee_id, code: e.code, nameEn: e.full_name, nameUr: e.full_name_ur, salary: amount(e.base_salary), advance: toDbAmount(toPaisa(e.advances)) }))}
        defaults={{
          notes: run.notes ?? "",
          lines: run.payroll_items.map((i) => ({ employeeId: i.employee_id, basic: amount(i.basic_salary), allowances: amount(i.allowances), bonus: amount(i.bonus), deductions: amount(i.deductions), recovery: amount(i.advance_recovery), notes: i.notes ?? "" })),
        }}
      />
    </>
  );
}
