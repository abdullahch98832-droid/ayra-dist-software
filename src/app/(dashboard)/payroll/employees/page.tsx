import type { Metadata } from "next";
import { loadPayrollEmployees } from "@/features/payroll/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SalariesTable } from "./salaries-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).payroll.tabs.employees };
}

export default async function PayrollEmployeesPage() {
  const { ctx, t } = await pageContext();
  if (!can(ctx, "payroll.view")) return <Forbidden />;
  return (
    <>
      <PageHeader title={t.payroll.tabs.employees} />
      <SalariesTable employees={await loadPayrollEmployees()} manage={can(ctx, "payroll.manage")} />
    </>
  );
}
