"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { paySalariesAction } from "@/features/payroll/actions";
import { PAY_METHODS, paySchema, type PayValues } from "@/features/payroll/schema";
import { useI18n } from "@/i18n/context";
import { formatPaisa, parseRupees, toPaisa } from "@/lib/utils/money";
import { decimalAbove } from "@/lib/utils/quantity";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, FormAlert, NativeSelect, useMessage } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { Ltr } from "@/components/shared/bidi";
import { Input } from "@/components/ui/input";

export function PayForm({ runId, today, lines, accounts }: { runId: string; today: string; lines: { itemId: string; name: string; pending: string }[]; accounts: { id: string; label: string }[] }) {
  const { t, locale } = useI18n();
  const p = t.payroll;
  const message = useMessage();
  const schema = paySchema.superRefine((v, ctx) => {
    if (v.date > today) ctx.addIssue({ code: "custom", message: "futureDate", path: ["date"] });
    v.lines.forEach((l, i) => { if (decimalAbove(l.amount, lines[i]?.pending ?? "0")) ctx.addIssue({ code: "custom", message: "moreThanBalance", path: ["lines", i, "amount"] }); });
  });
  if (accounts.length === 0) return <FormAlert tone="info">{t.cashBank.noAccounts}</FormAlert>;
  return (
    <DocumentForm<PayValues>
      defaults={{ date: today, accountId: accounts.length === 1 ? accounts[0]?.id ?? "" : "", method: "cash", reference: "", requestId: crypto.randomUUID(), lines: lines.map((l) => ({ itemId: l.itemId, amount: l.pending })) }}
      resolver={zodResolver(schema)} save={paySalariesAction.bind(null, runId)} openPath={(id) => `/payroll/${id}`} cancelPath="/payroll" submitLabel={p.pay} savedMessage={p.paidDone} confirm={{ title: p.payTitle, description: p.payConfirm }}
    >
      {(form) => {
        const { errors } = form.formState;
        return (
          <FormSection title={p.pay} description={p.payHint} className="lg:grid-cols-4">
            <Field id="accountId" label={t.expenses.paidFrom} required error={errors.accountId?.message}><NativeSelect id="accountId" {...form.register("accountId")}><option value="">{t.documents.choose}</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</NativeSelect></Field>
            <Field id="method" label={t.sol.method} required error={errors.method?.message}><NativeSelect id="method" {...form.register("method")}>{PAY_METHODS.map((m) => <option key={m} value={m}>{t.purchasing.methods[m]}</option>)}</NativeSelect></Field>
            <Field id="date" label={t.documents.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" max={today} {...form.register("date")} /></Field>
            <Field id="reference" label={t.documents.reference} error={errors.reference?.message}><Input id="reference" dir="ltr" {...form.register("reference")} /></Field>
            <ul className="divide-y sm:col-span-2 lg:col-span-4">
              {lines.map((l, i) => {
                const error = errors.lines?.[i]?.amount?.message;
                return (
                  <li key={l.itemId} className="grid grid-cols-2 gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_11rem] sm:items-center">
                    <p className="col-span-2 min-w-0 text-sm font-medium break-words sm:col-span-1">{l.name}</p>
                    <p className="text-sm"><span className="block text-xs text-muted-foreground">{p.pending}</span><Ltr className="tabular-nums">{formatPaisa(toPaisa(l.pending), locale)}</Ltr></p>
                    <div>
                      <label htmlFor={`pay-${l.itemId}`} className="block text-xs text-muted-foreground">{p.paid}</label>
                      <Input id={`pay-${l.itemId}`} dir="ltr" inputMode="decimal" autoComplete="off" className="tabular-nums" aria-invalid={error ? true : undefined} {...form.register(`lines.${i}.amount`)} />
                      {error && <p role="alert" className="text-xs text-destructive">{message(error)}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <PayTotal form={form} />
          </FormSection>
        );
      }}
    </DocumentForm>
  );
}

function PayTotal({ form }: { form: UseFormReturn<PayValues> }) {
  const { t, locale } = useI18n();
  const lines = useWatch({ control: form.control, name: "lines" }) ?? [];
  const total = lines.reduce((sum, l) => {
    try { return l.amount.trim() === "" ? sum : sum + parseRupees(l.amount); } catch { return sum; }
  }, BigInt(0));
  return <p className="flex items-center justify-between gap-4 border-t pt-4 sm:col-span-2 lg:col-span-4"><span className="text-sm text-muted-foreground">{t.documents.total}</span><Ltr className="text-lg font-semibold text-navy tabular-nums">{formatPaisa(total, locale)}</Ltr></p>;
}
