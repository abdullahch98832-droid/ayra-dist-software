"use client";

import { useState, useTransition } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Paperclip } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { uploadReceiptAction } from "@/features/expenses/actions";
import type { ExpenseCategory } from "@/features/expenses/queries";
import { EXPENSE_METHODS, expenseSchema, type ExpenseValues } from "@/features/expenses/schema";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect, useMessage } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/forms/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Choice { id: string; label: string }

export function ExpenseForm({ save, openAfter, maxDate, defaults, accounts, categories, vehicles, jobs, poster, confirm = true, cancelPath }: {
  save: (values: ExpenseValues) => Promise<ActionResult<string>>;
  /** Where to go after saving; by default the voucher, or the page the form was opened from. */
  openAfter?: string;
  maxDate?: string;
  defaults: ExpenseValues;
  accounts: Choice[];
  categories: ExpenseCategory[];
  vehicles: Choice[];
  jobs: Choice[];
  poster: boolean;
  /** Asks before saving: a new voucher may be approved at once. */
  confirm?: boolean;
  cancelPath: string;
}) {
  const { t, locale } = useI18n();
  const x = t.expenses;
  const latest = maxDate ?? defaults.date;
  const schema = expenseSchema.superRefine((v, ctx) => {
    if (v.date > latest) ctx.addIssue({ code: "custom", message: "futureDate", path: ["date"] });
  });
  // Someone who may not see posted expenses has no page to open afterwards.
  const openPath = (id: string) => openAfter ?? (cancelPath === "/expenses" ? `/expenses/${id}` : cancelPath);
  return (
    <DocumentForm<ExpenseValues> defaults={defaults} resolver={zodResolver(schema)} save={save} openPath={openPath} cancelPath={cancelPath} submitLabel={t.common.save} savedMessage={x.saved} confirm={confirm ? { title: x.recordTitle, description: poster ? x.willPost : x.willWait } : undefined}>
      {(form) => {
        const { errors } = form.formState;
        return (
          <FormSection title={x.expense} description={confirm ? (poster ? x.willPost : x.willWait) : undefined} className="lg:grid-cols-3">
            <Field id="categoryId" label={x.category} required error={errors.categoryId?.message}>
              <NativeSelect id="categoryId" {...form.register("categoryId")}><option value="">{t.documents.choose}</option>{categories.map((c) => <option key={c.id} value={c.id}>{locale === "ur" && c.nameUr ? c.nameUr : c.nameEn}</option>)}</NativeSelect>
            </Field>
            <Field id="amount" label={x.amount} required error={errors.amount?.message}><MoneyInput id="amount" {...form.register("amount")} /></Field>
            <Field id="date" label={x.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" max={latest} {...form.register("date")} /></Field>
            <Field id="accountId" label={x.paidFrom} required error={errors.accountId?.message}>
              <NativeSelect id="accountId" {...form.register("accountId")}><option value="">{t.documents.choose}</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</NativeSelect>
            </Field>
            <Field id="method" label={x.method} required error={errors.method?.message}>
              <NativeSelect id="method" {...form.register("method")}>{EXPENSE_METHODS.map((m) => <option key={m} value={m}>{t.purchasing.methods[m]}</option>)}</NativeSelect>
            </Field>
            <Field id="reference" label={x.reference} optional error={errors.reference?.message}><Input id="reference" dir="ltr" {...form.register("reference")} /></Field>
            <Field id="payee" label={x.payee} required error={errors.payee?.message}><Input id="payee" {...form.register("payee")} /></Field>
            {vehicles.length > 0 && (
              <Field id="vehicleId" label={x.vehicle} optional error={errors.vehicleId?.message}>
                <NativeSelect id="vehicleId" {...form.register("vehicleId")}><option value="">{x.noVehicle}</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</NativeSelect>
              </Field>
            )}
            {jobs.length > 0 && (
              <Field id="jobId" label={x.job} optional error={errors.jobId?.message}>
                <NativeSelect id="jobId" {...form.register("jobId")}><option value="">{x.noJob}</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}</NativeSelect>
              </Field>
            )}
            <VehicleReading categories={categories} />
            <Receipt />
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">{x.salariesNote}</p>
            <Field id="description" label={x.description} required className="sm:col-span-2 lg:col-span-3" error={errors.description?.message}><Textarea id="description" rows={2} {...form.register("description")} /></Field>
          </FormSection>
        );
      }}
    </DocumentForm>
  );
}

/** Odometer of the vehicle, and litres when it is fuel. */
function VehicleReading({ categories }: { categories: ExpenseCategory[] }) {
  const { t } = useI18n();
  const { control, register, formState: { errors } } = useFormContext<ExpenseValues>();
  const [vehicleId, categoryId] = useWatch({ control, name: ["vehicleId", "categoryId"] });
  if (!vehicleId) return null;
  const fuel = categories.find((c) => c.id === categoryId)?.vehicleKind === "fuel";
  return (
    <>
      {fuel && <Field id="litres" label={t.expenses.litres} optional error={errors.litres?.message}><Input id="litres" dir="ltr" inputMode="decimal" {...register("litres")} /></Field>}
      <Field id="odometer" label={t.expenses.odometer} optional error={errors.odometer?.message}><Input id="odometer" dir="ltr" inputMode="numeric" {...register("odometer")} /></Field>
    </>
  );
}

/** The receipt is stored as soon as it is chosen; without one a reason is needed. */
function Receipt() {
  const { t } = useI18n();
  const x = t.expenses;
  const message = useMessage();
  const { control, register, setValue, formState: { errors } } = useFormContext<ExpenseValues>();
  const path = useWatch({ control, name: "receiptPath" });
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const choose = (file: File | undefined) => {
    if (!file) return;
    startTransition(async () => {
      const body = new FormData();
      body.set("file", file);
      const result = await uploadReceiptAction(body);
      if (!result.ok || !result.data) return setError(result.ok ? "unexpected" : result.fieldErrors?.file?.[0] ?? result.code);
      setError(undefined);
      setName(file.name);
      setValue("receiptPath", result.data, { shouldDirty: true, shouldValidate: true });
    });
  };
  return (
    <>
      <div className="grid content-start gap-2">
        <span className="text-sm font-medium">{x.receipt}</span>
        {path ? (
          <p className="flex min-h-10 flex-wrap items-center gap-2 text-sm"><Paperclip className="size-4 text-muted-foreground" aria-hidden /><bdi className="min-w-0 break-all">{name || x.receipt}</bdi>
            <Button type="button" variant="ghost" size="sm" onClick={() => setValue("receiptPath", "", { shouldDirty: true })}>{t.common.delete}</Button>
          </p>
        ) : (
          <input
            type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label={x.receipt} disabled={pending} onChange={(e) => choose(e.target.files?.[0])}
            className="w-full min-w-0 rounded-lg border border-input bg-card text-sm shadow-xs file:me-3 file:h-10 file:border-0 file:bg-accent file:px-3 file:text-accent-foreground"
          />
        )}
        {error ? <p role="alert" className="text-sm text-destructive">{message(error)}</p> : <p className="text-xs text-muted-foreground">{pending ? x.uploading : x.receiptHint}</p>}
      </div>
      {!path && <Field id="noReceiptReason" label={x.noReceiptReason} hint={x.noReceiptHint} error={errors.noReceiptReason?.message}><Input id="noReceiptReason" {...register("noReceiptReason")} /></Field>}
    </>
  );
}
