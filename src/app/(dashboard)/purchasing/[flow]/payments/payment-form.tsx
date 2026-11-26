"use client";

import { useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { recordPaymentAction } from "@/features/purchasing/actions";
import { flowPath, type Flow } from "@/features/purchasing/flow";
import type { FlowSupplier } from "@/features/purchasing/queries";
import { checkContributorsSum } from "@/features/payments/contributors";
import { PAYMENT_METHODS, paymentSchema, type PaymentValues } from "@/features/purchasing/schema";
import { ContributorsField, type ContributorsForm } from "@/components/forms/contributors-field";
import { useI18n } from "@/i18n/context";
import { formatPaisa, parseRupees, sumPaisa, toDbAmount, toPaisa, type Paisa } from "@/lib/utils/money";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect, useMessage } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/forms/money-input";
import { Ltr } from "@/components/shared/bidi";
import { formatDate } from "@/components/shared/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface OpenBill {
  id: string;
  supplierId: string;
  number: string;
  date: string;
  dueDate: string | null;
  outstanding: string;
}

const ZERO = BigInt(0);
const paisa = (text: string | undefined): Paisa => {
  try {
    return parseRupees(text ?? "");
  } catch {
    return ZERO;
  }
};
const lesser = (a: Paisa, b: Paisa) => (a < b ? a : b);

/** Adds the rules that need the bills on screen; the database enforces them again. */
const withBills = (bills: OpenBill[]) => paymentSchema.superRefine((v, ctx) => {
  v.allocations.forEach((a, i) => {
    const bill = bills.find((b) => b.id === a.billId);
    if (bill && paisa(a.amount) > toPaisa(bill.outstanding)) ctx.addIssue({ code: "custom", message: "allocationTooHigh", path: ["allocations", i, "amount"] });
  });
  if (sumPaisa(v.allocations.map((a) => paisa(a.amount))) > paisa(v.amount)) ctx.addIssue({ code: "custom", message: "allocationsExceed", path: ["amount"] });
  checkContributorsSum(v.contributors, v.amount, ctx);
});

export function PaymentForm({ flow, defaults, suppliers, accounts, bills, balances }: {
  flow: Flow;
  defaults: PaymentValues;
  suppliers: FlowSupplier[];
  accounts: { id: string; name: string }[];
  bills: OpenBill[];
  /** Ledger balance owed per supplier. */
  balances: Record<string, string>;
}) {
  const { t, locale } = useI18n();
  const d = t.documents;
  const p = t.purchasing;
  const name = (s: FlowSupplier) => (locale === "ur" && s.nameUr ? s.nameUr : s.nameEn);
  return (
    <DocumentForm<PaymentValues>
      defaults={defaults}
      resolver={zodResolver(withBills(bills))}
      save={recordPaymentAction}
      openPath={(id) => flowPath(flow, "payments", id)}
      cancelPath={flowPath(flow, "payments")}
      submitLabel={p.newPayment}
      savedMessage={p.paymentDone}
      confirm={{ title: p.paymentTitle, description: p.paymentConfirm }}
    >
      {(form) => {
        const { errors } = form.formState;
        return (
          <>
            <FormSection title={p.payment} className="lg:grid-cols-3">
              <Field id="supplierId" label={d.supplier} required error={errors.supplierId?.message}>
                <NativeSelect
                  id="supplierId"
                  {...form.register("supplierId", { onChange: (e: { target: { value: string } }) => form.setValue("allocations", bills.filter((b) => b.supplierId === e.target.value).map((b) => ({ billId: b.id, amount: "" }))) })}
                >
                  {suppliers.length !== 1 && <option value="">{d.choose}</option>}
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
                </NativeSelect>
              </Field>
              <Field id="amount" label={p.paymentAmount} required error={errors.amount?.message}><MoneyInput id="amount" {...form.register("amount")} /></Field>
              <Field id="date" label={d.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" {...form.register("date")} /></Field>
              <Field id="accountId" label={p.paidFrom} required error={errors.accountId?.message} hint={accounts.length === 0 ? p.noAccounts : undefined}>
                <NativeSelect id="accountId" {...form.register("accountId")}>
                  <option value="">{d.choose}</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </NativeSelect>
              </Field>
              <Field id="method" label={p.method} required error={errors.method?.message}>
                <NativeSelect id="method" {...form.register("method")}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{p.methods[m]}</option>)}</NativeSelect>
              </Field>
              <Field id="reference" label={d.reference} optional error={errors.reference?.message}><Input id="reference" dir="ltr" {...form.register("reference")} /></Field>
              <Field id="notes" label={d.notes} optional className="sm:col-span-2 lg:col-span-3" error={errors.notes?.message}><Textarea id="notes" rows={2} {...form.register("notes")} /></Field>
              <Balance form={form} balances={balances} />
            </FormSection>
            <ContributorsField form={form as unknown as ContributorsForm} />
            <Allocations form={form} bills={bills} />
          </>
        );
      }}
    </DocumentForm>
  );
}

function Balance({ form, balances }: { form: UseFormReturn<PaymentValues>; balances: Record<string, string> }) {
  const { t, locale } = useI18n();
  const supplierId = useWatch({ control: form.control, name: "supplierId" });
  const balance = balances[supplierId];
  if (balance === undefined) return null;
  return <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">{t.purchasing.outstanding}: <Ltr className="font-semibold text-foreground tabular-nums">{formatPaisa(toPaisa(balance), locale)}</Ltr></p>;
}

function Allocations({ form, bills }: { form: UseFormReturn<PaymentValues>; bills: OpenBill[] }) {
  const { t, locale } = useI18n();
  const message = useMessage();
  const p = t.purchasing;
  const { control, register, setValue, formState: { errors } } = form;
  const allocations = useWatch({ control, name: "allocations" }) ?? [];
  const amount = paisa(useWatch({ control, name: "amount" }));
  if (allocations.length === 0) return null;
  const settled = sumPaisa(allocations.map((a) => paisa(a.amount)));

  // Oldest bill first.
  const spread = () => {
    let left = amount;
    allocations.forEach((a, i) => {
      const part = lesser(left, toPaisa(bills.find((b) => b.id === a.billId)?.outstanding ?? "0"));
      setValue(`allocations.${i}.amount`, part > ZERO ? toDbAmount(part) : "", { shouldDirty: true });
      left -= part;
    });
  };

  return (
    <section className="rounded-2xl border bg-card shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-navy">{p.allocate}</h2>
          <p className="text-sm text-muted-foreground">{p.allocateHint}</p>
        </div>
        <Button type="button" variant="outline" disabled={amount <= ZERO} onClick={spread}>{p.oldestFirst}</Button>
      </header>
      <ul className="divide-y">
        {allocations.map((a, i) => {
          const bill = bills.find((b) => b.id === a.billId);
          const error = errors.allocations?.[i]?.amount?.message;
          if (!bill) return null;
          return (
            <li key={a.billId} className="grid gap-3 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
              <div className="min-w-0">
                <Ltr className="text-sm font-medium">{bill.number}</Ltr>
                <p className="text-xs text-muted-foreground">
                  <bdi>{formatDate(bill.date, locale)}</bdi>{bill.dueDate && <> · {p.dueDate}: <bdi>{formatDate(bill.dueDate, locale)}</bdi></>} · {p.outstanding}: <Ltr className="tabular-nums">{formatPaisa(toPaisa(bill.outstanding), locale)}</Ltr>
                </p>
              </div>
              <div className="grid gap-1">
                <MoneyInput aria-label={`${p.allocated}: ${bill.number}`} aria-invalid={error ? true : undefined} {...register(`allocations.${i}.amount`)} />
                {error && <p role="alert" className="text-xs text-destructive">{message(error)}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      <footer className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t bg-muted/50 px-5 py-3 text-sm">
        <span className="text-muted-foreground">{p.allocated}: <Ltr className="font-semibold text-foreground tabular-nums">{formatPaisa(settled, locale)}</Ltr></span>
        <span className="text-muted-foreground">{p.onAccount}: <Ltr className="font-semibold text-foreground tabular-nums">{formatPaisa(amount > settled ? amount - settled : ZERO, locale)}</Ltr></span>
      </footer>
    </section>
  );
}
