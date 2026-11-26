"use client";

import { useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { recordSolPaymentAction } from "@/features/sol/actions";
import { SOL_METHODS, solPaymentSchema, type SolPaymentValues } from "@/features/sol/schema";
import { useI18n } from "@/i18n/context";
import { formatPaisa, parseRupees, toPaisa } from "@/lib/utils/money";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/forms/money-input";
import { ContributorsField, SingleAccount, SplitOption, type ContributorsForm } from "@/components/forms/contributors-field";
import { Ltr } from "@/components/shared/bidi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface PayableJob { id: string; number: string; client: string; balance: string }

export function SolPaymentForm({ defaults, jobs, accounts, poster }: { defaults: SolPaymentValues; jobs: PayableJob[]; accounts: { id: string; label: string }[]; poster: boolean }) {
  const { t } = useI18n();
  const s = t.sol;
  const schema = solPaymentSchema.superRefine((v, ctx) => {
    const balance = jobs.find((j) => j.id === v.jobId)?.balance;
    if (balance !== undefined && /^\d{1,13}(\.\d{1,2})?$/.test(v.amount) && parseRupees(v.amount) > toPaisa(balance)) ctx.addIssue({ code: "custom", message: "moreThanBalance", path: ["amount"] });
    if (v.date > defaults.date) ctx.addIssue({ code: "custom", message: "futureDate", path: ["date"] });
  });
  return (
    <DocumentForm<SolPaymentValues>
      defaults={defaults} resolver={zodResolver(schema)} save={recordSolPaymentAction} openPath={(id) => `/sol/jobs/${id}`} cancelPath={defaults.jobId ? `/sol/jobs/${defaults.jobId}` : "/sol/payments"}
      submitLabel={s.newPayment} savedMessage={s.paymentDone} confirm={{ title: s.paymentTitle, description: poster ? s.paymentHint : s.paymentWaits }}
    >
      {(form) => {
        const { errors } = form.formState;
        return (
          <FormSection title={s.payment} description={poster ? undefined : s.paymentWaits} className="lg:grid-cols-3">
            <Field id="jobId" label={s.job} required error={errors.jobId?.message} className="sm:col-span-2 lg:col-span-1">
              <NativeSelect id="jobId" {...form.register("jobId")}>
                <option value="">{t.documents.choose}</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.number} · {j.client}</option>)}
              </NativeSelect>
            </Field>
            <div className="grid content-start gap-2">
              <Field id="amount" label={s.amount} required error={errors.amount?.message}><MoneyInput id="amount" {...form.register("amount")} /></Field>
              <Balance form={form} jobs={jobs} />
            </div>
            <Field id="date" label={t.documents.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" max={defaults.date} {...form.register("date")} /></Field>
            <Field id="method" label={s.method} required error={errors.method?.message}>
              <NativeSelect id="method" {...form.register("method")}>{SOL_METHODS.map((m) => <option key={m} value={m}>{t.purchasing.methods[m]}</option>)}</NativeSelect>
            </Field>
            <SingleAccount form={form as unknown as ContributorsForm}>
              <Field id="accountId" label={s.account} required error={errors.accountId?.message}>
                <NativeSelect id="accountId" {...form.register("accountId")}>
                  <option value="">{t.documents.choose}</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                <SplitOption accounts={accounts} /></NativeSelect>
              </Field>
            </SingleAccount>
            <Field id="reference" label={s.reference} error={errors.reference?.message}><Input id="reference" dir="ltr" {...form.register("reference")} /></Field>
            <Field id="payerAccount" label={s.payerAccount} optional hint={s.payerAccountHint} error={errors.payerAccount?.message}><Input id="payerAccount" dir="ltr" autoComplete="off" {...form.register("payerAccount")} /></Field>
            <Field id="notes" label={t.documents.notes} optional className="sm:col-span-2" error={errors.notes?.message}><Textarea id="notes" rows={2} {...form.register("notes")} /></Field>
          <ContributorsField form={form as unknown as ContributorsForm} accounts={accounts} className="sm:col-span-2 lg:col-span-3" />
          </FormSection>
        );
      }}
    </DocumentForm>
  );
}

function Balance({ form, jobs }: { form: UseFormReturn<SolPaymentValues>; jobs: PayableJob[] }) {
  const { t, locale } = useI18n();
  const jobId = useWatch({ control: form.control, name: "jobId" });
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return null;
  return (
    <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{t.sol.outstanding}: <Ltr className="font-medium text-foreground">{formatPaisa(toPaisa(job.balance), locale)}</Ltr></span>
      <Button type="button" variant="ghost" size="sm" onClick={() => form.setValue("amount", job.balance, { shouldDirty: true, shouldValidate: true })}>{t.sol.payBalance}</Button>
    </p>
  );
}
