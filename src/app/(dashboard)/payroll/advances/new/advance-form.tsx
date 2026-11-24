"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { recordAdvanceAction } from "@/features/payroll/actions";
import { advanceSchema, PAY_METHODS, type AdvanceValues } from "@/features/payroll/schema";
import { useI18n } from "@/i18n/context";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/forms/money-input";
import { Input } from "@/components/ui/input";

export function AdvanceForm({ defaults, employees, accounts, payer }: { defaults: AdvanceValues; employees: { id: string; code: string; nameEn: string; nameUr: string | null }[]; accounts: { id: string; label: string }[]; payer: boolean }) {
  const { t, locale } = useI18n();
  const p = t.payroll;
  const schema = advanceSchema.superRefine((v, ctx) => { if (v.date > defaults.date) ctx.addIssue({ code: "custom", message: "futureDate", path: ["date"] }); });
  return (
    <DocumentForm<AdvanceValues> defaults={defaults} resolver={zodResolver(schema)} save={recordAdvanceAction} openPath={() => "/payroll/advances"} cancelPath="/payroll/advances" submitLabel={t.common.save} savedMessage={p.advanceSaved} confirm={{ title: p.advanceTitle, description: payer ? p.advancePosts : p.advanceWaits }}>
      {(form) => {
        const { errors } = form.formState;
        return (
          <FormSection title={p.advance} description={payer ? p.advancePosts : p.advanceWaits} className="lg:grid-cols-3">
            <Field id="employeeId" label={p.employee} required error={errors.employeeId?.message}><NativeSelect id="employeeId" {...form.register("employeeId")}><option value="">{t.documents.choose}</option>{employees.map((e) => <option key={e.id} value={e.id}>{locale === "ur" && e.nameUr ? e.nameUr : e.nameEn} ({e.code})</option>)}</NativeSelect></Field>
            <Field id="amount" label={t.expenses.amount} required error={errors.amount?.message}><MoneyInput id="amount" {...form.register("amount")} /></Field>
            <Field id="date" label={t.documents.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" max={defaults.date} {...form.register("date")} /></Field>
            <Field id="accountId" label={t.expenses.paidFrom} required error={errors.accountId?.message}><NativeSelect id="accountId" {...form.register("accountId")}><option value="">{t.documents.choose}</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</NativeSelect></Field>
            <Field id="method" label={t.sol.method} required error={errors.method?.message}><NativeSelect id="method" {...form.register("method")}>{PAY_METHODS.map((m) => <option key={m} value={m}>{t.purchasing.methods[m]}</option>)}</NativeSelect></Field>
            <Field id="reference" label={t.documents.reference} optional error={errors.reference?.message}><Input id="reference" dir="ltr" {...form.register("reference")} /></Field>
            <Field id="reason" label={p.reason} optional className="sm:col-span-2 lg:col-span-3" error={errors.reason?.message}><Input id="reason" {...form.register("reason")} /></Field>
          </FormSection>
        );
      }}
    </DocumentForm>
  );
}
