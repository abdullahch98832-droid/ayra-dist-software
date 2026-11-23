import { notFound } from "next/navigation";
import { z } from "zod";
import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { EMPLOYEE_COLUMNS, signedPhotoUrls, type EmployeeRecord } from "@/features/employees/queries";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { EmployeeForm } from "../employee-form";
import { PhotoUploader } from "../photo-uploader";

export default async function EmployeePage({ params }: PageProps<"/employees/[id]">) {
  const ctx = await requireActiveSession();
  if (!can(ctx, "employees.view")) return <Forbidden />;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const t = await getT();
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
        title={employee.full_name}
        description={[employee.employee_code, linked.data ? `${t.employees.linkedUser}: ${linked.data.full_name}` : null].filter(Boolean).join(" · ")}
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
  const t = await getT();
  const rows: [string, string | null | undefined][] = [
    [t.employees.fullNameUr, employee.full_name_ur],
    [t.employees.jobTitle, employee.job_title],
    [t.employees.department, employee.department],
    [t.employees.phone, employee.phone],
    [t.employees.whatsapp, employee.whatsapp],
    [t.employees.joiningDate, employee.hire_date],
    [t.employees.status, t.employees.statusLabels[employee.status]],
    ...(salary !== undefined ? [[t.employees.salary, salary === null ? "—" : Number(salary).toFixed(2)] as [string, string]] : []),
  ];
  return (
    <dl className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-sm">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
