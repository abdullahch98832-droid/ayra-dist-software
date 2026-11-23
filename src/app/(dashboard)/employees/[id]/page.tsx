import { notFound } from "next/navigation";
import { z } from "zod";
import { getLocale, getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { EMPLOYEE_COLUMNS, signedPhotoUrls, type EmployeeRecord } from "@/features/employees/queries";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate } from "@/components/shared/format";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { toPaisa } from "@/lib/utils/money";
import { EmployeeForm } from "../employee-form";
import { EMPLOYEE_STATUS_TONE } from "../employee-status";
import { PhotoUploader } from "../photo-uploader";

export default async function EmployeePage({ params }: PageProps<"/employees/[id]">) {
  const ctx = await requireActiveSession();
  if (!can(ctx, "employees.view")) return <Forbidden />;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const supabase = await createClient();

  const canViewSalary = can(ctx, "payroll.view");
  const [{ data: employee }, salary, linked] = await Promise.all([
    supabase.from("employees").select(EMPLOYEE_COLUMNS).eq("id", id).returns<EmployeeRecord[]>().maybeSingle(),
    canViewSalary
      ? supabase.from("employee_salaries").select("base_salary").eq("employee_id", id).maybeSingle()
      : Promise.resolve({ data: null }),
    can(ctx, "users.view")
      ? supabase.from("profiles").select("full_name").eq("employee_id", id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!employee) notFound();
  const photo = (await signedPhotoUrls([employee.photo_path])).get(employee.photo_path ?? "");
  const canEdit = can(ctx, "employees.manage");
  const baseSalary = salary.data?.base_salary;

  return (
    <>
      <PageHeader
        title={locale === "ur" && employee.full_name_ur ? employee.full_name_ur : employee.full_name}
        breadcrumbs={[{ label: t.employees.title, href: "/employees" }]}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Ltr className="font-mono text-xs">{employee.employee_code}</Ltr>
            <StatusBadge tone={EMPLOYEE_STATUS_TONE[employee.status]}>{t.employees.statusLabels[employee.status]}</StatusBadge>
            {linked.data && <span>{t.employees.linkedUser}: {linked.data.full_name}</span>}
          </span>
        }
      />
      <div className="grid max-w-4xl gap-6">
        <PhotoUploader employeeId={employee.id} name={employee.full_name} url={photo} canEdit={canEdit} />
        {canEdit ? (
          <EmployeeForm
            employeeId={employee.id}
            salaryAccess={can(ctx, "payroll.manage") ? "manage" : canViewSalary ? "view" : "none"}
            defaults={{
              employeeCode: employee.employee_code,
              fullName: employee.full_name,
              fullNameUr: employee.full_name_ur ?? "",
              fatherName: employee.father_name ?? "",
              cnic: employee.cnic ?? "",
              phone: employee.phone ?? "",
              whatsapp: employee.whatsapp ?? "",
              email: employee.email ?? "",
              address: employee.address ?? "",
              department: employee.department ?? "",
              jobTitle: employee.job_title ?? "",
              hireDate: employee.hire_date ?? "",
              status: employee.status,
              emergencyContact: employee.emergency_contact ?? "",
              notes: employee.notes ?? "",
              // numeric arrives as a JSON number; toFixed(2) restores the exact 2-decimal value.
              salary: baseSalary === undefined || baseSalary === null ? "" : Number(baseSalary).toFixed(2),
            }}
          />
        ) : (
          <EmployeeDetails employee={employee} salary={baseSalary} />
        )}
      </div>
    </>
  );
}

async function EmployeeDetails({ employee, salary }: { employee: EmployeeRecord; salary: number | null | undefined }) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  return (
    <SectionCard title={t.employees.employment}>
      <DescriptionList
        items={[
          { label: t.employees.fullNameUr, value: employee.full_name_ur && <span lang="ur" dir="rtl">{employee.full_name_ur}</span> },
          { label: t.employees.jobTitle, value: employee.job_title },
          { label: t.employees.department, value: employee.department },
          { label: t.employees.phone, value: employee.phone && <Ltr>{employee.phone}</Ltr> },
          { label: t.employees.whatsapp, value: employee.whatsapp && <Ltr>{employee.whatsapp}</Ltr> },
          { label: t.employees.joiningDate, value: formatDate(employee.hire_date, locale) },
          ...(salary !== undefined
            ? [{ label: t.employees.salary, value: salary === null ? null : <Money amount={toPaisa(salary)} locale={locale} /> }]
            : []),
        ]}
      />
    </SectionCard>
  );
}
