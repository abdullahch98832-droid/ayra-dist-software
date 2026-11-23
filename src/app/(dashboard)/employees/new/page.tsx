import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { EmployeeForm } from "../employee-form";

export default async function NewEmployeePage() {
  const ctx = await requireActiveSession();
  if (!can(ctx, "employees.manage")) return <Forbidden />;
  const t = await getT();
  return (
    <>
      <PageHeader title={t.employees.add} />
      <EmployeeForm
        employeeId={null}
        salaryAccess={can(ctx, "payroll.manage") ? "manage" : "none"}
        defaults={{
          employeeCode: "", fullName: "", fullNameUr: "", fatherName: "", cnic: "", phone: "", whatsapp: "",
          email: "", address: "", department: "", jobTitle: "", hireDate: "", status: "active",
          emergencyContact: "", notes: "", salary: "",
        }}
      />
    </>
  );
}
