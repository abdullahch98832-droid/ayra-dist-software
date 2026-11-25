"use client";

import { useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { buyForOrderAction } from "@/features/sol/actions";
import { buySchema, type BuyValues } from "@/features/sol/schema";
import { useI18n } from "@/i18n/context";
import { formatPaisa } from "@/lib/utils/money";
import { decimalAmount } from "@/lib/utils/quantity";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect, useMessage } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { Ltr } from "@/components/shared/bidi";
import { formatNumber } from "@/components/shared/format";
import { Input } from "@/components/ui/input";

interface Line { name: string; sku: string; unit: string; needed: number; left: number }

/** The goods of a distributor order, ordered from Ayra at the price for that order. */
export function BuyForm({ lines, warehouses, defaults }: { lines: Line[]; warehouses: { id: string; name: string }[]; defaults: BuyValues }) {
  const { t, locale } = useI18n();
  const o = t.distributor;
  const d = t.documents;
  const message = useMessage();
  return (
    <DocumentForm<BuyValues> defaults={defaults} resolver={zodResolver(buySchema)} save={buyForOrderAction} openPath={(id) => `/purchasing/company/orders/${id}`} cancelPath={`/sol/orders/${defaults.jobId}`} submitLabel={o.orderFromAyra} savedMessage={o.orderedDone}>
      {({ register, control, formState: { errors } }) => (
        <>
          <FormSection title={o.fromAyra} className="lg:grid-cols-3">
            <Field id="warehouseId" label={d.warehouse} required error={errors.warehouseId?.message}>
              <NativeSelect id="warehouseId" {...register("warehouseId")}><option value="">{d.choose}</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</NativeSelect>
            </Field>
            <Field id="date" label={d.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" {...register("date")} /></Field>
            <Field id="expectedDate" label={o.expected} optional error={errors.expectedDate?.message}><Input id="expectedDate" type="date" dir="ltr" {...register("expectedDate")} /></Field>
            <Field id="notes" label={d.notes} optional className="sm:col-span-2 lg:col-span-3" error={errors.notes?.message}><Input id="notes" {...register("notes")} /></Field>
          </FormSection>
          <section className="overflow-clip rounded-2xl border bg-card shadow-card" aria-label={o.products}>
            <h2 className="border-b px-5 py-4 text-base font-semibold text-navy">{o.products}</h2>
            <ol className="divide-y">
              {lines.map((l, i) => (
                <li key={i} className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_minmax(0,1fr)] sm:items-start">
                  <p className="min-w-0 text-sm font-medium break-words"><bdi>{l.name}</bdi> <Ltr className="block text-xs font-normal text-muted-foreground">{l.sku}</Ltr><span className="block text-xs font-normal text-muted-foreground">{o.needed}: <Ltr>{formatNumber(l.needed, locale)}</Ltr> <bdi>{l.unit}</bdi> · {o.stillNeeded}: <Ltr>{formatNumber(l.left, locale)}</Ltr></span></p>
                  {(["quantity", "price"] as const).map((key) => (
                    <div key={key} className="grid content-start gap-1.5">
                      <label htmlFor={`${key}-${i}`} className="text-xs text-muted-foreground">{key === "quantity" ? o.quantity : o.ayraPrice}</label>
                      <Input id={`${key}-${i}`} dir="ltr" inputMode="decimal" autoComplete="off" className="tabular-nums" aria-invalid={errors.lines?.[i]?.[key] ? true : undefined} {...register(`lines.${i}.${key}`)} />
                      {errors.lines?.[i]?.[key] && <p role="alert" className="text-xs text-destructive">{message(errors.lines[i]?.[key]?.message)}</p>}
                    </div>
                  ))}
                  <LineTotal control={control} index={i} label={d.lineTotal} />
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </DocumentForm>
  );
}

function LineTotal({ control, index, label }: { control: Control<BuyValues>; index: number; label: string }) {
  const { locale } = useI18n();
  const [quantity, price] = useWatch({ control, name: [`lines.${index}.quantity`, `lines.${index}.price`] });
  const total = quantity && price ? decimalAmount(quantity, price) : null;
  return <p className="text-sm sm:text-end"><span className="block text-xs text-muted-foreground">{label}</span><Ltr className="font-semibold tabular-nums">{total === null ? "—" : formatPaisa(total, locale)}</Ltr></p>;
}
