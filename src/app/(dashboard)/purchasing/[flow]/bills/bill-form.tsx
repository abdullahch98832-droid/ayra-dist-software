"use client";

import { useController, useFormContext, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { saveBillAction } from "@/features/purchasing/actions";
import { flowPath, type Flow } from "@/features/purchasing/flow";
import type { FlowSupplier } from "@/features/purchasing/queries";
import { billSchema, type BillValues } from "@/features/purchasing/schema";
import { useI18n } from "@/i18n/context";
import { formatPaisa, parseRupees, sumPaisa, toDbAmount, toPaisa, type Paisa } from "@/lib/utils/money";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect, useMessage } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/forms/money-input";
import { Ltr } from "@/components/shared/bidi";
import { formatDate } from "@/components/shared/format";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface BillReceipt {
  id: string;
  docNo: string;
  date: string;
  reference: string | null;
  supplierId: string;
  total: string;
}

const amount = (text: string): Paisa | null => {
  try {
    return parseRupees(text);
  } catch {
    return null;
  }
};

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function BillForm({ flow, billId, defaults, suppliers, receipts }: {
  flow: Flow;
  billId: string | null;
  defaults: BillValues;
  suppliers: FlowSupplier[];
  receipts: BillReceipt[];
}) {
  const { t, locale } = useI18n();
  const d = t.documents;
  const p = t.purchasing;
  const name = (s: FlowSupplier) => (locale === "ur" && s.nameUr ? s.nameUr : s.nameEn);

  // The due date follows the supplier's terms until someone types one.
  const applyTerms = (form: UseFormReturn<BillValues>) => {
    if (form.getFieldState("dueDate").isDirty) return;
    const terms = suppliers.find((s) => s.id === form.getValues("supplierId"))?.terms;
    const date = form.getValues("date");
    if (terms && /^\d{4}-\d{2}-\d{2}$/.test(date)) form.setValue("dueDate", addDays(date, terms));
  };

  return (
    <DocumentForm<BillValues>
      defaults={defaults}
      resolver={zodResolver(billSchema)}
      save={(values) => saveBillAction(billId, values)}
      openPath={(id) => flowPath(flow, "bills", id)}
      cancelPath={billId ? flowPath(flow, "bills", billId) : flowPath(flow, "bills")}
    >
      {(form) => {
        const { errors } = form.formState;
        return (
          <>
            <FormSection title={p.bill} className="lg:grid-cols-4">
              <Field id="supplierId" label={d.supplier} required error={errors.supplierId?.message}>
                {billId ? <Input id="supplierId" readOnly value={suppliers.filter((s) => s.id === defaults.supplierId).map(name).join("")} /> : (
                  <NativeSelect id="supplierId" {...form.register("supplierId", { onChange: () => { form.setValue("receiptIds", []); applyTerms(form); } })}>
                    {suppliers.length !== 1 && <option value="">{d.choose}</option>}
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
                  </NativeSelect>
                )}
              </Field>
              <Field id="number" label={p.billNumber} required error={errors.number?.message}><Input id="number" dir="ltr" autoComplete="off" {...form.register("number")} /></Field>
              <Field id="date" label={p.billDate} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" {...form.register("date", { onChange: () => applyTerms(form) })} /></Field>
              <Field id="dueDate" label={p.dueDate} optional error={errors.dueDate?.message}><Input id="dueDate" type="date" dir="ltr" {...form.register("dueDate")} /></Field>
            </FormSection>
            <ReceiptPicker receipts={receipts} />
            <FormSection title={p.amount}>
              <Field id="amount" label={p.amount} required error={errors.amount?.message}><MoneyInput id="amount" {...form.register("amount")} /></Field>
              <Variance receipts={receipts} />
              <Field id="notes" label={d.notes} optional className="sm:col-span-2" error={errors.notes?.message}><Textarea id="notes" rows={2} {...form.register("notes")} /></Field>
            </FormSection>
          </>
        );
      }}
    </DocumentForm>
  );
}

const totalOf = (receipts: BillReceipt[], ids: string[]) => sumPaisa(receipts.filter((r) => ids.includes(r.id)).map((r) => toPaisa(r.total)));

function ReceiptPicker({ receipts }: { receipts: BillReceipt[] }) {
  const { t, locale } = useI18n();
  const message = useMessage();
  const { control, getValues, setValue, formState: { errors } } = useFormContext<BillValues>();
  const supplierId = useWatch({ control, name: "supplierId" });
  const { field } = useController({ control, name: "receiptIds" });
  const own = receipts.filter((r) => r.supplierId === supplierId);

  const toggle = (id: string, checked: boolean) => {
    const before = totalOf(receipts, field.value);
    const next = checked ? [...field.value, id] : field.value.filter((x) => x !== id);
    field.onChange(next);
    // Keep suggesting the receipts' value until a different bill amount is typed.
    const typed = getValues("amount").trim();
    if (typed === "" || amount(typed) === before) setValue("amount", next.length ? toDbAmount(totalOf(receipts, next)) : "", { shouldDirty: true });
  };

  const error = errors.receiptIds?.root?.message ?? errors.receiptIds?.message;
  return (
    <section className="rounded-xl border bg-card shadow-card">
      <header className="border-b px-5 py-4"><h2 className="text-base font-semibold text-navy">{t.purchasing.chooseReceipts}</h2></header>
      {error && <p role="alert" className="px-5 pt-4 text-sm text-destructive">{message(error)}</p>}
      {own.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">{supplierId ? t.purchasing.noUnbilled : t.purchasing.chooseSupplier}</p>
      ) : (
        <ul className="divide-y">
          {own.map((r) => (
            <li key={r.id}>
              <label className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-muted/50">
                <Checkbox checked={field.value.includes(r.id)} onCheckedChange={(checked) => toggle(r.id, checked === true)} />
                <span className="min-w-0 flex-1">
                  <Ltr className="text-sm font-medium">{r.docNo}</Ltr>
                  <span className="block text-xs text-muted-foreground"><bdi>{formatDate(r.date, locale)}</bdi>{r.reference && <> · <Ltr>{r.reference}</Ltr></>}</span>
                </span>
                <Ltr className="text-sm font-semibold tabular-nums">{formatPaisa(toPaisa(r.total), locale)}</Ltr>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Variance({ receipts }: { receipts: BillReceipt[] }) {
  const { t, locale } = useI18n();
  const { control } = useFormContext<BillValues>();
  const ids = useWatch({ control, name: "receiptIds" });
  const typed = amount(useWatch({ control, name: "amount" }) ?? "");
  const total = totalOf(receipts, ids);
  const difference = typed === null ? null : typed - total;
  return (
    <dl className="grid content-center gap-1.5 rounded-lg bg-muted px-4 py-3 text-sm">
      <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t.purchasing.receiptsTotal}</dt><dd><Ltr className="tabular-nums">{formatPaisa(total, locale)}</Ltr></dd></div>
      <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t.purchasing.variance}</dt><dd><Ltr className="font-semibold tabular-nums">{difference === null ? "—" : formatPaisa(difference, locale)}</Ltr></dd></div>
      {difference !== null && difference !== BigInt(0) && ids.length > 0 && <p className="text-xs text-warning">{t.purchasing.varianceHint}</p>}
    </dl>
  );
}
