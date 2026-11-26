"use client";

import { useEffect } from "react";
import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { contributorsProblem, type ContributorValues } from "@/features/payments/contributors";
import { useI18n } from "@/i18n/context";
import { fill, isolate } from "@/i18n/format";
import { formatPaisa, sumPaisa, toPaisa } from "@/lib/utils/money";
import { NativeSelect } from "@/components/forms/field";
import { MoneyInput } from "@/components/forms/money-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

/** Any form with an amount, the one account it is paid from or into, and a list of people. */
export type ContributorsForm = UseFormReturn<{ amount: string; accountId: string; contributors: ContributorValues[] }>;
export interface PersonAccount { id: string; label: string }
/** The form field that holds the one account; customer payments call it the destination. */
type AccountField = "accountId" | "destination";

/** Up to this many accounts, ticking the box lists every one of them, ready for their amounts. */
const LIST_ALL = 4;
/** The choice in an account list that means "more than one person": it opens the list of people. */
export const SPLIT = "people";

/**
 * "Paid or received by more than one person": each person is a cash or bank account and gets their own share,
 * so every account's balance is right. Without it, the form's single account takes the whole amount.
 */
export function ContributorsField({ form, accounts, account = "accountId", className }: { form: ContributorsForm; accounts: PersonAccount[]; account?: AccountField; className?: string }) {
  const { t, locale } = useI18n();
  const s = t.documents.split;
  const people = useFieldArray({ control: form.control, name: "contributors" });
  const rows = useWatch({ control: form.control, name: "contributors" }) ?? [];
  const amount = useWatch({ control: form.control, name: "amount" });
  const chosen = useWatch({ control: form.control, name: account as "accountId" });
  const open = rows.length > 0;
  const first = rows[0]?.accountId ?? "";
  const problem = open ? contributorsProblem(rows, amount) : null;
  const { replace } = people;

  // The entry's own account is the first person's; the database keeps them the same.
  useEffect(() => {
    if (open && first) form.setValue(account as "accountId", first, { shouldValidate: form.formState.isSubmitted });
  }, [open, first, form, account]);

  // "Both" chosen in the account list: list the people, ready for their amounts.
  useEffect(() => {
    if (chosen !== SPLIT) return;
    form.setValue(account as "accountId", accounts[0]?.id ?? "");
    const start = accounts.length <= LIST_ALL ? accounts : accounts.slice(0, 2);
    replace(start.length >= 2 ? start.map((a) => ({ accountId: a.id, amount: "" })) : [{ accountId: "", amount: "" }, { accountId: "", amount: "" }]);
  }, [chosen, account, accounts, form, replace]);

  // "The shares add up to Rs 50,000 but the total is Rs 55,000: Rs 5,000 still to share."
  const sumNote = () => {
    const paisa = (v: string | undefined) => { try { return toPaisa(v || "0"); } catch { return BigInt(0); } };
    const shares = sumPaisa(rows.map((r) => paisa(r?.amount)));
    const total = paisa(amount);
    const money = (v: bigint) => isolate(formatPaisa(v, locale));
    return fill(shares < total ? s.sumShort : s.sumOver, { shares: money(shares), total: money(total), diff: money(shares < total ? total - shares : shares - total) });
  };

  const toggle = (on: boolean) => {
    if (on) form.setValue(account as "accountId", SPLIT);
    else replace([]);
  };

  return (
    <div className={className}>
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox checked={open} onCheckedChange={(v) => toggle(v === true)} />
        {s.more}
      </label>
      {open && (
        <fieldset className="mt-2 grid gap-2 rounded-xl border p-4">
          <legend className="sr-only">{s.paidBy}</legend>
          <p className="text-xs text-muted-foreground">{s.hint}</p>
          {people.fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-[minmax(0,1fr)_10rem_auto] items-start gap-2">
              <NativeSelect aria-label={s.name} {...form.register(`contributors.${i}.accountId`)}>
                <option value="">{t.documents.choose}</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </NativeSelect>
              <MoneyInput aria-label={s.amount} placeholder={s.amount} {...form.register(`contributors.${i}.amount`)} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={s.remove} onClick={() => people.remove(i)}><Trash2 /></Button>
            </div>
          ))}
          {people.fields.length < accounts.length && (
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => people.append({ accountId: "", amount: "" })}><Plus aria-hidden />{s.add}</Button>
            </div>
          )}
          {problem && <p role="alert" className="text-xs text-destructive">{problem === "contributorsSum" ? sumNote() : s[problem]}</p>}
        </fieldset>
      )}
    </div>
  );
}

/** The account-list choice for more than one person: "Both (A + B)" when there are two accounts. */
export function SplitOption({ accounts }: { accounts: { label?: string; name?: string }[] }) {
  const { t } = useI18n();
  if (accounts.length < 2) return null;
  const names = accounts.map((a) => a.label ?? a.name ?? "");
  return <option value={SPLIT}>{names.length === 2 ? fill(t.documents.split.both, { a: names[0]!, b: names[1]! }) : t.documents.split.several}</option>;
}

/** The single account field, shown only while one account pays or receives everything. */
export function SingleAccount({ form, children }: { form: ContributorsForm; children: React.ReactNode }) {
  const rows = useWatch({ control: form.control, name: "contributors" }) ?? [];
  return rows.length > 0 ? null : children;
}
