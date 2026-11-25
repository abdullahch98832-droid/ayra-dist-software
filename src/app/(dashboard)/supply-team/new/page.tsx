import type { Metadata } from "next";
import { loadSupplyStaff } from "@/features/supply/queries";
import { loadEmployeeChoices } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { StaffForm } from "../staff-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).supply.add };
}

export default async function NewSupplyStaffPage() {
  const { ctx, t } = await pageContext();
  if (!can(ctx, "sales.team")) return <Forbidden />;
  const employees = await loadEmployeeChoices(ctx, (await loadSupplyStaff()).map((x) => x.id));
  const canEditEmployee = can(ctx, "employees.manage");
  return (
    <>
      <PageHeader title={t.supply.add} description={t.supply.subtitle} breadcrumbs={[{ label: t.supply.title, href: "/supply-team" }]} />
      <StaffForm
        existing={false} employees={employees} canEditEmployee={canEditEmployee}
        defaults={{ employeeId: canEditEmployee ? "" : employees[0]?.id ?? "", editEmployee: false, name: "", nameUr: "", phone: "", whatsapp: "", status: "active", isActive: true, notes: "" }}
      />
    </>
  );
}
