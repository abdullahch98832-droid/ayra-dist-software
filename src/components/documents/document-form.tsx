"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm, type DefaultValues, type FieldValues, type Resolver, type UseFormReturn } from "react-hook-form";
import { useI18n } from "@/i18n/context";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import type { ActionResult } from "@/lib/action-result";
import { ActionError } from "@/components/forms/action-error";
import { FormActions } from "@/components/forms/form-section";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** Draft form shared by every document: validation, save, unsaved-changes guard, navigation. */
export function DocumentForm<T extends FieldValues>({
  defaults, resolver, save, openPath, cancelPath, submitLabel, savedMessage, confirm, children,
}: {
  defaults: DefaultValues<T>;
  resolver: Resolver<T>;
  save: (values: T) => Promise<ActionResult<string>>;
  /** Where to go with the saved document's id. */
  openPath: (id: string) => string;
  cancelPath: string;
  submitLabel?: string;
  savedMessage?: string;
  /** Asks before saving, for documents that post at once. */
  confirm?: { title: string; description: string };
  children: (form: UseFormReturn<T>) => React.ReactNode;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<string> | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<T>({ resolver, defaultValues: defaults });
  useUnsavedChanges(form.formState.isDirty && !saved);

  const [toConfirm, setToConfirm] = useState<T | null>(null);

  const store = (values: T) => startTransition(async () => {
    const res = await save(values);
    setResult(res);
    if (!res.ok || !res.data) return;
    setToConfirm(null);
    setSaved(true);
    toast.add({ title: savedMessage ?? t.documents.draftSaved, type: "success" });
    router.push(openPath(res.data));
  });
  const submit = form.handleSubmit((values) => {
    setResult(null);
    if (confirm) setToConfirm(values);
    else store(values);
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={submit} className="grid gap-6" noValidate>
        {!toConfirm && <ActionError result={result} />}
        {result && !result.ok && result.code === "validation" && <p role="alert" className="text-sm text-destructive">{t.errors.validation}</p>}
        {children(form)}
        <FormActions>
          <Button type="submit" size="lg" disabled={pending}>{pending ? t.common.saving : submitLabel ?? t.documents.saveDraft}</Button>
          <Button type="button" size="lg" variant="outline" disabled={pending} onClick={() => router.push(cancelPath)}>{t.common.cancel}</Button>
        </FormActions>
      </form>
      {confirm && (
        <ConfirmDialog
          open={toConfirm !== null} onOpenChange={(open) => { if (!open) setToConfirm(null); }} title={confirm.title} description={confirm.description} tone="default"
          confirmLabel={submitLabel ?? t.documents.saveDraft} pending={pending} error={result} onConfirm={() => { if (toConfirm) store(toConfirm); }}
        />
      )}
    </FormProvider>
  );
}

/** A fresh idempotency key per opened form. */
export function newRequestId(): string {
  return crypto.randomUUID();
}
