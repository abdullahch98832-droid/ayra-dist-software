"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { recordOpeningAction, saveAccountAction, voidOpeningAction } from "@/features/cash-bank/actions";
import type { Account } from "@/features/cash-bank/queries";
import { ACCOUNT_TYPES, accountSchema, openingSchema, type AccountValues, type OpeningValues } from "@/features/cash-bank/schema";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { toPaisa } from "@/lib/utils/money";
import { ActionButton } from "@/components/documents/action-button";
import { ActionError } from "@/components/forms/action-error";
import { Field, NativeSelect } from "@/components/forms/field";
import { Ltr, Money } from "@/components/shared/bidi";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

interface Opening { id: string; amount: string; date: string }

export function AccountsTable({ accounts, manage, openings, today }: { accounts: Account[]; manage: boolean; openings: Record<string, Opening>; today: string }) {
  const { t, locale } = useI18n();
  const c = t.cashBank;
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [opening, setOpening] = useState<Account | null>(null);
  const columns: DataTableColumn<Account>[] = [
    { id: "name", header: c.name, primary: true, sortValue: (a) => a.name, cell: (a) => <span><span className="font-medium">{a.name}</span>{a.bankName && <span className="block text-xs text-muted-foreground">{a.bankName}</span>}</span> },
    { id: "type", header: c.type, sortValue: (a) => a.type, cell: (a) => c.types[a.type] },
    { id: "number", header: c.accountNumber, hideBelow: "lg", cell: (a) => (a.accountNumber ?? a.iban ? <Ltr>{a.accountNumber ?? a.iban}</Ltr> : "—") },
    {
      id: "opening", header: c.opening, align: "end", hideBelow: "lg",
      cell: (a) => {
        const o = openings[a.id];
        if (o) return <Money amount={toPaisa(o.amount)} locale={locale} />;
        return manage && a.isActive ? <Button variant="outline" size="sm" onClick={() => setOpening(a)}>{c.setOpening}</Button> : "—";
      },
    },
    { id: "balance", header: c.closing, align: "end", sortValue: (a) => toPaisa(a.balance), cell: (a) => <Money amount={toPaisa(a.balance)} locale={locale} /> },
    { id: "status", header: t.common.status, cell: (a) => <StatusBadge tone={a.isActive ? "green" : "gray"}>{a.isActive ? c.active : c.inactive}</StatusBadge> },
    ...(manage ? [{ id: "actions", header: "", cell: (a: Account) => <Button variant="ghost" size="icon-sm" aria-label={`${c.edit}: ${a.name}`} onClick={() => setEditing(a)}><Pencil /></Button> }] : []),
  ];
  const add = manage && <Button onClick={() => setEditing("new")}><Plus aria-hidden />{c.add}</Button>;
  return (
    <>
      <DataTable rows={accounts} columns={columns} rowKey={(a) => a.id} caption={c.title} toolbar={accounts.length > 0 && add} empty={{ title: c.empty, description: c.emptyHint, action: add }} />
      <Dialog open={opening !== null} onOpenChange={(o) => !o && setOpening(null)}>
        <DialogContent className="sm:max-w-sm">{opening && <OpeningForm key={opening.id} account={opening} today={today} onDone={() => setOpening(null)} />}</DialogContent>
      </Dialog>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {editing && <AccountForm key={editing === "new" ? "new" : editing.id} account={editing === "new" ? null : editing} opening={editing === "new" ? undefined : openings[editing.id]} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function OpeningForm({ account, today, onDone }: { account: Account; today: string; onDone: () => void }) {
  const { t } = useI18n();
  const c = t.cashBank;
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<string> | null>(null);
  const form = useForm<OpeningValues>({ resolver: zodResolver(openingSchema), defaultValues: { accountId: account.id, date: today, amount: "" } });
  const { errors } = form.formState;
  const submit = form.handleSubmit((values) => startTransition(async () => {
    const res = await recordOpeningAction(values);
    setResult(res);
    if (!res.ok) return;
    toast.add({ title: c.openingSaved, type: "success" });
    onDone();
  }));
  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <DialogHeader><DialogTitle>{c.setOpening}: {account.name}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">{c.openingHint}</p>
      <ActionError result={result} />
      <Field id="opening-amount" label={c.amount} required error={errors.amount?.message}><Input id="opening-amount" dir="ltr" inputMode="decimal" autoComplete="off" className="tabular-nums" {...form.register("amount")} /></Field>
      <Field id="opening-date" label={c.openingDate} required error={errors.date?.message}><Input id="opening-date" type="date" dir="ltr" max={today} {...form.register("date")} /></Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>{t.common.cancel}</Button>
        <Button type="submit" disabled={pending}>{pending ? t.common.saving : t.common.save}</Button>
      </DialogFooter>
    </form>
  );
}

function AccountForm({ account, opening, onDone }: { account: Account | null; opening?: Opening; onDone: () => void }) {
  const { t } = useI18n();
  const c = t.cashBank;
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<string> | null>(null);
  const form = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: account?.name ?? "", type: account?.type ?? "cash", bankName: account?.bankName ?? "", accountTitle: account?.accountTitle ?? "", accountNumber: account?.accountNumber ?? "", iban: account?.iban ?? "",
      branch: account?.branch ?? "", notes: account?.notes ?? "", isActive: account?.isActive ?? true,
    },
  });
  const { errors } = form.formState;
  const [type, active] = useWatch({ control: form.control, name: ["type", "isActive"] });
  const submit = form.handleSubmit((values) => startTransition(async () => {
    const res = await saveAccountAction(account?.id ?? null, values);
    setResult(res);
    if (!res.ok) return;
    toast.add({ title: c.saved, type: "success" });
    onDone();
  }));
  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <DialogHeader><DialogTitle>{account ? c.edit : c.add}</DialogTitle></DialogHeader>
      <ActionError result={result} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="account-name" label={c.name} required error={errors.name?.message}><Input id="account-name" {...form.register("name")} /></Field>
        <Field id="account-type" label={c.type} required error={errors.type?.message}>
          {/* The type decides the ledger account, so it is fixed once created. */}
          {account ? <p className="flex min-h-10 items-center text-sm">{c.types[account.type]}</p> : <NativeSelect id="account-type" {...form.register("type")}>{ACCOUNT_TYPES.map((x) => <option key={x} value={x}>{c.types[x]}</option>)}</NativeSelect>}
        </Field>
        {type === "bank" && (
          <>
            <Field id="bank-name" label={c.bankName} required error={errors.bankName?.message}><Input id="bank-name" {...form.register("bankName")} /></Field>
            <Field id="account-title" label={c.accountTitle} optional error={errors.accountTitle?.message}><Input id="account-title" {...form.register("accountTitle")} /></Field>
            <Field id="account-number" label={c.accountNumber} optional error={errors.accountNumber?.message}><Input id="account-number" dir="ltr" autoComplete="off" {...form.register("accountNumber")} /></Field>
            <Field id="iban" label={c.iban} optional error={errors.iban?.message}><Input id="iban" dir="ltr" autoComplete="off" {...form.register("iban")} /></Field>
            <Field id="branch" label={c.branch} optional error={errors.branch?.message}><Input id="branch" {...form.register("branch")} /></Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">{c.confidential}</p>
          </>
        )}
        <Field id="account-notes" label={c.notes} optional className="sm:col-span-2" error={errors.notes?.message}><Input id="account-notes" {...form.register("notes")} /></Field>
      </div>
      {opening && <ActionButton label={c.voidOpening} variant="outline" action={voidOpeningAction.bind(null, opening.id)} reasonLabel={t.documents.reason} success={c.openingVoided} confirm={{ title: c.voidOpeningTitle, description: c.voidOpeningHint, tone: "danger" }} />}
      {account && <label className="flex items-center gap-2.5 text-sm"><Checkbox checked={active} onCheckedChange={(v) => form.setValue("isActive", v === true, { shouldDirty: true })} />{c.active}</label>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>{t.common.cancel}</Button>
        <Button type="submit" disabled={pending}>{pending ? t.common.saving : t.common.save}</Button>
      </DialogFooter>
    </form>
  );
}
