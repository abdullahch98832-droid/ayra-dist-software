"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { saveSupplierAction } from "@/features/parties/supplier-actions";
import { supplierSchema, type SupplierValues } from "@/features/parties/supplier-schema";
import { useI18n } from "@/i18n/context";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import type { ActionResult } from "@/lib/action-result";
import { ActionError } from "@/components/forms/action-error";
import { Field } from "@/components/forms/field";
import { FormActions, FormSection } from "@/components/forms/form-section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

export function SupplierForm({ supplierId, defaults }: { supplierId: string | null; defaults: SupplierValues }) {
  const { t } = useI18n();
  const s = t.suppliers;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<string> | null>(null);
  const form = useForm<SupplierValues>({ resolver: zodResolver(supplierSchema), defaultValues: defaults });
  const { errors, isDirty } = form.formState;
  const contacts = useFieldArray({ control: form.control, name: "contacts" });
  const watched = useWatch({ control: form.control });
  useUnsavedChanges(isDirty);

  const submit = form.handleSubmit((values) => startTransition(async () => {
    const res = await saveSupplierAction(supplierId, values);
    setResult(res);
    if (!res.ok) return;
    form.reset(values);
    toast.add({ title: s.saved, type: "success" });
    if (!supplierId && res.data) router.push(`/suppliers/${res.data}`);
  }));
  const input = (key: "code" | "name" | "nameUr" | "phone" | "email" | "ntn" | "terms", label: string, props: React.ComponentProps<typeof Input> & { optional?: boolean; hint?: string } = {}) => {
    const { optional, hint, required, ...rest } = props;
    return <Field id={key} label={label} optional={optional} required={required} hint={hint} error={errors[key]?.message}><Input id={key} {...rest} {...form.register(key)} /></Field>;
  };

  return (
    <form onSubmit={submit} className="grid max-w-4xl gap-6" noValidate>
      <ActionError result={result} />
      <FormSection title={s.details}>
        {input("name", s.name, { required: true })}
        {input("nameUr", s.nameUr, { dir: "rtl", lang: "ur", optional: true })}
        {input("code", s.code, { dir: "ltr", hint: supplierId ? undefined : s.codeAuto })}
        {input("phone", s.phone, { dir: "ltr", type: "tel", optional: true })}
        {input("email", s.email, { dir: "ltr", type: "email", optional: true })}
        {input("ntn", s.ntn, { dir: "ltr", optional: true })}
        {input("terms", s.terms, { dir: "ltr", inputMode: "numeric", optional: true })}
        <label className="flex items-center gap-2.5 self-end py-2 text-sm"><Checkbox checked={watched.isActive ?? true} onCheckedChange={(v) => form.setValue("isActive", v === true, { shouldDirty: true })} />{t.catalog.active}</label>
        <Field id="address" label={s.address} optional className="sm:col-span-2" error={errors.address?.message}><Textarea id="address" rows={2} {...form.register("address")} /></Field>
        <Field id="notes" label={t.documents.notes} optional className="sm:col-span-2" error={errors.notes?.message}><Textarea id="notes" rows={2} {...form.register("notes")} /></Field>
      </FormSection>
      <FormSection title={s.contacts} className="sm:grid-cols-1">
        {contacts.fields.map((field, i) => (
          <fieldset key={field.id} className="grid gap-4 rounded-lg border bg-muted/40 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <Field id={`${field.id}-name`} label={s.contactName} required error={errors.contacts?.[i]?.name?.message}><Input id={`${field.id}-name`} {...form.register(`contacts.${i}.name`)} /></Field>
            <Field id={`${field.id}-designation`} label={s.designation} error={errors.contacts?.[i]?.designation?.message}><Input id={`${field.id}-designation`} {...form.register(`contacts.${i}.designation`)} /></Field>
            <Field id={`${field.id}-phone`} label={s.phone} error={errors.contacts?.[i]?.phone?.message}><Input id={`${field.id}-phone`} dir="ltr" {...form.register(`contacts.${i}.phone`)} /></Field>
            <Field id={`${field.id}-email`} label={s.email} error={errors.contacts?.[i]?.email?.message}><Input id={`${field.id}-email`} dir="ltr" {...form.register(`contacts.${i}.email`)} /></Field>
            <div className="flex items-center gap-3 lg:self-center">
              <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                <Checkbox
                  checked={watched.contacts?.[i]?.isPrimary ?? false}
                  onCheckedChange={(v) => contacts.fields.forEach((_, j) => form.setValue(`contacts.${j}.isPrimary`, v === true && j === i, { shouldDirty: true }))}
                />
                {s.primary}
              </label>
              <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label={s.removeContact} onClick={() => contacts.remove(i)}><Trash2 /></Button>
            </div>
          </fieldset>
        ))}
        <div><Button type="button" variant="outline" onClick={() => contacts.append({ name: "", designation: "", phone: "", email: "", isPrimary: contacts.fields.length === 0 })}><Plus aria-hidden />{s.addContact}</Button></div>
      </FormSection>
      <FormActions>
        <Button type="submit" size="lg" disabled={pending}>{pending ? t.common.saving : t.common.save}</Button>
        <Button type="button" size="lg" variant="outline" disabled={pending} onClick={() => router.push("/suppliers")}>{t.common.back}</Button>
      </FormActions>
    </form>
  );
}
