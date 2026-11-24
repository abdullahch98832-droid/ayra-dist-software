"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { saveProductAction } from "@/features/catalog/actions";
import { productSchema, type ProductValues } from "@/features/catalog/schema";
import type { Choice } from "@/features/catalog/types";
import { useI18n } from "@/i18n/context";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import type { ActionResult } from "@/lib/action-result";
import { ActionError } from "@/components/forms/action-error";
import { Field, NativeSelect, useMessage } from "@/components/forms/field";
import { FormActions, FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/forms/money-input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

export function ProductForm({ productId, defaults, choices, showCosts }: {
  productId: string | null;
  defaults: ProductValues;
  choices: { categories: Choice[]; brands: Choice[]; units: Choice[]; suppliers: Choice[] };
  showCosts: boolean;
}) {
  const { t, locale } = useI18n();
  const message = useMessage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<string> | null>(null);
  const [leaving, setLeaving] = useState(false);
  const form = useForm<ProductValues>({ resolver: zodResolver(productSchema), defaultValues: defaults });
  const { errors, isDirty } = form.formState;
  const units = useFieldArray({ control: form.control, name: "units" });
  const baseUnitId = useWatch({ control: form.control, name: "baseUnitId" });
  const isActive = useWatch({ control: form.control, name: "isActive" });
  useUnsavedChanges(isDirty);

  const c = t.catalog;
  const name = (x: Choice) => (locale === "ur" && x.nameUr ? x.nameUr : x.nameEn);
  const base = choices.units.find((u) => u.id === baseUnitId);

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await saveProductAction(productId, values);
      setResult(res);
      if (!res.ok) return;
      form.reset(values);
      toast.add({ title: c.saved, type: "success" });
      if (!productId && res.data) router.push(`/products/${res.data}`);
    })
  );

  const select = (key: "categoryId" | "brandId" | "supplierId", label: string, options: Choice[], hint?: string) => (
    <Field id={key} label={label} optional hint={hint} error={errors[key]?.message}>
      <NativeSelect id={key} {...form.register(key)}>
        <option value="">{t.documents.none}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{name(o)}</option>)}
      </NativeSelect>
    </Field>
  );

  return (
    <form onSubmit={onSubmit} className="grid max-w-5xl gap-6" noValidate>
      <ActionError result={result} />
      <FormSection title={c.details}>
        <Field id="nameEn" label={c.nameEn} required error={errors.nameEn?.message}><Input id="nameEn" dir="ltr" lang="en" {...form.register("nameEn")} /></Field>
        <Field id="nameUr" label={c.nameUr} optional error={errors.nameUr?.message}><Input id="nameUr" dir="rtl" lang="ur" {...form.register("nameUr")} /></Field>
        <Field id="sku" label={c.sku} hint={productId ? undefined : c.skuAuto} error={errors.sku?.message}><Input id="sku" dir="ltr" {...form.register("sku")} /></Field>
        <Field id="barcode" label={c.barcode} optional error={errors.barcode?.message}><Input id="barcode" dir="ltr" {...form.register("barcode")} /></Field>
        {select("categoryId", c.category, choices.categories)}
        {select("brandId", c.brand, choices.brands)}
        {choices.suppliers.length > 0 && select("supplierId", c.supplier, choices.suppliers, c.supplierHint)}
        <Field id="minimumStock" label={c.minimumStock} hint={c.minimumStockHint} error={errors.minimumStock?.message}><Input id="minimumStock" dir="ltr" inputMode="numeric" {...form.register("minimumStock")} /></Field>
        <Field id="taxRate" label={c.taxRate} optional error={errors.taxRate?.message}><Input id="taxRate" dir="ltr" inputMode="decimal" {...form.register("taxRate")} /></Field>
        <label htmlFor="isActive" className="flex items-center gap-2.5 self-end py-2 text-sm">
          <Checkbox id="isActive" checked={isActive} onCheckedChange={(v) => form.setValue("isActive", v === true, { shouldDirty: true })} />{c.active}
        </label>
        <Field id="notes" label={t.documents.notes} optional className="sm:col-span-2" error={errors.notes?.message}><Textarea id="notes" rows={2} {...form.register("notes")} /></Field>
      </FormSection>

      <FormSection title={c.units} description={c.unitsHint} className="sm:grid-cols-3">
        <Field id="baseUnitId" label={c.baseUnit} required hint={productId ? c.baseUnitFixed : undefined} error={errors.baseUnitId?.message}>
          <NativeSelect id="baseUnitId" disabled={!!productId} {...form.register("baseUnitId")}>
            <option value="">{t.documents.choose}</option>
            {choices.units.map((u) => <option key={u.id} value={u.id}>{name(u)}</option>)}
          </NativeSelect>
        </Field>
        <Field id="salePrice" label={c.sellingPrice} optional error={errors.salePrice?.message}><MoneyInput id="salePrice" {...form.register("salePrice")} /></Field>
        {showCosts
          ? <Field id="purchasePrice" label={c.purchaseCost} optional error={errors.purchasePrice?.message}><MoneyInput id="purchasePrice" {...form.register("purchasePrice")} /></Field>
          : <p className="self-center text-xs text-muted-foreground">{c.costHidden}</p>}

        {units.fields.map((field, i) => {
          const e = errors.units?.[i];
          return (
            <fieldset key={field.id} className="grid gap-4 rounded-lg border bg-muted/40 p-4 sm:col-span-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
              <Field id={`${field.id}-unit`} label={t.documents.unit} required error={e?.unitId?.message}>
                <NativeSelect id={`${field.id}-unit`} {...form.register(`units.${i}.unitId`)}>
                  <option value="">{t.documents.choose}</option>
                  {choices.units.filter((u) => u.id !== baseUnitId).map((u) => <option key={u.id} value={u.id}>{name(u)}</option>)}
                </NativeSelect>
              </Field>
              <Field id={`${field.id}-factor`} label={c.contains} hint={base ? name(base) : c.containsHint} required error={e?.factor?.message}>
                <Input id={`${field.id}-factor`} dir="ltr" inputMode="numeric" {...form.register(`units.${i}.factor`)} />
              </Field>
              <Field id={`${field.id}-sale`} label={c.sellingPrice} error={e?.salePrice?.message}><MoneyInput id={`${field.id}-sale`} {...form.register(`units.${i}.salePrice`)} /></Field>
              {showCosts && <Field id={`${field.id}-cost`} label={c.purchaseCost} error={e?.purchasePrice?.message}><MoneyInput id={`${field.id}-cost`} {...form.register(`units.${i}.purchasePrice`)} /></Field>}
              <Field id={`${field.id}-barcode`} label={c.barcode} error={e?.barcode?.message}><Input id={`${field.id}-barcode`} dir="ltr" {...form.register(`units.${i}.barcode`)} /></Field>
              <Button type="button" variant="ghost" size="icon" className="self-center text-muted-foreground hover:text-destructive" aria-label={c.removeUnit} onClick={() => units.remove(i)}><Trash2 /></Button>
            </fieldset>
          );
        })}
        {typeof errors.units?.message === "string" && <p role="alert" className="text-sm text-destructive sm:col-span-3">{message(errors.units.message)}</p>}
        <div className="sm:col-span-3">
          <Button type="button" variant="outline" onClick={() => units.append({ unitId: "", factor: "", salePrice: "", purchasePrice: "", barcode: "" })}><Plus aria-hidden />{c.addUnit}</Button>
        </div>
      </FormSection>

      <FormActions>
        <Button type="submit" size="lg" disabled={pending}>{pending ? t.common.saving : t.common.save}</Button>
        <Button type="button" size="lg" variant="outline" disabled={pending} onClick={() => (isDirty ? setLeaving(true) : router.push("/products"))}>{t.common.cancel}</Button>
      </FormActions>
      <ConfirmDialog
        open={leaving} onOpenChange={setLeaving} title={t.states.unsavedTitle} description={t.states.unsavedHint}
        confirmLabel={t.common.discard} cancelLabel={t.common.keepEditing}
        onConfirm={() => { form.reset(defaults); setLeaving(false); router.push("/products"); }}
      />
    </form>
  );
}
