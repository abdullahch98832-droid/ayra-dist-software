"use client";

import { useState } from "react";
import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import type { ContributorValues } from "@/features/payments/contributors";
import { useI18n } from "@/i18n/context";
import { toPaisa } from "@/lib/utils/money";
import { MoneyInput } from "@/components/forms/money-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ZERO = BigInt(0);
const paisa = (s: string | undefined) => {
  try {
    return toPaisa(s || "0");
  } catch {
    return ZERO;
  }
};

/** Any form that carries an amount and a contributors list can use this field. */
export type ContributorsForm = UseFormReturn<{ amount: string; contributors: ContributorValues[] }>;

/**
 * An optional "more than one person paid/received" split: who gave how much.
 * Purely a record — the amounts must add up to the total.
 */
export function ContributorsField({ form, className }: { form: ContributorsForm; className?: string }) {
  const { t } = useI18n();
  const s = t.documents.split;
  const amount = useWatch({ control: form.control, name: "amount" }) ?? "";
  const people = useFieldArray({ control: form.control, name: "contributors" });
  const [open, setOpen] = useState(people.fields.length > 0);
  const rows = form.watch("contributors") ?? [];
  const mismatch = open && rows.length > 0 && rows.reduce((sum, c) => sum + paisa(c?.amount), ZERO) !== paisa(amount);

  const toggle = (on: boolean) => {
    setOpen(on);
    if (on && people.fields.length === 0) people.append({ name: "", amount: "" });
    if (!on) form.setValue("contributors", []);
  };

  return (
    <div className={className}>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={open} onCheckedChange={(v) => toggle(v === true)} />
        {s.more}
      </label>
      {open && (
        <fieldset className="mt-2 grid gap-2 rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">{s.hint}</p>
          {people.fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-[minmax(0,1fr)_9rem_auto] items-start gap-2">
              <Input aria-label={s.name} placeholder={s.name} {...form.register(`contributors.${i}.name`)} />
              <MoneyInput aria-label={s.amount} placeholder={s.amount} {...form.register(`contributors.${i}.amount`)} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={s.remove} onClick={() => people.remove(i)}><Trash2 /></Button>
            </div>
          ))}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => people.append({ name: "", amount: "" })}><Plus aria-hidden />{s.add}</Button>
          </div>
          {mismatch && <p role="alert" className="text-xs text-destructive">{s.sum}</p>}
        </fieldset>
      )}
    </div>
  );
}
