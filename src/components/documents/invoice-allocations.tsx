"use client";

import { useWatch, type Control, type UseFormSetValue, type UseFormRegister, type FieldErrors } from "react-hook-form";
import type { OpenInvoice } from "@/features/receivables/schema";
import { useI18n } from "@/i18n/context";
import { formatPaisa, parseRupees, sumPaisa, toDbAmount, toPaisa, type Paisa } from "@/lib/utils/money";
import { useMessage } from "@/components/forms/field";
import { MoneyInput } from "@/components/forms/money-input";
import { Ltr } from "@/components/shared/bidi";
import { formatDate } from "@/components/shared/format";
import { Button } from "@/components/ui/button";

const ZERO = BigInt(0);
export const paisaOf = (text: string | undefined): Paisa => {
  try {
    return parseRupees(text ?? "");
  } catch {
    return ZERO;
  }
};

export interface AllocationValues { allocations: { invoiceId: string; amount: string }[] }

/** Which invoices a payment settles. `available` is what can still be used. */
export function InvoiceAllocations({ control, setValue, register, errors, invoices, available, empty }: {
  control: Control<AllocationValues>;
  setValue: UseFormSetValue<AllocationValues>;
  register: UseFormRegister<AllocationValues>;
  errors: FieldErrors<AllocationValues>;
  invoices: OpenInvoice[];
  available: Paisa;
  empty: string;
}) {
  const { t, locale } = useI18n();
  const message = useMessage();
  const r = t.receivables;
  const allocations = useWatch({ control, name: "allocations" }) ?? [];
  const settled = sumPaisa(allocations.map((a) => paisaOf(a.amount)));

  const spread = () => {
    let left = available;
    allocations.forEach((a, i) => {
      const due = toPaisa(invoices.find((b) => b.id === a.invoiceId)?.outstanding ?? "0");
      const part = left < due ? left : due;
      setValue(`allocations.${i}.amount`, part > ZERO ? toDbAmount(part) : "", { shouldDirty: true });
      left -= part;
    });
  };

  return (
    <section className="rounded-xl border bg-card shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-navy">{r.invoices}</h2>
          <p className="text-sm text-muted-foreground">{r.invoicesHint}</p>
        </div>
        {allocations.length > 0 && <Button type="button" variant="outline" disabled={available <= ZERO} onClick={spread}>{r.oldestFirst}</Button>}
      </header>
      {allocations.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted-foreground">{empty}</p> : (
        <>
          <ul className="divide-y">
            {allocations.map((a, i) => {
              const invoice = invoices.find((b) => b.id === a.invoiceId);
              const error = errors.allocations?.[i]?.amount?.message;
              if (!invoice) return null;
              return (
                <li key={a.invoiceId} className="grid gap-3 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
                  <div className="min-w-0">
                    <Ltr className="text-sm font-medium">{invoice.number}</Ltr>
                    <p className="text-xs text-muted-foreground">
                      <bdi>{formatDate(invoice.date, locale)}</bdi>{invoice.dueDate && <> · {t.sales.dueDate}: <bdi>{formatDate(invoice.dueDate, locale)}</bdi></>} · {t.sales.outstanding}: <Ltr className="tabular-nums">{formatPaisa(toPaisa(invoice.outstanding), locale)}</Ltr>
                    </p>
                  </div>
                  <div className="grid gap-1">
                    <MoneyInput aria-label={`${r.settled}: ${invoice.number}`} aria-invalid={error ? true : undefined} {...register(`allocations.${i}.amount`)} />
                    {error && <p role="alert" className="text-xs text-destructive">{message(error)}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
          <footer className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t bg-muted/50 px-5 py-3 text-sm">
            <span className="text-muted-foreground">{r.settled}: <Ltr className="font-semibold text-foreground tabular-nums">{formatPaisa(settled, locale)}</Ltr></span>
            <span className="text-muted-foreground">{r.onAccount}: <Ltr className="font-semibold text-foreground tabular-nums">{formatPaisa(available > settled ? available - settled : ZERO, locale)}</Ltr></span>
          </footer>
        </>
      )}
    </section>
  );
}

/** The rules that need the invoices on screen; the database enforces them again. */
export function allocationIssues(values: AllocationValues, invoices: OpenInvoice[], available: Paisa): { path: (string | number)[]; message: string }[] {
  const issues: { path: (string | number)[]; message: string }[] = [];
  values.allocations.forEach((a, i) => {
    const invoice = invoices.find((b) => b.id === a.invoiceId);
    if (invoice && paisaOf(a.amount) > toPaisa(invoice.outstanding)) issues.push({ path: ["allocations", i, "amount"], message: "allocationTooHigh" });
  });
  if (sumPaisa(values.allocations.map((a) => paisaOf(a.amount))) > available) issues.push({ path: ["amount"], message: "allocationsExceed" });
  return issues;
}
