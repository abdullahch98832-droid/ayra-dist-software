"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { postJournalAction } from "@/features/accounting/actions";
import { journalSchema, paisaOf, type JournalValues } from "@/features/accounting/schema";
import { useI18n } from "@/i18n/context";
import { fill, isolate } from "@/i18n/format";
import { formatPaisa } from "@/lib/utils/money";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect, useMessage } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { Ltr } from "@/components/shared/bidi";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Account { id: string; code: string; nameEn: string; nameUr: string; party: "customer" | "supplier" | null }
interface Party { id: string; nameEn: string; nameUr: string | null }
const ZERO = BigInt(0);

export function JournalForm({ defaults, accounts, customers, suppliers }: { defaults: JournalValues; accounts: Account[]; customers: Party[]; suppliers: Party[] }) {
  const { t } = useI18n();
  const a = t.accounting;
  const kinds = new Map(accounts.map((x) => [x.id, x.party]));
  const schema = journalSchema.superRefine((v, ctx) => {
    if (v.date > defaults.date) ctx.addIssue({ code: "custom", message: "futureDate", path: ["date"] });
    v.lines.forEach((l, i) => {
      const kind = kinds.get(l.accountId);
      if ((kind === "customer" && l.customerId === "") || (kind === "supplier" && l.supplierId === "")) ctx.addIssue({ code: "custom", message: "partyRequired", path: ["lines", i, "accountId"] });
    });
  });
  return (
    <DocumentForm<JournalValues> defaults={defaults} resolver={zodResolver(schema)} save={postJournalAction} openPath={(id) => `/accounting/journal/${id}`} cancelPath="/accounting/journal" submitLabel={a.newJournal} savedMessage={a.journalSaved} confirm={{ title: a.journalTitle, description: a.journalConfirm }}>
      {(form) => {
        const { errors } = form.formState;
        return (
          <>
            <FormSection title={a.entry} className="lg:grid-cols-3">
              <Field id="date" label={a.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" max={defaults.date} {...form.register("date")} /></Field>
              <Field id="description" label={a.description} required className="lg:col-span-2" error={errors.description?.message}><Input id="description" {...form.register("description")} /></Field>
            </FormSection>
            <Lines accounts={accounts} customers={customers} suppliers={suppliers} />
          </>
        );
      }}
    </DocumentForm>
  );
}

function Lines({ accounts, customers, suppliers }: { accounts: Account[]; customers: Party[]; suppliers: Party[] }) {
  const { t, locale } = useI18n();
  const a = t.accounting;
  const message = useMessage();
  const { control, register, setValue, formState: { errors } } = useFormContext<JournalValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "lines", keyName: "key" });
  const lines = useWatch({ control, name: "lines" }) ?? [];
  const local = (x: { nameEn: string; nameUr: string | null }) => (locale === "ur" && x.nameUr ? x.nameUr : x.nameEn);
  const debit = lines.reduce((s, l) => s + paisaOf(l.debit), ZERO);
  const credit = lines.reduce((s, l) => s + paisaOf(l.credit), ZERO);
  const gap = debit > credit ? debit - credit : credit - debit;
  const general = errors.lines?.root?.message ?? (typeof errors.lines?.message === "string" ? errors.lines.message : undefined);
  return (
    <section className="rounded-xl border bg-card shadow-card">
      <header className="flex items-center justify-between gap-3 border-b px-5 py-4"><h2 className="text-base font-semibold text-navy">{t.documents.lines}</h2><Button type="button" variant="outline" onClick={() => append({ accountId: "", customerId: "", supplierId: "", debit: "", credit: "" }, { shouldFocus: false })}><Plus aria-hidden />{a.addLine}</Button></header>
      {general && <p role="alert" className="px-5 pt-4 text-sm text-destructive">{message(general)}</p>}
      <ol className="divide-y">
        {fields.map((field, i) => {
          const line = lines[i] ?? field;
          const kind = accounts.find((x) => x.id === line.accountId)?.party ?? null;
          const error = errors.lines?.[i];
          return (
            <li key={field.key} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_9rem_9rem_auto] lg:items-start">
              <div className="grid content-start gap-1.5">
                <label htmlFor={`${field.key}-account`} className="text-xs text-muted-foreground">{a.account}</label>
                <NativeSelect id={`${field.key}-account`} aria-invalid={error?.accountId ? true : undefined} {...register(`lines.${i}.accountId`, { onChange: () => { setValue(`lines.${i}.customerId`, ""); setValue(`lines.${i}.supplierId`, ""); } })}>
                  <option value="">{t.documents.choose}</option>
                  {accounts.map((x) => <option key={x.id} value={x.id}>{x.code} · {local(x)}</option>)}
                </NativeSelect>
                {error?.accountId && <p role="alert" className="text-xs text-destructive">{message(error.accountId.message)}</p>}
              </div>
              <div className="grid content-start gap-1.5">
                {kind && (
                  <>
                    <label htmlFor={`${field.key}-party`} className="text-xs text-muted-foreground">{kind === "customer" ? a.customer : a.supplier}</label>
                    <NativeSelect id={`${field.key}-party`} {...register(`lines.${i}.${kind === "customer" ? "customerId" : "supplierId"}`)}><option value="">{t.documents.choose}</option>{(kind === "customer" ? customers : suppliers).map((x) => <option key={x.id} value={x.id}>{local(x)}</option>)}</NativeSelect>
                  </>
                )}
              </div>
              {(["debit", "credit"] as const).map((key) => (
                <div key={key} className="grid content-start gap-1.5">
                  <label htmlFor={`${field.key}-${key}`} className="text-xs text-muted-foreground">{a[key]}</label>
                  <Input id={`${field.key}-${key}`} dir="ltr" inputMode="decimal" autoComplete="off" className="tabular-nums" aria-invalid={error?.[key] ? true : undefined} {...register(`lines.${i}.${key}`)} />
                  {error?.[key] && <p role="alert" className="text-xs text-destructive">{message(error[key].message)}</p>}
                </div>
              ))}
              <Button type="button" variant="ghost" size="icon" disabled={fields.length <= 2} className="text-muted-foreground hover:text-destructive lg:mt-6" aria-label={a.removeLine} onClick={() => remove(i)}><Trash2 /></Button>
            </li>
          );
        })}
      </ol>
      <footer className="grid gap-2 border-t bg-muted/50 px-5 py-4 text-sm">
        <p className="flex justify-between gap-4"><span className="text-muted-foreground">{a.debit}</span><Ltr className="font-semibold tabular-nums">{formatPaisa(debit, locale)}</Ltr></p>
        <p className="flex justify-between gap-4"><span className="text-muted-foreground">{a.credit}</span><Ltr className="font-semibold tabular-nums">{formatPaisa(credit, locale)}</Ltr></p>
        <p>{gap === ZERO ? debit > ZERO && <StatusBadge tone="green">{a.balanced}</StatusBadge> : <StatusBadge tone="amber">{fill(a.outOfBalance, { amount: isolate(formatPaisa(gap, locale)) })}</StatusBadge>}</p>
      </footer>
    </section>
  );
}
