"use client";

import { useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Plus, Trash2, Wrench } from "lucide-react";
import type { ProductOption } from "@/features/catalog/types";
import type { Service } from "@/features/sol/queries";
import type { JobValues } from "@/features/sol/schema";
import { useI18n } from "@/i18n/context";
import { formatPaisa, type Paisa } from "@/lib/utils/money";
import { decimalAmount } from "@/lib/utils/quantity";
import { ProductPicker } from "@/components/documents/product-picker";
import { NativeSelect, useMessage } from "@/components/forms/field";
import { Ltr } from "@/components/shared/bidi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Line = JobValues["lines"][number];
const ZERO = BigInt(0);
const amount = (l: Line) => decimalAmount(l.quantity, l.price === "" ? "0" : l.price);
export const itemsTotal = (lines: Line[]): Paisa => lines.reduce((sum, l) => sum + (amount(l) ?? ZERO), ZERO);

/** Services, products and other items of a job, one card per line. */
export function JobItems({ services, products: initial, seesCosts, usesServices, usesProducts, delivered, order = false }: {
  services: Service[];
  products: ProductOption[];
  seesCosts: boolean;
  usesServices: boolean;
  usesProducts: boolean;
  delivered: string[];
  order?: boolean;
}) {
  const { t, locale } = useI18n();
  const s = t.sol;
  const o = t.distributor;
  const message = useMessage();
  const { control, register, setValue, formState: { errors } } = useFormContext<JobValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "lines", keyName: "key" });
  const lines = useWatch({ control, name: "lines" }) ?? [];
  const [products, setProducts] = useState(() => new Map(initial.map((p) => [p.id, p])));
  const local = (en: string, ur: string | null) => (locale === "ur" && ur ? ur : en);
  const blank: Line = { id: "", kind: "other", serviceId: "", productId: "", unitId: "", description: "", quantity: "1", price: "", cost: "" };
  const focus = { shouldFocus: false };

  const addProduct = (p: ProductOption) => {
    setProducts((m) => new Map(m).set(p.id, p));
    const unit = p.units.find((u) => u.unitId === p.baseUnitId) ?? p.units[0];
    if (unit) append({ ...blank, kind: "product", productId: p.id, unitId: unit.unitId, quantity: "", price: unit.salePrice ?? "", cost: seesCosts ? unit.purchasePrice ?? "" : "" }, focus);
  };
  const addService = () => {
    const first = services.find((x) => x.isActive);
    append({ ...blank, kind: "service", serviceId: first?.id ?? "", price: first?.price ?? "" }, focus);
  };

  return (
    <section className="rounded-2xl border bg-card shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <h2 className="text-base font-semibold text-navy">{order ? o.products : s.items}</h2>
        <div className="flex flex-wrap gap-2">
          {usesServices && services.some((x) => x.isActive) && <Button type="button" variant="outline" onClick={addService}><Wrench aria-hidden />{s.addService}</Button>}
          {usesProducts && <ProductPicker onPick={addProduct} />}
          {!order && <Button type="button" variant="outline" onClick={() => append(blank, focus)}><Plus aria-hidden />{s.addOther}</Button>}
        </div>
      </header>
      {fields.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">{order ? o.noProducts : s.noItems}</p>}
      <ol className="divide-y">
        {fields.map((field, i) => {
          const line = lines[i] ?? field;
          const product = products.get(line.productId);
          const unit = product?.units.find((u) => u.unitId === line.unitId);
          const service = services.find((x) => x.id === line.serviceId);
          const fixed = delivered.includes(line.id);
          const error = errors.lines?.[i];
          const total = amount(line);
          const cell = (key: "quantity" | "price" | "cost" | "description", label: string, dir?: "ltr") => (
            <div className="grid content-start gap-1.5">
              <label htmlFor={`${field.key}-${key}`} className="text-xs text-muted-foreground">{label}</label>
              <Input id={`${field.key}-${key}`} dir={dir} inputMode={dir ? "decimal" : undefined} autoComplete="off" className={dir && "tabular-nums"} aria-invalid={error?.[key] ? true : undefined} {...register(`lines.${i}.${key}`)} />
              {error?.[key] && <p role="alert" className="text-xs text-destructive">{message(error[key].message)}</p>}
            </div>
          );
          return (
            <li key={field.key} className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,3fr)_auto] xl:items-start">
              <div className="grid min-w-0 content-start gap-1.5">
                <p className="text-xs text-muted-foreground">{s.kinds[line.kind]}</p>
                {line.kind === "product" && <p className="text-sm font-medium break-words">{product ? local(product.nameEn, product.nameUr) : "—"} <Ltr className="block text-xs font-normal text-muted-foreground">{product?.sku}</Ltr></p>}
                {line.kind === "service" && (
                  <>
                    <NativeSelect
                      aria-label={s.kinds.service} value={line.serviceId} disabled={fixed}
                      onChange={(e) => {
                        const next = services.find((x) => x.id === e.target.value);
                        setValue(`lines.${i}.serviceId`, e.target.value, { shouldDirty: true });
                        // A price belongs to its service.
                        setValue(`lines.${i}.price`, next?.price ?? "", { shouldDirty: true });
                      }}
                    >
                      <option value="">{t.documents.choose}</option>
                      {services.filter((x) => x.isActive || x.id === line.serviceId).map((x) => <option key={x.id} value={x.id}>{local(x.nameEn, x.nameUr)}</option>)}
                    </NativeSelect>
                    {error?.serviceId && <p role="alert" className="text-xs text-destructive">{message(error.serviceId.message)}</p>}
                    {service?.unitLabel && <p className="text-xs text-muted-foreground">{s.unitLabel} <bdi>{local(service.unitLabel, service.unitLabelUr)}</bdi></p>}
                  </>
                )}
                {line.kind === "other" && cell("description", s.itemDescription)}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))]">
                {line.kind === "product" && (
                  <div className="grid content-start gap-1.5">
                    <label htmlFor={`${field.key}-unit`} className="text-xs text-muted-foreground">{t.documents.unit}</label>
                    {fixed || !product || product.units.length < 2 ? <p className="flex min-h-10 items-center text-sm">{unit ? local(unit.nameEn, unit.nameUr) : "—"}</p> : (
                      <NativeSelect
                        id={`${field.key}-unit`} value={line.unitId}
                        onChange={(e) => {
                          const next = product.units.find((u) => u.unitId === e.target.value);
                          setValue(`lines.${i}.unitId`, e.target.value, { shouldDirty: true });
                          setValue(`lines.${i}.price`, next?.salePrice ?? "", { shouldDirty: true });
                          if (seesCosts) setValue(`lines.${i}.cost`, next?.purchasePrice ?? "", { shouldDirty: true });
                        }}
                      >
                        {product.units.map((u) => <option key={u.unitId} value={u.unitId}>{local(u.nameEn, u.nameUr)}{u.factor > 1 ? ` (${u.factor})` : ""}</option>)}
                      </NativeSelect>
                    )}
                  </div>
                )}
                {cell("quantity", s.quantity, "ltr")}
                {cell("price", order ? o.salePrice : s.unitPrice, "ltr")}
                {seesCosts && cell("cost", order ? o.ayraPrice : s.unitCost, "ltr")}
              </div>
              <div className="flex items-center justify-between gap-3 xl:flex-col xl:items-end">
                <p className="text-sm"><span className="block text-xs text-muted-foreground xl:text-end">{s.lineTotal}</span><Ltr className="font-semibold tabular-nums">{total === null ? "—" : formatPaisa(total, locale)}</Ltr></p>
                {!fixed && (
                  <Button type="button" variant="ghost" size="icon" className="ms-auto text-muted-foreground hover:text-destructive" aria-label={s.removeItem} onClick={() => remove(i)}><Trash2 /></Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {fields.length > 0 && (
        <footer className="flex items-center justify-between gap-4 border-t bg-muted/50 px-5 py-4">
          <span className="text-sm text-muted-foreground">{order ? o.amount : s.itemsTotal}</span>
          <Ltr className="text-lg font-semibold text-navy tabular-nums">{formatPaisa(itemsTotal(lines), locale)}</Ltr>
        </footer>
      )}
    </section>
  );
}
