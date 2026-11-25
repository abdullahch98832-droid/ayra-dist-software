import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadSupplyStaff } from "@/features/supply/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { StaffForm } from "../../staff-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).supply.edit };
}

export default async function EditSupplyStaffPage({ params }: PageProps<"/supply-team/[id]/edit">) {
  const { id, ctx, t, local } = await pageContext(params);
  if (!can(ctx, "sales.team")) return <Forbidden />;
  const x = (await loadSupplyStaff()).find((p) => p.id === id);
  if (!x) notFound();
  const canEditEmployee = can(ctx, "employees.manage");
  return (
    <>
      <PageHeader title={t.supply.edit} breadcrumbs={[{ label: t.supply.title, href: "/supply-team" }, { label: local(x.nameEn, x.nameUr), href: `/supply-team/${id}` }]} />
      <StaffForm
        existing employees={[]} canEditEmployee={canEditEmployee}
        defaults={{ employeeId: id, editEmployee: canEditEmployee, name: x.nameEn, nameUr: x.nameUr ?? "", phone: x.phone ?? "", whatsapp: x.whatsapp ?? "", status: x.status, isActive: x.isActive || x.status === "terminated", notes: x.notes ?? "" }}
      />
    </>
  );
}
