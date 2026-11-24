"use client";

import { useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Trash2 } from "lucide-react";
import type { ProductOption, UnitOption } from "@/features/catalog/types";
import { useI18n } from "@/i18n/context";
import { fill } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { formatPaisa, type Paisa } from "@/lib/utils/money";
import { parseQuantity } from "@/lib/utils/quantity";
import { NativeSelect, useMessage } from "@/components/forms/field";
import { Ltr } from "@/components/shared/bidi";
import { formatNumber } from "@/components/shared/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductPicker } from "./product-picker";

/** One document line; all values are strings until the server validates them. */
export type LineValues = { productId: string; unitId: string } & Record<string, string>;
interface LinesForm { lines: LineValues[] }

export interface LineColumn {
  key: string;
  label: string;
  kind: "quantity" | "money" | "text" | "select";
  /** Choices of a `select`. */
  options?: { value: string; label: string }[];
  hint?: string;
  /** Show the entered quantity in base units below the field. */
  showBase?: boolean;
  /** Warning under the field, for example when more than ordered is received. */
  warn?: (line: LineValues, product: ProductOption | undefined) => string | undefined;
}

/**
 * Editable lines of a stock document. Must be inside a FormProvider whose form has `lines`.
 * One card per line; fields sit side by side when there is room.
 */
export function LineEditor({
  products: initialProducts, columns, newLine, amount, uniqueProducts = false, lockProducts = false, lockUnits = lockProducts, unitChange, info, totals,
}: {
  products: ProductOption[];
  columns: LineColumn[];
  newLine: (product: ProductOption, unit: UnitOption) => LineValues;
  /** Line value; null while incomplete. Omit for documents without prices. */
  amount?: (line: LineValues) => Paisa | null;
  uniqueProducts?: boolean;
  /** Lines come from another document: products cannot be changed or added. */
  lockProducts?: boolean;
  lockUnits?: boolean;
  /** Values to write when the unit changes. By default prices follow the unit and unknown prices are cleared. */
  unitChange?: (line: LineValues, next: UnitOption, previous: UnitOption | undefined, product: ProductOption) => Record<string, string>;
  info?: (line: LineValues, product: ProductOption | undefined) => React.ReactNode;
  /** Rows above the total, such as the discount. */
  totals?: (lines: LineValues[]) => { label: string; value: Paisa }[];
}) {
  const { t, locale } = useI18n();
  const message = useMessage();
  const { control, register, setValue, formState: { errors } } = useFormContext<LinesForm>();
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const lines = useWatch({ control, name: "lines" }) ?? [];
  const [products, setProducts] = useState(() => new Map(initialProducts.map((p) => [p.id, p])));
  const local = (en: string, ur: string | null) => (locale === "ur" && ur ? ur : en);

  const add = (product: ProductOption) => {
    setProducts((m) => new Map(m).set(product.id, product));
    if (uniqueProducts && lines.some((l) => l.productId === product.id)) return;
    const unit = product.units.find((u) => u.unitId === product.baseUnitId) ?? product.units[0];
    if (unit) append(newLine(product, unit), { shouldFocus: false });
  };

  const total = amount ? lines.reduce<Paisa>((sum, l) => sum + (amount(l) ?? BigInt(0)), BigInt(0)) : null;
  const linesError = errors.lines?.root?.message ?? (typeof errors.lines?.message === "string" ? errors.lines.message : undefined);

  return (
    <section className="rounded-xl border bg-card shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <h2 className="text-base font-semibold text-navy">{t.documents.lines}</h2>
        {!lockProducts && <ProductPicker onPick={add} />}
      </header>
      {linesError && <p role="alert" className="px-5 pt-4 text-sm text-destructive">{message(linesError)}</p>}
      {fields.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t.documents.noLines}</p>}
      <ol className="divide-y">
        {fields.map((field, index) => {
          const line = lines[index] ?? field;
          const product = products.get(line.productId);
          const unit = product?.units.find((u) => u.unitId === line.unitId);
          const base = product?.units.find((u) => u.unitId === product.baseUnitId);
          const lineAmount = amount?.(line);
          return (
            <li key={field.id} className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,3fr)_auto] xl:items-start">
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">{product ? local(product.nameEn, product.nameUr) : "—"}</p>
                <Ltr className="text-xs text-muted-foreground">{product?.sku}</Ltr>
                {info?.(line, product)}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))]">
                <div className="grid content-start gap-1.5">
                  <label htmlFor={`${field.id}-unit`} className="text-xs text-muted-foreground">{t.documents.unit}</label>
                  {lockUnits || !product || product.units.length < 2 ? (
                    <p className="flex min-h-10 items-center text-sm">{unit ? local(unit.nameEn, unit.nameUr) : "—"}</p>
                  ) : (
                    <NativeSelect
                      id={`${field.id}-unit`}
                      value={line.unitId}
                      onChange={(e) => {
                        const next = product.units.find((u) => u.unitId === e.target.value);
                        if (!next) return;
                        const fresh = newLine(product, next);
                        // A price belongs to its unit, so a carton price must never stay on a piece.
                        const values = unitChange?.(line, next, unit, product)
                          ?? Object.fromEntries(columns.filter((c) => c.kind === "money").map((c) => [c.key, fresh[c.key] ?? ""]));
                        setValue(`lines.${index}.unitId`, next.unitId, { shouldDirty: true });
                        for (const [key, value] of Object.entries(values)) setValue(`lines.${index}.${key}`, value, { shouldDirty: true });
                      }}
                    >
                      {product.units.map((u) => <option key={u.unitId} value={u.unitId}>{local(u.nameEn, u.nameUr)}{u.factor > 1 ? ` (${u.factor})` : ""}</option>)}
                    </NativeSelect>
                  )}
                </div>
                {columns.map((c) => {
                  const error = (errors.lines?.[index] as Record<string, { message?: string }> | undefined)?.[c.key]?.message;
                  const entered = parseQuantity(line[c.key]);
                  const warning = c.warn?.(line, product);
                  const id = `${field.id}-${c.key}`;
                  return (
                    <div key={c.key} className="grid content-start gap-1.5">
                      <label htmlFor={id} className="text-xs text-muted-foreground" title={c.hint}>{c.label}</label>
                      {c.kind === "select" ? (
                        <NativeSelect id={id} {...register(`lines.${index}.${c.key}`)}>
                          {c.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </NativeSelect>
                      ) : <Input
                        id={id}
                        dir={c.kind === "text" ? undefined : "ltr"}
                        inputMode={c.kind === "quantity" ? "numeric" : c.kind === "money" ? "decimal" : undefined}
                        autoComplete="off"
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `${id}-error` : undefined}
                        className={cn(c.kind !== "text" && "tabular-nums")}
                        {...register(`lines.${index}.${c.key}`)}
                      />}
                      {error && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{message(error)}</p>}
                      {warning && <p className="text-xs text-warning">{warning}</p>}
                      {c.showBase && unit && base && unit.factor > 1 && entered !== null && (
                        <p className="text-xs text-muted-foreground">
                          {fill(t.documents.inBaseUnits, { quantity: formatNumber(entered * BigInt(unit.factor), locale), unit: local(base.nameEn, base.nameUr) })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-3 xl:flex-col xl:items-end">
                {amount && (
                  <p className="text-sm">
                    <span className="block text-xs text-muted-foreground xl:text-end">{t.documents.lineTotal}</span>
                    <Ltr className="font-semibold tabular-nums">{lineAmount === null || lineAmount === undefined ? "—" : formatPaisa(lineAmount, locale)}</Ltr>
                  </p>
                )}
                {!lockProducts && (
                  <Button type="button" variant="ghost" size="icon" className="ms-auto text-muted-foreground hover:text-destructive" aria-label={`${t.documents.removeLine}: ${product?.nameEn ?? ""}`} onClick={() => remove(index)}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {total !== null && fields.length > 0 && (
        <footer className="grid gap-1.5 border-t bg-muted/50 px-5 py-4">
          {totals?.(lines).map((row) => (
            <p key={row.label} className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
              {row.label}<Ltr className="tabular-nums">{formatPaisa(row.value, locale)}</Ltr>
            </p>
          ))}
          <p className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">{t.documents.total}</span>
            <Ltr className="text-lg font-semibold text-navy tabular-nums">{formatPaisa(total, locale)}</Ltr>
          </p>
        </footer>
      )}
    </section>
  );
}
