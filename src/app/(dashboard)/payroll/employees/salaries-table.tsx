"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { setSalaryAction } from "@/features/payroll/actions";
import type { PayrollEmployee } from "@/features/payroll/queries";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { ActionError } from "@/components/forms/action-error";
import { Field } from "@/components/forms/field";
import { MoneyInput } from "@/components/forms/money-input";
import { Ltr, Money } from "@/components/shared/bidi";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

export function SalariesTable({ employees, manage }: { employees: PayrollEmployee[]; manage: boolean }) {
  const { t, locale } = useI18n();
  const p = t.payroll;
  const [editing, setEditing] = useState<{ id: string; name: string; salary: string } | null>(null);
  const [result, setResult] = useState<ActionResult<null> | null>(null);
  const [pending, startTransition] = useTransition();
  const name = (e: PayrollEmployee) => (locale === "ur" && e.full_name_ur ? e.full_name_ur : e.full_name);
  const money = (n: number) => <Money amount={toPaisa(n)} locale={locale} />;
  const columns: DataTableColumn<PayrollEmployee>[] = [
    { id: "name", header: p.employee, primary: true, sortValue: name, cell: (e) => <span><Link href={`/payroll/employees/${e.employee_id}`} className="font-medium hover:text-primary hover:underline">{name(e)}</Link><Ltr className="block text-xs text-muted-foreground">{e.code}</Ltr></span> },
    { id: "salary", header: p.salary, align: "end", sortValue: (e) => toPaisa(e.base_salary), cell: (e) => (e.base_salary > 0 ? money(e.base_salary) : <span className="text-muted-foreground">{p.noSalary}</span>) },
    { id: "advances", header: p.advances, align: "end", sortValue: (e) => toPaisa(e.advances), cell: (e) => money(e.advances) },
    { id: "payable", header: p.payable, align: "end", sortValue: (e) => toPaisa(e.payable), cell: (e) => money(e.payable) },
    { id: "status", header: t.common.status, hideBelow: "lg", cell: (e) => <StatusBadge tone={e.is_active ? "green" : "gray"}>{e.is_active ? t.catalog.active : t.catalog.inactive}</StatusBadge> },
    ...(manage ? [{ id: "actions", header: "", cell: (e: PayrollEmployee) => <Button variant="ghost" size="icon-sm" aria-label={`${p.setSalary}: ${e.full_name}`} onClick={() => { setResult(null); setEditing({ id: e.employee_id, name: name(e), salary: e.base_salary > 0 ? toDbAmount(toPaisa(e.base_salary)) : "" }); }}><Pencil /></Button> }] : []),
  ];
  return (
    <>
      <DataTable rows={employees} columns={columns} rowKey={(e) => e.employee_id} caption={p.tabs.employees} searchText={(e) => `${e.full_name} ${e.full_name_ur ?? ""} ${e.code}`} empty={{ title: p.none }} />
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          {editing && (
            <form
              noValidate className="grid gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  const res = await setSalaryAction({ employeeId: editing.id, salary: editing.salary });
                  setResult(res);
                  if (res.ok) { setEditing(null); toast.add({ title: p.salarySaved, type: "success" }); }
                });
              }}
            >
              <DialogHeader><DialogTitle>{p.setSalary}: {editing.name}</DialogTitle></DialogHeader>
              <ActionError result={result} />
              <Field id="salary" label={p.salary} error={result && !result.ok ? result.fieldErrors?.salary?.[0] : undefined}><MoneyInput id="salary" value={editing.salary} onChange={(e) => setEditing({ ...editing, salary: e.target.value })} /></Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t.common.cancel}</Button>
                <Button type="submit" disabled={pending}>{pending ? t.common.saving : t.common.save}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
