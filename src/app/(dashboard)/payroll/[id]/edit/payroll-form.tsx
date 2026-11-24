"use client";

import { useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { savePayrollAction } from "@/features/payroll/actions";
import { payrollSchema, type PayrollValues } from "@/features/payroll/schema";
import { useI18n } from "@/i18n/context";
import { fill, isolate } from "@/i18n/format";
import { formatPaisa, parseRupees, toPaisa, type Paisa } from "@/lib/utils/money";
import { decimalAbove } from "@/lib/utils/quantity";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect, useMessage } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { Ltr } from "@/components/shared/bidi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Person { id: string; code: string; nameEn: string; nameUr: string | null; salary: string; advance: string }
type Line = PayrollValues["lines"][number];
const ZERO = BigInt(0);
const paisa = (text: string): Paisa => { try { return text.trim() === "" ? ZERO : parseRupees(text); } catch { return ZERO; } };
const net = (l: Line) => paisa(l.basic) + paisa(l.allowances) + paisa(l.bonus) - paisa(l.deductions) - paisa(l.recovery);

export function PayrollForm({ runId, employees, defaults }: { runId: string; employees: Person[]; defaults: PayrollValues }) {
  const { t } = useI18n();
  const p = t.payroll;
  const people = new Map(employees.map((e) => [e.id, e]));
  const schema = payrollSchema.superRefine((v, ctx) => {
    v.lines.forEach((l, i) => {
      if (decimalAbove(l.recovery, people.get(l.employeeId)?.advance ?? "0")) ctx.addIssue({ code: "custom", message: "moreThanBalance", path: ["lines", i, "recovery"] });
      if (net(l) < ZERO) ctx.addIssue({ code: "custom", message: "discountTooHigh", path: ["lines", i, "deductions"] });
    });
  });
  return (
    <DocumentForm<PayrollValues> defaults={defaults} resolver={zodResolver(schema)} save={savePayrollAction.bind(null, runId)} openPath={(id) => `/payroll/${id}`} cancelPath={`/payroll/${runId}`} submitLabel={p.save} savedMessage={p.saved}>
      {(form) => (
        <>
          <Lines employees={employees} />
          <FormSection title={t.documents.notes} className="sm:grid-cols-1">
            <Field id="notes" label={t.documents.notes} optional error={form.formState.errors.notes?.message}><Textarea id="notes" rows={2} {...form.register("notes")} /></Field>
          </FormSection>
        </>
      )}
    </DocumentForm>
  );
}

function Lines({ employees }: { employees: Person[] }) {
  const { t, locale } = useI18n();
  const p = t.payroll;
  const message = useMessage();
  const { control, register, formState: { errors } } = useFormContext<PayrollValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "lines", keyName: "key" });
  const lines = useWatch({ control, name: "lines" }) ?? [];
  const [chosen, setChosen] = useState("");
  const people = new Map(employees.map((e) => [e.id, e]));
  const name = (e: Person | undefined) => (e ? (locale === "ur" && e.nameUr ? e.nameUr : e.nameEn) : "—");
  const free = employees.filter((e) => !lines.some((l) => l.employeeId === e.id));
  const add = () => {
    const e = people.get(chosen);
    if (e) append({ employeeId: e.id, basic: e.salary, allowances: "", bonus: "", deductions: "", recovery: "", notes: "" }, { shouldFocus: false });
    setChosen("");
  };
  return (
    <section className="rounded-xl border bg-card shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <h2 className="text-base font-semibold text-navy">{p.employees}</h2>
        {free.length > 0 && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <NativeSelect aria-label={p.employee} className="min-w-0 flex-1 sm:w-56" value={chosen} onChange={(e) => setChosen(e.target.value)}><option value="">{t.documents.choose}</option>{free.map((e) => <option key={e.id} value={e.id}>{name(e)} ({e.code})</option>)}</NativeSelect>
            <Button type="button" variant="outline" className="h-10" disabled={!chosen} onClick={add}><Plus aria-hidden />{p.addEmployee}</Button>
          </div>
        )}
      </header>
      <ol className="divide-y">
        {fields.map((field, i) => {
          const line = lines[i] ?? field;
          const e = people.get(line.employeeId);
          const error = errors.lines?.[i];
          return (
            <li key={field.key} className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,4fr)_auto] xl:items-start">
              <div className="min-w-0"><p className="text-sm font-medium break-words">{name(e)}</p><Ltr className="text-xs text-muted-foreground">{e?.code}</Ltr>
                {e && toPaisa(e.advance) > ZERO && <p className="text-xs text-warning">{fill(p.advanceOpenHint, { amount: isolate(formatPaisa(toPaisa(e.advance), locale)) })}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {([["basic", p.basic], ["allowances", p.allowances], ["bonus", p.bonus], ["deductions", p.deductions], ["recovery", p.recovery]] as const).map(([key, label]) => (
                  <div key={key} className="grid content-start gap-1.5">
                    <label htmlFor={`${field.key}-${key}`} className="text-xs text-muted-foreground">{label}</label>
                    <Input id={`${field.key}-${key}`} dir="ltr" inputMode="decimal" autoComplete="off" className="tabular-nums" aria-invalid={error?.[key] ? true : undefined} {...register(`lines.${i}.${key}`)} />
                    {error?.[key] && <p role="alert" className="text-xs text-destructive">{message(error[key].message)}</p>}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 xl:flex-col xl:items-end">
                <p className="text-sm"><span className="block text-xs text-muted-foreground xl:text-end">{p.net}</span><Ltr className="font-semibold tabular-nums">{formatPaisa(net(line), locale)}</Ltr></p>
                <Button type="button" variant="ghost" size="icon" className="ms-auto text-muted-foreground hover:text-destructive" aria-label={`${p.removeEmployee}: ${e?.nameEn ?? ""}`} onClick={() => remove(i)}><Trash2 /></Button>
              </div>
            </li>
          );
        })}
      </ol>
      {fields.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">{p.none}</p>}
      <footer className="flex items-center justify-between gap-4 border-t bg-muted/50 px-5 py-4"><span className="text-sm text-muted-foreground">{p.totalNet}</span><Ltr className="text-lg font-semibold text-navy tabular-nums">{formatPaisa(lines.reduce((s, l) => s + net(l), ZERO), locale)}</Ltr></footer>
    </section>
  );
}
