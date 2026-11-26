"use client";

import { useState } from "react";
import { useWatch, type Control, type UseFormRegister, type UseFormReturn, type UseFormSetValue, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { CustomerOption } from "@/features/customers/schema";
import { openInvoicesAction, recordPaymentAction } from "@/features/receivables/actions";
import { HELD, PAYMENT_METHODS, paymentSchema, type OpenInvoice, type PaymentValues } from "@/features/receivables/schema";
import { useI18n } from "@/i18n/context";
import { CustomerPicker } from "@/components/documents/customer-picker";
import { DocumentForm } from "@/components/documents/document-form";
import { allocationIssues, InvoiceAllocations, paisaOf, type AllocationValues } from "@/components/documents/invoice-allocations";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/forms/money-input";
import { ContributorsField, type ContributorsForm } from "@/components/forms/contributors-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function PaymentForm({ defaults, customer, invoices: initial, accounts, takers, collector, poster, me }: {
  defaults: PaymentValues;
  customer: CustomerOption | null;
  invoices: OpenInvoice[];
  accounts: { id: string; name: string }[];
  takers: { id: string; nameEn: string; nameUr: string | null }[];
  /** An order taker collects in their own name only. */
  collector: string | null;
  poster: boolean;
  /** Employee of the signed-in user. */
  me: string | null;
}) {
  const { t, locale } = useI18n();
  const r = t.receivables;
  const [chosen, setChosen] = useState(customer);
  const [invoices, setInvoices] = useState(initial);
  const name = (x: { nameEn: string; nameUr: string | null }) => (locale === "ur" && x.nameUr ? x.nameUr : x.nameEn);
  const schema = paymentSchema.superRefine((v, ctx) => {
    for (const issue of allocationIssues(v, invoices, paisaOf(v.amount))) ctx.addIssue({ code: "custom", ...issue });
  });

  const pick = async (form: UseFormReturn<PaymentValues>, c: CustomerOption) => {
    setChosen(c);
    form.setValue("customerId", c.id, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
    const open = await openInvoicesAction(c.id).catch(() => []);
    setInvoices(open);
    form.setValue("allocations", open.map((i) => ({ invoiceId: i.id, amount: "" })));
    if (!collector && c.orderTakerId && takers.some((x) => x.id === c.orderTakerId)) form.setValue("collectedBy", c.orderTakerId);
  };

  return (
    <DocumentForm<PaymentValues>
      defaults={defaults}
      resolver={zodResolver(schema)}
      save={recordPaymentAction}
      openPath={(id) => `/receivables/payments/${id}`}
      cancelPath="/receivables/payments"
      submitLabel={r.newPayment}
      savedMessage={r.paymentDone}
      confirm={{ title: r.paymentTitle, description: r.invoicesHint }}
    >
      {(form) => {
        const { errors } = form.formState;
        return (
          <>
            <FormSection title={r.payment} className="lg:grid-cols-3">
              <Field id="customerId" label={t.sales.customer} required error={errors.customerId?.message}>
                <CustomerPicker id="customerId" value={chosen} onChange={(c) => void pick(form, c)} />
              </Field>
              <Field id="amount" label={r.amount} required error={errors.amount?.message}><MoneyInput id="amount" {...form.register("amount")} /></Field>
              <Field id="date" label={r.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" {...form.register("date")} /></Field>
              <Field id="method" label={r.method} required error={errors.method?.message}>
                <NativeSelect id="method" {...form.register("method")}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t.purchasing.methods[m]}</option>)}</NativeSelect>
              </Field>
              <Field id="destination" label={r.destination} required error={errors.destination?.message}>
                <NativeSelect id="destination" {...form.register("destination")}>
                  <option value="">{t.documents.choose}</option>
                  {takers.length > 0 && <option value={HELD}>{r.heldByTaker}</option>}
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </NativeSelect>
              </Field>
              {collector ? null : (
                <Field id="collectedBy" label={r.collectedBy} optional error={errors.collectedBy?.message}>
                  <NativeSelect id="collectedBy" {...form.register("collectedBy")}>
                    <option value="">{r.nobody}</option>
                    {takers.map((x) => <option key={x.id} value={x.id}>{name(x)}</option>)}
                  </NativeSelect>
                </Field>
              )}
              <Field id="reference" label={r.reference} optional error={errors.reference?.message}><Input id="reference" dir="ltr" {...form.register("reference")} /></Field>
              <Field id="notes" label={t.documents.notes} optional className="sm:col-span-2" error={errors.notes?.message}><Textarea id="notes" rows={2} {...form.register("notes")} /></Field>
              <Outcome form={form} poster={poster} me={me} />
            </FormSection>
            <ContributorsField form={form as unknown as ContributorsForm} />
            {chosen && <Allocations form={form} invoices={invoices} />}
          </>
        );
      }}
    </DocumentForm>
  );
}

/** Says whether the payment is posted now or waits for the office. */
function Outcome({ form, poster, me }: { form: UseFormReturn<PaymentValues>; poster: boolean; me: string | null }) {
  const { t } = useI18n();
  const [destination, collectedBy] = useWatch({ control: form.control, name: ["destination", "collectedBy"] });
  const r = t.receivables;
  if (!destination) return null;
  const held = destination === HELD;
  const posts = poster || (held && me !== null && collectedBy === me);
  return <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">{posts ? r.willPost : r.willWait}{held && <> {r.heldHint}</>}</p>;
}

function Allocations({ form, invoices }: { form: UseFormReturn<PaymentValues>; invoices: OpenInvoice[] }) {
  const { t } = useI18n();
  const amount = useWatch({ control: form.control, name: "amount" });
  return (
    <InvoiceAllocations
      control={form.control as unknown as Control<AllocationValues>} setValue={form.setValue as unknown as UseFormSetValue<AllocationValues>}
      register={form.register as unknown as UseFormRegister<AllocationValues>} errors={form.formState.errors as FieldErrors<AllocationValues>}
      invoices={invoices} available={paisaOf(amount)} empty={t.receivables.noOpenInvoices}
    />
  );
}
