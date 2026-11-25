"use client";

import { useFormContext } from "react-hook-form";
import { useI18n } from "@/i18n/context";
import { useMessage } from "@/components/forms/field";
import { Ltr } from "@/components/shared/bidi";
import { formatNumber } from "@/components/shared/format";
import { Input } from "@/components/ui/input";

export interface QuantityLine { id: string; name: string; detail: string | null; unit: string | null; max: string }
interface LinesForm { lines: { itemId: string; quantity: string }[] }

/** One quantity per line of a job or delivery, limited by `max`. Form values are in `lines`. */
export function QuantityLines({ title, hint, lines, maxLabel, inputLabel, children }: {
  title: string;
  hint: string;
  lines: QuantityLine[];
  maxLabel: string;
  inputLabel: string;
  children?: React.ReactNode;
}) {
  const { locale } = useI18n();
  const message = useMessage();
  const { register, formState: { errors } } = useFormContext<LinesForm>();
  return (
    <section className="rounded-2xl border bg-card shadow-card">
      <header className="border-b px-5 py-4">
        <h2 className="text-base font-semibold text-navy">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </header>
      <ul className="divide-y">
        {lines.map((l, i) => {
          const error = errors.lines?.[i]?.quantity?.message;
          return (
            <li key={l.id} className="grid grid-cols-2 gap-3 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_9rem] sm:items-center">
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <p className="text-sm font-medium break-words">{l.name}</p>
                <p className="text-xs text-muted-foreground">{[l.detail, l.unit].filter(Boolean).map((x, n) => <span key={x}>{n > 0 && " · "}<bdi>{x}</bdi></span>)}</p>
              </div>
              <p className="text-sm"><span className="block text-xs text-muted-foreground">{maxLabel}</span><Ltr className="tabular-nums">{formatNumber(Number(l.max), locale)}</Ltr></p>
              <div>
                <label htmlFor={`qty-${l.id}`} className="block text-xs text-muted-foreground">{inputLabel}</label>
                <Input id={`qty-${l.id}`} dir="ltr" inputMode="decimal" autoComplete="off" className="tabular-nums" aria-invalid={error ? true : undefined} {...register(`lines.${i}.quantity`)} />
                {error && <p role="alert" className="text-xs text-destructive">{message(error)}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      {children}
    </section>
  );
}
