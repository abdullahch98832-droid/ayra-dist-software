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
import { toast } from "@/components/ui/toast";
import { Textarea } from "@/components/ui/textarea";
import { ActionError } from "@/components/forms/action-error";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormActions, FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/forms/money-input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
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
  const { errors, isDirty } = form.formState;
  const [leaving, setLeaving] = useState(false);
  useUnsavedChanges(isDirty);

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await saveEmployeeAction(employeeId, salaryAccess === "manage" ? values : { ...values, salary: "" });
      setResult(res);
      if (!res.ok) return;
      form.reset(values);
      toast.add({ title: employeeId ? t.employees.updated : t.employees.created, type: "success" });
      if (!employeeId && res.data) router.push(`/employees/${res.data}`);
    })
  );

  const leave = () => (isDirty ? setLeaving(true) : router.push("/employees"));

  const text = (
    name: keyof EmployeeValues,
    label: string,
    { required, optional, ...props }: React.ComponentProps<typeof Input> & { optional?: boolean } = {}
  ) => (
    <Field id={name} label={label} required={required} optional={optional} error={errors[name]?.message}>
      <Input id={name} aria-required={required} {...props} {...form.register(name)} />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} className="grid max-w-4xl gap-6" noValidate>
      <ActionError result={result} />

      <FormSection title={t.employees.personal}>
        {text("fullName", t.employees.fullName, { required: true })}
        {text("fullNameUr", t.employees.fullNameUr, { dir: "rtl", lang: "ur", optional: true })}
        {text("fatherName", t.employees.fatherName, { optional: true })}
        {text("cnic", t.employees.cnic, { dir: "ltr", inputMode: "numeric", placeholder: "12345-1234567-1", optional: true })}
        {text("phone", t.employees.phone, { dir: "ltr", type: "tel", optional: true })}
        {text("whatsapp", t.employees.whatsapp, { dir: "ltr", type: "tel", optional: true })}
        {text("email", t.employees.email, { dir: "ltr", type: "email", optional: true })}
        {text("emergencyContact", t.employees.emergencyContact, { optional: true })}
        <Field id="address" label={t.employees.address} optional error={errors.address?.message} className="sm:col-span-2">
          <Textarea id="address" rows={2} {...form.register("address")} />
        </Field>
      </FormSection>

      <FormSection title={t.employees.employment}>
        <Field id="employeeCode" label={t.employees.code} hint={employeeId ? undefined : t.employees.codeAuto} error={errors.employeeCode?.message}>
          <Input id="employeeCode" dir="ltr" {...form.register("employeeCode")} />
        </Field>
        <Field id="status" label={t.employees.status} error={errors.status?.message}>
          <NativeSelect id="status" {...form.register("status")}>
            {EMPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{t.employees.statusLabels[s]}</option>)}
          </NativeSelect>
        </Field>
        {text("jobTitle", t.employees.jobTitle, { optional: true })}
        {text("department", t.employees.department, { optional: true })}
        {text("hireDate", t.employees.joiningDate, { type: "date", dir: "ltr", optional: true })}
        {salaryAccess !== "none" && (
          <Field id="salary" label={t.employees.salary} hint={t.employees.salaryConfidential} error={errors.salary?.message}>
            <MoneyInput
              id="salary"
              readOnly={salaryAccess !== "manage"}
              suffix={<Lock className="size-4 text-warning" aria-hidden />}
              {...form.register("salary")}
            />
          </Field>
        )}
        <Field id="notes" label={t.employees.notes} optional error={errors.notes?.message} className="sm:col-span-2">
          <Textarea id="notes" rows={3} {...form.register("notes")} />
        </Field>
      </FormSection>

      <FormActions>
        <Button type="submit" size="lg" disabled={pending}>{pending ? t.common.saving : t.common.save}</Button>
        <Button type="button" size="lg" variant="outline" disabled={pending} onClick={leave}>{t.common.cancel}</Button>
      </FormActions>

      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title={t.states.unsavedTitle}
        description={t.states.unsavedHint}
        confirmLabel={t.common.discard}
        cancelLabel={t.common.keepEditing}
        onConfirm={() => { form.reset(defaults); setLeaving(false); router.push("/employees"); }}
      />
    </form>
  );
}
