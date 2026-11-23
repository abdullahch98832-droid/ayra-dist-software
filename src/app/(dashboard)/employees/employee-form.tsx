"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "lucide-react";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { EMPLOYMENT_STATUSES, employeeSchema, type EmployeeValues } from "@/lib/validation/employees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ActionError } from "@/components/forms/action-error";
import { Field, FormAlert, NativeSelect } from "@/components/forms/field";
import { saveEmployeeAction } from "./actions";

export function EmployeeForm({
  employeeId, defaults, salaryAccess,
}: {
  employeeId: string | null;
  defaults: EmployeeValues;
  /** none: field hidden; view: read-only; manage: editable. */
  salaryAccess: "none" | "view" | "manage";
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<string> | null>(null);
  const form = useForm<EmployeeValues>({ resolver: zodResolver(employeeSchema), defaultValues: defaults });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await saveEmployeeAction(employeeId, salaryAccess === "manage" ? values : { ...values, salary: "" });
      setResult(res);
      if (res.ok && !employeeId && res.data) router.push(`/employees/${res.data}`);
    })
  );

  const text = (name: keyof EmployeeValues, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Field id={name} label={label} error={errors[name]?.message}>
      <Input id={name} aria-invalid={!!errors[name]} {...props} {...form.register(name)} />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-6" noValidate>
      {result?.ok && <FormAlert tone="success">{employeeId ? t.employees.updated : t.employees.created}</FormAlert>}
      <ActionError result={result} />

      <section className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
        <h2 className="text-sm font-semibold text-navy sm:col-span-2">{t.employees.personal}</h2>
        {text("fullName", t.employees.fullName)}
        {text("fullNameUr", `${t.employees.fullNameUr} (${t.common.optional})`, { dir: "rtl", lang: "ur" })}
        {text("fatherName", `${t.employees.fatherName} (${t.common.optional})`)}
        {text("cnic", `${t.employees.cnic} (${t.common.optional})`, { dir: "ltr", inputMode: "numeric", placeholder: "12345-1234567-1" })}
        {text("phone", t.employees.phone, { dir: "ltr", type: "tel" })}
        {text("whatsapp", t.employees.whatsapp, { dir: "ltr", type: "tel" })}
        {text("email", `${t.employees.email} (${t.common.optional})`, { dir: "ltr", type: "email" })}
        {text("emergencyContact", `${t.employees.emergencyContact} (${t.common.optional})`)}
        <Field id="address" label={`${t.employees.address} (${t.common.optional})`} error={errors.address?.message} className="sm:col-span-2">
          <Textarea id="address" rows={2} {...form.register("address")} />
        </Field>
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
        <h2 className="text-sm font-semibold text-navy sm:col-span-2">{t.employees.employment}</h2>
        <Field id="employeeCode" label={t.employees.code} hint={employeeId ? undefined : t.employees.codeAuto} error={errors.employeeCode?.message}>
          <Input id="employeeCode" dir="ltr" {...form.register("employeeCode")} />
        </Field>
        <Field id="status" label={t.employees.status} error={errors.status?.message}>
          <NativeSelect id="status" {...form.register("status")}>
            {EMPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{t.employees.statusLabels[s]}</option>)}
          </NativeSelect>
        </Field>
        {text("jobTitle", t.employees.jobTitle)}
        {text("department", t.employees.department)}
        {text("hireDate", t.employees.joiningDate, { type: "date", dir: "ltr" })}
        {salaryAccess !== "none" && (
          <Field id="salary" label={t.employees.salary} hint={t.employees.salaryConfidential} error={errors.salary?.message}>
            <div className="relative">
              <Input id="salary" dir="ltr" inputMode="decimal" readOnly={salaryAccess !== "manage"} className="pe-8" {...form.register("salary")} />
              <Lock className="pointer-events-none absolute end-2.5 top-2.5 h-4 w-4 text-amber-600" aria-hidden />
            </div>
          </Field>
        )}
        <Field id="notes" label={`${t.employees.notes} (${t.common.optional})`} error={errors.notes?.message} className="sm:col-span-2">
          <Textarea id="notes" rows={3} {...form.register("notes")} />
        </Field>
      </section>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? t.common.saving : t.common.save}</Button>
        <Button type="button" variant="outline" onClick={() => router.push("/employees")}>{t.common.back}</Button>
      </div>
    </form>
  );
}
