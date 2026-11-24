"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { saveCustomerAction } from "@/features/customers/actions";
import { customerSchema, type CustomerValues } from "@/features/customers/schema";
import { useI18n } from "@/i18n/context";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import type { ActionResult } from "@/lib/action-result";
import { ActionError } from "@/components/forms/action-error";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormActions, FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/forms/money-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

export function CustomerForm({ customerId, defaults, takers, opening }: {
  customerId: string | null;
  defaults: CustomerValues;
  takers: { id: string; nameEn: string; nameUr: string | null }[];
  /** Whether an opening balance can be entered: new customers, for users who may adjust accounts. */
  opening: boolean;
}) {
  const { t, locale } = useI18n();
  const c = t.customers;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<string> | null>(null);
  const form = useForm<CustomerValues>({ resolver: zodResolver(customerSchema), defaultValues: defaults });
  const { errors, isDirty } = form.formState;
  const isActive = useWatch({ control: form.control, name: "isActive" });
  useUnsavedChanges(isDirty && !result?.ok);

  const submit = form.handleSubmit((values) => startTransition(async () => {
    const res = await saveCustomerAction(customerId, values);
    setResult(res);
    if (!res.ok || !res.data) return;
    toast.add({ title: c.saved, type: "success" });
    router.push(`/customers/${res.data}`);
  }));
  type TextKey = "code" | "name" | "nameUr" | "ownerName" | "phone" | "altPhone" | "whatsapp" | "area" | "city" | "ntn" | "paymentTerms";
  const input = (key: TextKey, label: string, props: React.ComponentProps<typeof Input> & { hint?: string } = {}) => {
    const { hint, required, ...rest } = props;
    return <Field id={key} label={label} required={required} optional={!required && !hint} hint={hint} error={errors[key]?.message}><Input id={key} {...rest} {...form.register(key)} /></Field>;
  };

  return (
    <form onSubmit={submit} className="grid max-w-5xl gap-6" noValidate>
      <ActionError result={result} />
      <FormSection title={c.details} className="lg:grid-cols-3">
        {input("name", c.name, { required: true })}
        {input("nameUr", c.nameUr, { dir: "rtl", lang: "ur" })}
        {input("ownerName", c.owner)}
        {input("phone", c.phone, { dir: "ltr", type: "tel" })}
        {input("whatsapp", c.whatsapp, { dir: "ltr", type: "tel" })}
        {input("altPhone", c.altPhone, { dir: "ltr", type: "tel" })}
        {input("city", c.city)}
        {input("area", c.area)}
        {input("ntn", c.ntn, { dir: "ltr" })}
        <Field id="address" label={c.address} optional className="sm:col-span-2 lg:col-span-3" error={errors.address?.message}><Textarea id="address" rows={2} {...form.register("address")} /></Field>
      </FormSection>
      <FormSection title={c.terms} className="lg:grid-cols-3">
        <Field id="orderTakerId" label={c.orderTaker} optional error={errors.orderTakerId?.message}>
          <NativeSelect id="orderTakerId" {...form.register("orderTakerId")}>
            <option value="">{c.noOrderTaker}</option>
            {takers.map((x) => <option key={x.id} value={x.id}>{locale === "ur" && x.nameUr ? x.nameUr : x.nameEn}</option>)}
          </NativeSelect>
        </Field>
        <Field id="creditLimit" label={c.creditLimit} hint={c.creditLimitHint} error={errors.creditLimit?.message}><MoneyInput id="creditLimit" {...form.register("creditLimit")} /></Field>
        {input("paymentTerms", c.paymentTerms, { dir: "ltr", inputMode: "numeric", hint: c.paymentTermsHint })}
        {opening && (
          <>
            <Field id="openingBalance" label={c.openingBalance} hint={c.openingHint} error={errors.openingBalance?.message}><MoneyInput id="openingBalance" {...form.register("openingBalance")} /></Field>
            <Field id="openingDate" label={c.openingDate} optional error={errors.openingDate?.message}><Input id="openingDate" type="date" dir="ltr" {...form.register("openingDate")} /></Field>
          </>
        )}
        {input("code", c.code, { dir: "ltr", hint: customerId ? undefined : c.codeAuto })}
        <label className="flex items-center gap-2.5 self-center py-2 text-sm"><Checkbox checked={isActive} onCheckedChange={(v) => form.setValue("isActive", v === true, { shouldDirty: true })} />{c.active}</label>
        <Field id="notes" label={t.documents.notes} optional className="sm:col-span-2 lg:col-span-3" error={errors.notes?.message}><Textarea id="notes" rows={2} {...form.register("notes")} /></Field>
      </FormSection>
      <FormActions>
        <Button type="submit" size="lg" disabled={pending}>{pending ? t.common.saving : t.common.save}</Button>
        <Button type="button" size="lg" variant="outline" disabled={pending} onClick={() => router.push(customerId ? `/customers/${customerId}` : "/customers")}>{t.common.cancel}</Button>
      </FormActions>
    </form>
  );
}
