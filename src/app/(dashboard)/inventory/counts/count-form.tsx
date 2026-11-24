"use client";

import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search } from "lucide-react";
import { saveCountAction } from "@/features/inventory/actions";
import type { CountSheetRow } from "@/features/inventory/queries";
import { countSchema, type CountValues } from "@/features/inventory/schema";
import { useI18n } from "@/i18n/context";
import { fill, isolate } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { parseQuantity } from "@/lib/utils/quantity";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect, useMessage } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { Ltr } from "@/components/shared/bidi";
import { formatNumber } from "@/components/shared/format";
import { Input } from "@/components/ui/input";

/** `saved` holds the stock on hand each line was last compared with. */
export function CountForm({ countId, warehouseName, defaults, sheet, saved }: {
  countId: string | null;
  warehouseName: string;
  defaults: CountValues;
  /** Same order as defaults.lines. */
  sheet: CountSheetRow[];
  saved: Record<string, number>;
}) {
  const { t } = useI18n();
  return (
    <DocumentForm<CountValues>
      defaults={defaults}
      resolver={zodResolver(countSchema)}
      save={(values) => saveCountAction(countId, values)}
      openPath={(id) => `/inventory/counts/${id}`}
      cancelPath={countId ? `/inventory/counts/${countId}` : "/inventory/counts"}
    >
      {(form) => {
        const { errors } = form.formState;
        return (
          <>
            <FormSection title={t.stock.count} description={t.stock.countHint} className="lg:grid-cols-3">
              <Field id="warehouse" label={t.documents.warehouse}><Input id="warehouse" readOnly value={warehouseName} /></Field>
              <Field id="date" label={t.documents.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" {...form.register("date")} /></Field>
              <Field id="notes" label={t.documents.notes} optional error={errors.notes?.message}><Input id="notes" {...form.register("notes")} /></Field>
            </FormSection>
            <Sheet sheet={sheet} saved={saved} />
          </>
        );
      }}
    </DocumentForm>
  );
}

type Filter = "all" | "uncounted" | "differences";

function Sheet({ sheet, saved }: { sheet: CountSheetRow[]; saved: Record<string, number> }) {
  const { t, locale } = useI18n();
  const s = t.stock;
  const message = useMessage();
  const { control, register, formState: { errors } } = useFormContext<CountValues>();
  const lines = useWatch({ control, name: "lines" }) ?? [];
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const n = (v: number | bigint) => formatNumber(v, locale);
  const term = query.trim().toLowerCase();
  const difference = (i: number) => {
    const counted = parseQuantity(lines[i]?.counted);
    return counted === null ? null : counted - BigInt(sheet[i]?.onHand ?? 0);
  };
  const counted = lines.filter((l) => l.counted.trim() !== "").length;
  const error = errors.lines?.root?.message ?? (errors.lines as { message?: string } | undefined)?.message;

  return (
    <section className="rounded-xl border bg-card shadow-card">
      <header className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
        <h2 className="me-auto text-base font-semibold text-navy">{t.documents.lines}</h2>
        <span className="text-sm text-muted-foreground">{fill(s.counts, { counted: n(counted), total: n(sheet.length) })}</span>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={s.searchSheet} aria-label={s.searchSheet} className="ps-9" />
        </div>
        <NativeSelect aria-label={s.filterAll} value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="w-full sm:w-44">
          <option value="all">{s.filterAll}</option>
          <option value="uncounted">{s.onlyUncounted}</option>
          <option value="differences">{s.onlyDifferences}</option>
        </NativeSelect>
      </header>
      {error && <p role="alert" className="px-5 pt-4 text-sm text-destructive">{message(error)}</p>}
      <ul className="divide-y">
        {sheet.map((row, i) => {
          const diff = difference(i);
          const snapshot = saved[row.id];
          // Hidden rows stay mounted, so what was typed in them is kept.
          const shown = (!term || `${row.nameEn} ${row.nameUr ?? ""} ${row.sku} ${row.barcode}`.toLowerCase().includes(term))
            && (filter === "all" || (filter === "uncounted" ? diff === null : diff !== null && diff !== BigInt(0)));
          const lineError = errors.lines?.[i]?.counted?.message;
          const name = locale === "ur" && row.nameUr ? row.nameUr : row.nameEn;
          return (
            <li key={row.id} className={cn("grid grid-cols-3 items-center gap-x-4 gap-y-2 px-5 py-3 md:grid-cols-[minmax(0,2fr)_7rem_8rem_7rem_minmax(0,1fr)]", !shown && "hidden")}>
              <div className="col-span-3 min-w-0 md:col-span-1">
                <p className="text-sm font-medium break-words">{name}</p>
                <p className="text-xs text-muted-foreground"><Ltr>{row.sku}</Ltr> · {locale === "ur" && row.unitUr ? row.unitUr : row.unitEn}</p>
              </div>
              <p className="text-sm"><span className="block text-xs text-muted-foreground">{s.system}</span><Ltr className="tabular-nums">{n(row.onHand)}</Ltr></p>
              <div>
                <label htmlFor={`count-${row.id}`} className="block text-xs text-muted-foreground">{s.counted}</label>
                <Input id={`count-${row.id}`} dir="ltr" inputMode="numeric" autoComplete="off" className="tabular-nums" aria-invalid={lineError ? true : undefined} {...register(`lines.${i}.counted`)} />
                {lineError && <p role="alert" className="text-xs text-destructive">{message(lineError)}</p>}
              </div>
              <p className="text-sm">
                <span className="block text-xs text-muted-foreground">{s.difference}</span>
                <Ltr className={cn("font-semibold tabular-nums", diff !== null && diff < BigInt(0) && "text-destructive", diff !== null && diff > BigInt(0) && "text-success")}>
                  {diff === null ? "—" : `${diff > BigInt(0) ? "+" : ""}${n(diff)}`}
                </Ltr>
              </p>
              <Input aria-label={`${t.documents.notes}: ${name}`} placeholder={t.documents.notes} className="col-span-3 md:col-span-1" {...register(`lines.${i}.notes`)} />
              {snapshot !== undefined && snapshot !== row.onHand && (
                <p className="col-span-full text-xs text-warning">{fill(s.movedSince, { quantity: isolate(n(row.onHand)) })}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
