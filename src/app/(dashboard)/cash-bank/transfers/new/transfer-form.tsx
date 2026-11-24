"use client";

import { useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { recordTransferAction } from "@/features/cash-bank/actions";
import { BANK_METHODS, transferSchema, type TransferValues } from "@/features/cash-bank/schema";
import { useI18n } from "@/i18n/context";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/forms/money-input";
import { Input } from "@/components/ui/input";

interface Account { id: string; label: string; type: "cash" | "bank" }

export function TransferForm({ defaults, accounts }: { defaults: TransferValues; accounts: Account[] }) {
  const { t } = useI18n();
  const c = t.cashBank;
  const schema = transferSchema.superRefine((v, ctx) => { if (v.date > defaults.date) ctx.addIssue({ code: "custom", message: "futureDate", path: ["date"] }); });
  return (
    <DocumentForm<TransferValues> defaults={defaults} resolver={zodResolver(schema)} save={recordTransferAction} openPath={() => "/cash-bank/transfers"} cancelPath="/cash-bank/transfers" submitLabel={c.newTransfer} savedMessage={c.transferSaved} confirm={{ title: c.transferTitle, description: c.transferConfirm }}>
      {(form) => {
        const { errors } = form.formState;
        const options = <><option value="">{t.documents.choose}</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</>;
        return (
          <FormSection title={c.newTransfer} description={c.transferHint} className="lg:grid-cols-3">
            <Field id="fromId" label={c.from} required error={errors.fromId?.message}><NativeSelect id="fromId" {...form.register("fromId")}>{options}</NativeSelect></Field>
            <Field id="toId" label={c.to} required error={errors.toId?.message === "sameAccount" ? c.sameAccount : errors.toId?.message}><NativeSelect id="toId" {...form.register("toId")}>{options}</NativeSelect></Field>
            <Field id="amount" label={c.amount} required error={errors.amount?.message}><MoneyInput id="amount" {...form.register("amount")} /></Field>
            <Field id="date" label={c.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" max={defaults.date} {...form.register("date")} /></Field>
            <Field id="method" label={c.method} required error={errors.method?.message}><NativeSelect id="method" {...form.register("method")}>{BANK_METHODS.map((m) => <option key={m} value={m}>{t.purchasing.methods[m]}</option>)}</NativeSelect></Field>
            <Field id="reference" label={c.reference} optional error={errors.reference?.message}><Input id="reference" dir="ltr" {...form.register("reference")} /></Field>
            <Field id="notes" label={t.documents.notes} optional className="sm:col-span-2" error={errors.notes?.message}><Input id="notes" {...form.register("notes")} /></Field>
            <Kind form={form} accounts={accounts} />
          </FormSection>
        );
      }}
    </DocumentForm>
  );
}

function Kind({ form, accounts }: { form: UseFormReturn<TransferValues>; accounts: Account[] }) {
  const { t } = useI18n();
  const [fromId, toId] = useWatch({ control: form.control, name: ["fromId", "toId"] });
  const [from, to] = [accounts.find((a) => a.id === fromId)?.type, accounts.find((a) => a.id === toId)?.type];
  if (!from || !to || fromId === toId) return null;
  const kind = from === to ? "transfer" : from === "cash" ? "deposit" : "withdrawal";
  return <p className="self-end pb-2 text-sm font-medium text-navy">{t.cashBank.transferKinds[kind]}</p>;
}
