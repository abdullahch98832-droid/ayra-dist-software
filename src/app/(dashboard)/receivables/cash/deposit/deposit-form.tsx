"use client";

import { useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { recordDepositAction } from "@/features/receivables/actions";
import { depositSchema, type DepositValues } from "@/features/receivables/schema";
import { useI18n } from "@/i18n/context";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { DocumentForm } from "@/components/documents/document-form";
import { paisaOf } from "@/components/documents/invoice-allocations";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/forms/money-input";
import { ContributorsField, type ContributorsForm } from "@/components/forms/contributors-field";
import { Ltr } from "@/components/shared/bidi";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface Holder { id: string; nameEn: string; nameUr: string | null; held: string }

export function DepositForm({ defaults, holders, accounts, poster }: { defaults: DepositValues; holders: Holder[]; accounts: { id: string; name: string }[]; poster: boolean }) {
  const { t, locale } = useI18n();
  const r = t.receivables;
  const schema = depositSchema.superRefine((v, ctx) => {
    const holder = holders.find((h) => h.id === v.employeeId);
    if (holder && paisaOf(v.amount) > toPaisa(holder.held)) ctx.addIssue({ code: "custom", message: "moreThanHeld", path: ["amount"] });
  });
  return (
    <DocumentForm<DepositValues>
      defaults={defaults} resolver={zodResolver(schema)} save={recordDepositAction} openPath={() => "/receivables/cash"} cancelPath="/receivables/cash"
      submitLabel={r.newDeposit} savedMessage={r.depositDone} confirm={{ title: r.depositTitle, description: poster ? r.depositHint : r.depositWaits }}
    >
      {(form) => {
        const { errors } = form.formState;
        return (
          <FormSection title={r.deposit} className="lg:grid-cols-3">
            <Field id="employeeId" label={r.depositFrom} required error={errors.employeeId?.message}>
              <NativeSelect id="employeeId" {...form.register("employeeId")}>
                {holders.length !== 1 && <option value="">{t.documents.choose}</option>}
                {holders.map((h) => <option key={h.id} value={h.id}>{locale === "ur" && h.nameUr ? h.nameUr : h.nameEn}</option>)}
              </NativeSelect>
            </Field>
            <Field id="amount" label={r.amount} required error={errors.amount?.message}><MoneyInput id="amount" {...form.register("amount")} /></Field>
            <Field id="date" label={r.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" {...form.register("date")} /></Field>
            <Field id="accountId" label={r.depositTo} required error={errors.accountId?.message}>
              <NativeSelect id="accountId" {...form.register("accountId")}>
                <option value="">{t.documents.choose}</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </NativeSelect>
            </Field>
            <Field id="reference" label={t.documents.reference} optional error={errors.reference?.message}><Input id="reference" dir="ltr" {...form.register("reference")} /></Field>
            <Held control={form.control} holders={holders} />
            <Field id="notes" label={t.documents.notes} optional className="sm:col-span-2 lg:col-span-3" error={errors.notes?.message}><Textarea id="notes" rows={2} {...form.register("notes")} /></Field>
          <ContributorsField form={form as unknown as ContributorsForm} className="sm:col-span-2 lg:col-span-3" />
          </FormSection>
        );
      }}
    </DocumentForm>
  );
}

function Held({ control, holders }: { control: Control<DepositValues>; holders: Holder[] }) {
  const { t, locale } = useI18n();
  const id = useWatch({ control, name: "employeeId" });
  const holder = holders.find((h) => h.id === id);
  if (!holder) return null;
  return <p className="self-center text-sm text-muted-foreground">{t.receivables.held}: <Ltr className="font-semibold text-foreground tabular-nums">{formatPaisa(toPaisa(holder.held), locale)}</Ltr></p>;
}
