"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/context";
import type { EmploymentStatus } from "@/lib/validation/employees";
import { EmployeeAvatar } from "@/features/employees/employee-avatar";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { Ltr } from "@/components/shared/bidi";
import { StatusBadge } from "@/components/shared/status-badge";
import { EMPLOYEE_STATUS_TONE } from "./employee-status";

export interface EmployeeRow {
  id: string;
  code: string;
  name: string;
  nameUr: string | null;
  jobTitle: string | null;
  department: string | null;
  phone: string | null;
  status: EmploymentStatus;
  photoUrl?: string;
}

export function EmployeesTable({ rows, empty, toolbar }: {
  rows: EmployeeRow[];
  empty: React.ComponentProps<typeof DataTable>["empty"];
  toolbar: React.ReactNode;
}) {
  const { t, locale } = useI18n();
  const displayName = (e: EmployeeRow) => (locale === "ur" && e.nameUr ? e.nameUr : e.name);
  const columns: DataTableColumn<EmployeeRow>[] = [
    {
      id: "name", header: t.employees.fullName, primary: true, sortValue: displayName,
      cell: (e) => (
        <Link href={`/employees/${e.id}`} className="group flex items-center gap-3 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
          <EmployeeAvatar name={e.name} url={e.photoUrl} />
          <span className="min-w-0">
            <span className="block font-medium break-words group-hover:text-primary group-hover:underline">{displayName(e)}</span>
            {locale === "ur" && e.nameUr && <bdi className="font-latin block text-xs text-muted-foreground">{e.name}</bdi>}
          </span>
        </Link>
      ),
    },
    { id: "code", header: t.employees.code, sortValue: (e) => e.code, cell: (e) => <Ltr className="font-mono text-xs">{e.code}</Ltr> },
    { id: "jobTitle", header: t.employees.jobTitle, sortValue: (e) => e.jobTitle, cell: (e) => e.jobTitle ?? "—" },
    { id: "department", header: t.employees.department, sortValue: (e) => e.department, hideBelow: "lg", cell: (e) => e.department ?? "—" },
    { id: "phone", header: t.employees.phone, hideBelow: "lg", cell: (e) => (e.phone ? <Ltr className="whitespace-nowrap tabular-nums">{e.phone}</Ltr> : "—") },
    {
      id: "status", header: t.common.status, sortValue: (e) => t.employees.statusLabels[e.status],
      cell: (e) => <StatusBadge tone={EMPLOYEE_STATUS_TONE[e.status]}>{t.employees.statusLabels[e.status]}</StatusBadge>,
    },
  ];
  return (
    <DataTable
      rows={rows} columns={columns} rowKey={(e) => e.id} caption={t.employees.title}
      toolbar={toolbar} empty={empty} initialSort={{ id: "name" }}
    />
  );
}
