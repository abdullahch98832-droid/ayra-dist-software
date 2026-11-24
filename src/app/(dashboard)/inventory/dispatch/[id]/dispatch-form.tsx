"use client";

import { useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { dispatchAction } from "@/features/inventory/actions";
import { dispatchSchema, type DispatchValues } from "@/features/inventory/schema";
import { useI18n } from "@/i18n/context";
import { wholeAbove } from "@/lib/utils/quantity";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect, useMessage } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { Ltr } from "@/components/shared/bidi";
import { formatNumber } from "@/components/shared/format";
import { Input } from "@/components/ui/input";

export interface DispatchLine {
  itemId: string;
  name: string;
  sku: string;
  unit: string;
  ordered: number;
  dispatched: number;
  remaining: number;
}

export function DispatchForm({ defaults, lines, vehicles, drivers }: {
  defaults: DispatchValues;
  /** Same order as defaults.lines; quantities in the unit of the order line. */
  lines: DispatchLine[];
  vehicles: { id: string; label: string }[];
  drivers: { id: string; label: string }[];
}) {
  const { t } = useI18n();
  const s = t.stock;
  const limited = dispatchSchema.superRefine((v, ctx) => {
    v.lines.forEach((l, i) => {
      if (wholeAbove(l.quantity, lines[i]?.remaining ?? 0)) ctx.addIssue({ code: "custom", message: "tooMuch", path: ["lines", i, "quantity"] });
    });
  });
  return (
    <DocumentForm<DispatchValues>
      defaults={defaults}
      resolver={zodResolver(limited)}
      save={dispatchAction}
      openPath={() => "/inventory/dispatch"}
      cancelPath="/inventory/dispatch"
      submitLabel={s.dispatchNow}
      savedMessage={s.dispatchDone}
      confirm={{ title: s.dispatchTitle, description: s.dispatchConfirm }}
    >
      {(form) => {
        const { errors } = form.formState;
        const options = (items: { id: string; label: string }[]) => (
          <>
            <option value="">{t.documents.none}</option>
            {items.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </>
        );
        return (
          <>
            <FormSection title={s.delivery} className="lg:grid-cols-4">
              <Field id="date" label={t.documents.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" {...form.register("date")} /></Field>
              <Field id="vehicleId" label={s.vehicle} optional error={errors.vehicleId?.message}><NativeSelect id="vehicleId" {...form.register("vehicleId")}>{options(vehicles)}</NativeSelect></Field>
              <Field id="driverId" label={s.driver} optional error={errors.driverId?.message}><NativeSelect id="driverId" {...form.register("driverId")}>{options(drivers)}</NativeSelect></Field>
              <Field id="notes" label={t.documents.notes} optional error={errors.notes?.message}><Input id="notes" {...form.register("notes")} /></Field>
            </FormSection>
            <Lines lines={lines} />
          </>
        );
      }}
    </DocumentForm>
  );
}

function Lines({ lines }: { lines: DispatchLine[] }) {
  const { t, locale } = useI18n();
  const s = t.stock;
  const message = useMessage();
  const { register, formState: { errors } } = useFormContext<DispatchValues>();
  const n = (v: number) => formatNumber(v, locale);
  const error = errors.lines?.root?.message ?? (errors.lines as { message?: string } | undefined)?.message;
  return (
    <section className="rounded-xl border bg-card shadow-card">
      <header className="border-b px-5 py-4"><h2 className="text-base font-semibold text-navy">{t.documents.lines}</h2></header>
      {error && <p role="alert" className="px-5 pt-4 text-sm text-destructive">{message(error)}</p>}
      <ul className="divide-y">
        {lines.map((l, i) => {
          const lineError = errors.lines?.[i]?.quantity?.message;
          return (
            <li key={l.itemId} className="grid grid-cols-3 items-center gap-x-4 gap-y-2 px-5 py-3 md:grid-cols-[minmax(0,2fr)_7rem_7rem_7rem_9rem]">
              <div className="col-span-3 min-w-0 md:col-span-1">
                <p className="text-sm font-medium break-words">{l.name}</p>
                <p className="text-xs text-muted-foreground"><Ltr>{l.sku}</Ltr> · {l.unit}</p>
              </div>
              {[[s.ordered, l.ordered], [s.dispatched, l.dispatched], [s.remaining, l.remaining]].map(([label, value]) => (
                <p key={String(label)} className="text-sm"><span className="block text-xs text-muted-foreground">{label}</span><Ltr className="tabular-nums">{n(Number(value))}</Ltr></p>
              ))}
              <div className="col-span-3 md:col-span-1">
                <label htmlFor={`dispatch-${l.itemId}`} className="block text-xs text-muted-foreground">{s.quantityNow}</label>
                <Input id={`dispatch-${l.itemId}`} dir="ltr" inputMode="numeric" autoComplete="off" className="tabular-nums" aria-invalid={lineError ? true : undefined} {...register(`lines.${i}.quantity`)} />
                {lineError && <p role="alert" className="text-xs text-destructive">{message(lineError)}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
