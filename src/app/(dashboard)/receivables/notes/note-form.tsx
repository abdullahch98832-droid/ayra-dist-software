"use client";

import { useState } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { CustomerOption } from "@/features/customers/schema";
import { openInvoicesAction, recordNoteAction } from "@/features/receivables/actions";
import { NOTE_KINDS, noteSchema, type NoteValues, type OpenInvoice } from "@/features/receivables/schema";
import { useI18n } from "@/i18n/context";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { CustomerPicker } from "@/components/documents/customer-picker";
import { DocumentForm } from "@/components/documents/document-form";
import { paisaOf } from "@/components/documents/invoice-allocations";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/forms/money-input";
import { Input } from "@/components/ui/input";

export function NoteForm({ defaults, customer, invoices: initial }: { defaults: NoteValues; customer: CustomerOption | null; invoices: OpenInvoice[] }) {
  const { t } = useI18n();
  const r = t.receivables;
  const [chosen, setChosen] = useState(customer);
  const [invoices, setInvoices] = useState(initial);
  const schema = noteSchema.superRefine((v, ctx) => {
    const invoice = v.kind === "credit" ? invoices.find((i) => i.id === v.invoiceId) : undefined;
    if (invoice && paisaOf(v.amount) > toPaisa(invoice.outstanding)) ctx.addIssue({ code: "custom", message: "allocationTooHigh", path: ["amount"] });
  });
  const pick = async (form: UseFormReturn<NoteValues>, c: CustomerOption) => {
    setChosen(c);
    form.setValue("customerId", c.id, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
    form.setValue("invoiceId", "");
    setInvoices(await openInvoicesAction(c.id).catch(() => []));
  };
  return (
    <DocumentForm<NoteValues>
      defaults={defaults} resolver={zodResolver(schema)} save={recordNoteAction} openPath={(id) => `/receivables/notes/${id}`} cancelPath="/receivables/notes"
      submitLabel={r.postNote} savedMessage={r.noteDone} confirm={{ title: r.noteTitle, description: r.noteConfirm }}
    >
      {(form) => {
        const { errors } = form.formState;
        return (
          <FormSection title={r.note} className="lg:grid-cols-3">
            <Field id="kind" label={t.stock.kind} required error={errors.kind?.message}>
              <NativeSelect id="kind" {...form.register("kind")}>{NOTE_KINDS.map((k) => <option key={k} value={k}>{r.noteKinds[k]}</option>)}</NativeSelect>
            </Field>
            <Field id="customerId" label={t.sales.customer} required error={errors.customerId?.message}><CustomerPicker id="customerId" value={chosen} onChange={(c) => void pick(form, c)} /></Field>
            <Field id="date" label={r.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" {...form.register("date")} /></Field>
            <Field id="amount" label={r.amount} required error={errors.amount?.message}><MoneyInput id="amount" {...form.register("amount")} /></Field>
            <KindFields form={form} invoices={invoices} error={errors.reason?.message} />
          </FormSection>
        );
      }}
    </DocumentForm>
  );
}

function KindFields({ form, invoices, error }: { form: UseFormReturn<NoteValues>; invoices: OpenInvoice[]; error?: string }) {
  const { t, locale } = useI18n();
  const r = t.receivables;
  const kind = useWatch({ control: form.control, name: "kind" });
  return (
    <>
      {kind === "credit" && (
        <Field id="invoiceId" label={r.forInvoice} optional>
          <NativeSelect id="invoiceId" {...form.register("invoiceId")}>
            <option value="">{r.noInvoice}</option>
            {invoices.map((i) => <option key={i.id} value={i.id}>{i.number} · {formatPaisa(toPaisa(i.outstanding), locale)}</option>)}
          </NativeSelect>
        </Field>
      )}
      <Field id="reason" label={t.documents.reason} required={kind !== "opening"} optional={kind === "opening"} error={error}><Input id="reason" {...form.register("reason")} /></Field>
      <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">{r.noteHints[kind]}</p>
    </>
  );
}
