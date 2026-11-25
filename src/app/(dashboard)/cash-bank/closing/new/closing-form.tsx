"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { closeDayAction } from "@/features/cash-bank/actions";
import { closingSchema, NOTES, type ClosingValues } from "@/features/cash-bank/schema";
import { useI18n } from "@/i18n/context";
import { formatPaisa, parseRupees, toDbAmount, toPaisa } from "@/lib/utils/money";
import { parseQuantity } from "@/lib/utils/quantity";
import { DocumentForm } from "@/components/documents/document-form";
import { Field } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/forms/money-input";
import { Ltr } from "@/components/shared/bidi";
import { StatusBadge } from "@/components/shared/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

interface Day { opening: string; receipts: string; payments: string; expected: string }
const ZERO = BigInt(0);
const typed = (text: string) => { try { return text.trim() === "" ? null : parseRupees(text); } catch { return null; } };

export function ClosingForm({ day, defaults }: { day: Day; defaults: ClosingValues }) {
  const { t, locale } = useI18n();
  const c = t.cashBank;
  const expected = toPaisa(day.expected);
  const schema = closingSchema.superRefine((v, ctx) => {
    const counted = typed(v.counted);
    if (counted !== null && counted !== expected && v.notes === "") ctx.addIssue({ code: "custom", message: "required", path: ["notes"] });
  });
  return (
    <DocumentForm<ClosingValues> defaults={defaults} resolver={zodResolver(schema)} save={closeDayAction} openPath={() => "/cash-bank/closing"} cancelPath="/cash-bank/closing" submitLabel={c.closeDay} savedMessage={c.dayClosed} confirm={{ title: c.closeTitle, description: c.closeConfirm }}>
      {() => (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border bg-card p-5 shadow-card">
            <dl className="grid gap-2.5 text-sm">
              {([[c.opening, day.opening], [c.receipts, day.receipts], [c.payments, day.payments]] as const).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd><Ltr className="tabular-nums">{formatPaisa(toPaisa(value), locale)}</Ltr></dd></div>
              ))}
              <div className="flex justify-between gap-4 border-t pt-2.5 text-base font-semibold text-navy"><dt>{c.expected}</dt><dd><Ltr className="tabular-nums">{formatPaisa(expected, locale)}</Ltr></dd></div>
            </dl>
          </section>
          <Count expected={expected} />
        </div>
      )}
    </DocumentForm>
  );
}

function Count({ expected }: { expected: bigint }) {
  const { t, locale } = useI18n();
  const c = t.cashBank;
  const { control, register, setValue, getValues, formState: { errors } } = useFormContext<ClosingValues>();
  const [counted, post] = useWatch({ control, name: ["counted", "postDifference"] });
  const amount = typed(counted ?? "");
  const difference = amount === null ? null : amount - expected;
  // The notes and coins add up to the counted amount.
  const addUp = () => {
    const values = getValues("denominations");
    const total = NOTES.reduce((sum, n) => sum + (parseQuantity(values[n]) ?? ZERO) * BigInt(n) * BigInt(100), ZERO);
    setValue("counted", toDbAmount(total), { shouldDirty: true, shouldValidate: true });
  };
  return (
    <div className="grid gap-6">
      <FormSection title={c.counted} className="sm:grid-cols-1">
        <Field id="counted" label={c.counted} required error={errors.counted?.message}><MoneyInput id="counted" {...register("counted")} /></Field>
        {difference !== null && (
          <p className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">{c.difference}</span>
            <span className="flex items-center gap-2"><Ltr className="font-semibold tabular-nums">{formatPaisa(difference, locale)}</Ltr><StatusBadge tone={difference === ZERO ? "green" : "amber"}>{difference === ZERO ? c.exact : difference > ZERO ? c.over : c.short}</StatusBadge></span>
          </p>
        )}
        {difference !== null && difference !== ZERO && (
          <>
            <Field id="notes" label={c.explain} required error={errors.notes?.message}><Input id="notes" {...register("notes")} /></Field>
            <label className="flex items-center gap-2.5 text-sm"><Checkbox checked={post} onCheckedChange={(v) => setValue("postDifference", v === true, { shouldDirty: true })} />{c.postDifference}</label>
          </>
        )}
      </FormSection>
      <FormSection title={c.denominations} description={c.denominationsHint} className="grid-cols-2 sm:grid-cols-5">
        {NOTES.map((n) => (
          <div key={n} className="grid content-start gap-1.5">
            <label htmlFor={`note-${n}`} className="text-xs text-muted-foreground"><Ltr>{n} ×</Ltr></label>
            <Input id={`note-${n}`} dir="ltr" inputMode="numeric" autoComplete="off" className="tabular-nums" aria-invalid={errors.denominations?.[n] ? true : undefined} {...register(`denominations.${n}`, { onChange: addUp, value: "" })} />
          </div>
        ))}
      </FormSection>
    </div>
  );
}
