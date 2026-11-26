"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { recordVoucherAction } from "@/features/cash-bank/actions";
import { BANK_METHODS, voucherSchema, type VoucherValues } from "@/features/cash-bank/schema";
import { useI18n } from "@/i18n/context";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/forms/money-input";
import { ContributorsField, type ContributorsForm } from "@/components/forms/contributors-field";
import { Input } from "@/components/ui/input";

export function VoucherForm({ defaults, accounts, counters }: { defaults: VoucherValues; accounts: { id: string; label: string }[]; counters: { id: string; code: string; nameEn: string; nameUr: string | null }[] }) {
  const { t, locale } = useI18n();
  const c = t.cashBank;
  const schema = voucherSchema.superRefine((v, ctx) => { if (v.date > defaults.date) ctx.addIssue({ code: "custom", message: "futureDate", path: ["date"] }); });
  return (
    <DocumentForm<VoucherValues> defaults={defaults} resolver={zodResolver(schema)} save={recordVoucherAction} openPath={() => "/cash-bank/vouchers"} cancelPath="/cash-bank/vouchers" submitLabel={t.common.save} savedMessage={c.voucherSaved} confirm={{ title: c.voucherTitle, description: c.voucherConfirm }}>
      {(form) => {
        const { errors } = form.formState;
        return (
          <FormSection title={c.voucherKinds[defaults.kind]} description={c.voucherHint} className="lg:grid-cols-3">
            <Field id="accountId" label={c.name} required error={errors.accountId?.message}><NativeSelect id="accountId" {...form.register("accountId")}><option value="">{t.documents.choose}</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</NativeSelect></Field>
            <Field id="counterId" label={c.counter} required error={errors.counterId?.message}><NativeSelect id="counterId" {...form.register("counterId")}><option value="">{t.documents.choose}</option>{counters.map((a) => <option key={a.id} value={a.id}>{a.code} · {locale === "ur" && a.nameUr ? a.nameUr : a.nameEn}</option>)}</NativeSelect></Field>
            <Field id="amount" label={c.amount} required error={errors.amount?.message}><MoneyInput id="amount" {...form.register("amount")} /></Field>
            <Field id="party" label={c.partyName} optional error={errors.party?.message}><Input id="party" {...form.register("party")} /></Field>
            <Field id="method" label={c.method} required error={errors.method?.message}><NativeSelect id="method" {...form.register("method")}>{BANK_METHODS.map((m) => <option key={m} value={m}>{t.purchasing.methods[m]}</option>)}</NativeSelect></Field>
            <Field id="date" label={c.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" max={defaults.date} {...form.register("date")} /></Field>
            <Field id="reference" label={c.reference} optional error={errors.reference?.message}><Input id="reference" dir="ltr" {...form.register("reference")} /></Field>
            <Field id="description" label={c.description} required className="sm:col-span-2" error={errors.description?.message}><Input id="description" {...form.register("description")} /></Field>
          <ContributorsField form={form as unknown as ContributorsForm} className="sm:col-span-2 lg:col-span-3" />
          </FormSection>
        );
      }}
    </DocumentForm>
  );
}
