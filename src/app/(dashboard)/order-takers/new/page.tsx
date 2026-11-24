import type { Metadata } from "next";
import { loadEmployeeChoices, loadTakers } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { TakerForm } from "../taker-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).takers.add };
}

export default async function NewTakerPage() {
  const { ctx, t } = await pageContext();
  if (!can(ctx, "sales.team")) return <Forbidden />;
  const takers = await loadTakers();
  const employees = await loadEmployeeChoices(ctx, takers.map((x) => x.id));
  const canEditEmployee = can(ctx, "employees.manage");
  return (
    <>
      <PageHeader title={t.takers.add} breadcrumbs={[{ label: t.takers.title, href: "/order-takers" }]} />
      <TakerForm
        existing={false} employees={employees} canEditEmployee={canEditEmployee}
        defaults={{ employeeId: canEditEmployee ? "" : employees[0]?.id ?? "", editEmployee: false, name: "", nameUr: "", phone: "", whatsapp: "", status: "active", territory: "", isActive: true, notes: "" }}
      />
    </>
  );
}
