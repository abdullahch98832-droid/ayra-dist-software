"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { saveTakerAction } from "@/features/takers/actions";
import { EMPLOYMENT_STATUSES, takerSchema, type TakerValues } from "@/features/takers/schema";
import { useI18n } from "@/i18n/context";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import type { ActionResult } from "@/lib/action-result";
import { ActionError } from "@/components/forms/action-error";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormActions, FormSection } from "@/components/forms/form-section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

export function TakerForm({ existing, defaults, employees, canEditEmployee }: {
  /** Editing: the employee cannot be exchanged. */
  existing: boolean;
  defaults: TakerValues;
  employees: { id: string; nameEn: string; nameUr: string | null; code: string }[];
  canEditEmployee: boolean;
}) {
  const { t, locale } = useI18n();
  const k = t.takers;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<string> | null>(null);
  const form = useForm<TakerValues>({ resolver: zodResolver(takerSchema), defaultValues: defaults });
  const { errors, isDirty } = form.formState;
  const [employeeId, isActive] = useWatch({ control: form.control, name: ["employeeId", "isActive"] });
  useUnsavedChanges(isDirty && !result?.ok);
  // Name and phone are shown for a new employee, or when editing with permission.
  const personal = canEditEmployee && (existing || employeeId === "");

  const submit = form.handleSubmit((values) => startTransition(async () => {
    const res = await saveTakerAction(values);
    setResult(res);
    if (!res.ok || !res.data) return;
    toast.add({ title: k.saved, type: "success" });
    router.push(`/order-takers/${res.data}`);
  }));

  return (
    <form onSubmit={submit} className="grid max-w-4xl gap-6" noValidate>
      <ActionError result={result} />
      <FormSection title={k.details} description={existing ? undefined : k.pictureHint}>
        {!existing && (
          <Field id="employeeId" label={k.employee} required className="sm:col-span-2" error={errors.employeeId?.message}>
            <NativeSelect id="employeeId" {...form.register("employeeId")}>
              {canEditEmployee && <option value="">{k.newEmployee}</option>}
              {employees.map((e) => <option key={e.id} value={e.id}>{locale === "ur" && e.nameUr ? e.nameUr : e.nameEn} ({e.code})</option>)}
            </NativeSelect>
          </Field>
        )}
        {personal && (
          <>
            <Field id="name" label={k.name} required error={errors.name?.message}><Input id="name" {...form.register("name")} /></Field>
            <Field id="nameUr" label={k.nameUr} optional error={errors.nameUr?.message}><Input id="nameUr" dir="rtl" lang="ur" {...form.register("nameUr")} /></Field>
            <Field id="phone" label={k.phone} optional error={errors.phone?.message}><Input id="phone" dir="ltr" type="tel" {...form.register("phone")} /></Field>
            <Field id="whatsapp" label={k.whatsapp} optional error={errors.whatsapp?.message}><Input id="whatsapp" dir="ltr" type="tel" {...form.register("whatsapp")} /></Field>
            <Field id="status" label={k.status} required error={errors.status?.message}>
              <NativeSelect id="status" {...form.register("status")}>{EMPLOYMENT_STATUSES.map((x) => <option key={x} value={x}>{t.employees.statusLabels[x]}</option>)}</NativeSelect>
            </Field>
          </>
        )}
        <Field id="territory" label={k.territory} optional error={errors.territory?.message}><Input id="territory" {...form.register("territory")} /></Field>
        <label className="flex items-center gap-2.5 self-end py-2 text-sm"><Checkbox checked={isActive} onCheckedChange={(v) => form.setValue("isActive", v === true, { shouldDirty: true })} />{k.active}</label>
        <Field id="notes" label={t.documents.notes} optional className="sm:col-span-2" error={errors.notes?.message}><Textarea id="notes" rows={2} {...form.register("notes")} /></Field>
        {!canEditEmployee && <p className="text-sm text-muted-foreground sm:col-span-2">{k.employeeNote}</p>}
      </FormSection>
      <FormActions>
        <Button type="submit" size="lg" disabled={pending}>{pending ? t.common.saving : t.common.save}</Button>
        <Button type="button" size="lg" variant="outline" disabled={pending} onClick={() => router.push(existing ? `/order-takers/${defaults.employeeId}` : "/order-takers")}>{t.common.cancel}</Button>
      </FormActions>
    </form>
  );
}
