import type { Metadata } from "next";
import { accountLabel, loadPaymentAccounts } from "@/features/cash-bank/queries";
import { businessToday } from "@/features/dashboard/period";
import { loadPayrollEmployees } from "@/features/payroll/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext, uuidParam } from "@/lib/page-context";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { AdvanceForm } from "./advance-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).payroll.newAdvance };
}

export default async function NewAdvancePage({ searchParams }: PageProps<"/payroll/advances/new">) {
  const { ctx, t } = await pageContext();
  const payer = can(ctx, "payroll.pay");
  if (!can(ctx, "payroll.view") || (!payer && !can(ctx, "payroll.manage"))) return <Forbidden />;
  const wanted = uuidParam((await searchParams).employee);
  const [employees, accounts] = await Promise.all([loadPayrollEmployees(), loadPaymentAccounts()]);
  const active = accounts.filter((a) => a.isActive);
  const people = employees.filter((e) => e.is_active);
  return (
    <>
      <PageHeader title={t.payroll.newAdvance} breadcrumbs={[{ label: t.payroll.tabs.advances, href: "/payroll/advances" }]} />
      {active.length === 0 ? <FormAlert tone="info">{t.cashBank.noAccounts}</FormAlert> : (
        <AdvanceForm
          employees={people.map((e) => ({ id: e.employee_id, code: e.code, nameEn: e.full_name, nameUr: e.full_name_ur }))} accounts={active.map((a) => ({ id: a.id, label: accountLabel(a) }))} payer={payer}
          defaults={{ employeeId: people.some((e) => e.employee_id === wanted) ? wanted ?? "" : "", date: businessToday(), amount: "", accountId: active.length === 1 ? active[0]?.id ?? "" : "", method: "cash", reference: "", reason: "", requestId: crypto.randomUUID() }}
        />
      )}
    </>
  );
}
