"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { saveDocumentSettingsAction } from "@/features/settings/actions";
import { documentSettingsSchema, type DocumentSettingsValues } from "@/features/settings/schema";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { ActionError } from "@/components/forms/action-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

/** Letterhead and closing text of the PDFs. */
export function DocumentSettings({ defaults }: { defaults: DocumentSettingsValues }) {
  const { t } = useI18n();
  const s = t.docs.settings;
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const form = useForm<DocumentSettingsValues>({ resolver: zodResolver(documentSettingsSchema), defaultValues: defaults });
  const { register, formState: { errors, isDirty } } = form;
  useUnsavedChanges(isDirty);

  const submit = form.handleSubmit((values) => startTransition(async () => {
    const res = await saveDocumentSettingsAction(values);
    setResult(res);
    if (!res.ok) return;
    form.reset(values);
    toast.add({ title: s.saved, type: "success" });
  }));

  return (
    <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2" noValidate>
      <div className="sm:col-span-2"><ActionError result={result} /></div>
      <Field id="company_address" label={s.address} error={errors.company_address?.message}><Input id="company_address" lang="en" dir="auto" {...register("company_address")} /></Field>
      <Field id="company_address_ur" label={s.addressUr} error={errors.company_address_ur?.message}><Input id="company_address_ur" lang="ur" dir="rtl" {...register("company_address_ur")} /></Field>
      <Field id="company_phone" label={s.phone} error={errors.company_phone?.message}><Input id="company_phone" dir="ltr" {...register("company_phone")} /></Field>
      <Field id="company_email" label={s.email} error={errors.company_email?.message}><Input id="company_email" dir="ltr" inputMode="email" {...register("company_email")} /></Field>
      <Field id="company_ntn" label={s.ntn} error={errors.company_ntn?.message}><Input id="company_ntn" dir="ltr" {...register("company_ntn")} /></Field>
      <div className="hidden sm:block" />
      <Field id="document_note" label={s.note} error={errors.document_note?.message}><Textarea id="document_note" lang="en" dir="auto" {...register("document_note")} /></Field>
      <Field id="document_note_ur" label={s.noteUr} error={errors.document_note_ur?.message}><Textarea id="document_note_ur" lang="ur" dir="rtl" {...register("document_note_ur")} /></Field>
      <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? t.common.saving : s.save}</Button></div>
    </form>
  );
}
