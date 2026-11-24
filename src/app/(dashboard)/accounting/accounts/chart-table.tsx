"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { saveLedgerAccountAction } from "@/features/accounting/actions";
import type { LedgerAccount } from "@/features/accounting/queries";
import { ACCOUNT_TYPES, CASH_SECTIONS, ledgerAccountSchema, type LedgerAccountValues } from "@/features/accounting/schema";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { toPaisa } from "@/lib/utils/money";
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

type Row = LedgerAccount & { balance: number };

export function ChartTable({ accounts, manage }: { accounts: Row[]; manage: boolean }) {
  const { t, locale } = useI18n();
  const a = t.accounting;
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const name = (x: LedgerAccount) => (locale === "ur" ? x.name_ur : x.name_en);
  const parents = new Map(accounts.map((x) => [x.id, x]));
  const columns: DataTableColumn<Row>[] = [
    { id: "code", header: a.code, sortValue: (x) => x.code, cell: (x) => <Ltr className="font-mono text-xs">{x.code}</Ltr> },
    { id: "name", header: a.name, primary: true, sortValue: name, cell: (x) => x.is_postable ? <Link href={`/accounting/ledger?account=${x.id}`} className="font-medium hover:text-primary hover:underline">{name(x)}</Link> : <span className="font-semibold text-navy">{name(x)}</span> },
    { id: "type", header: a.type, sortValue: (x) => x.account_type, cell: (x) => a.types[x.account_type] },
    { id: "group", header: a.group, hideBelow: "lg", cell: (x) => { const p = x.parent_id ? parents.get(x.parent_id) : undefined; return p ? name(p) : "—"; } },
    { id: "balance", header: a.balance, align: "end", sortValue: (x) => toPaisa(x.balance), cell: (x) => (x.is_postable ? <Money amount={toPaisa(x.balance)} locale={locale} /> : "") },
    { id: "status", header: t.common.status, hideBelow: "lg", cell: (x) => <span className="flex flex-wrap gap-1.5">{x.system_key && <StatusBadge tone="blue">{a.system}</StatusBadge>}{!x.is_active && <StatusBadge tone="gray">{a.inactive}</StatusBadge>}</span> },
    ...(manage ? [{ id: "actions", header: "", cell: (x: Row) => <Button variant="ghost" size="icon-sm" aria-label={`${a.editAccount}: ${x.name_en}`} onClick={() => setEditing(x)}><Pencil /></Button> }] : []),
  ];
  return (
    <>
      <DataTable rows={accounts} columns={columns} rowKey={(x) => x.id} caption={a.tabs.accounts} pageSize={100} searchText={(x) => `${x.code} ${x.name_en} ${x.name_ur}`} toolbar={manage && <Button className="sm:ms-auto" onClick={() => setEditing("new")}><Plus aria-hidden />{a.addAccount}</Button>} empty={{ title: a.tabs.accounts }} />
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {editing && <AccountForm key={editing === "new" ? "new" : editing.id} account={editing === "new" ? null : editing} groups={accounts.filter((x) => !x.is_postable)} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AccountForm({ account, groups, onDone }: { account: Row | null; groups: Row[]; onDone: () => void }) {
  const { t, locale } = useI18n();
  const a = t.accounting;
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<null> | null>(null);
  const form = useForm<LedgerAccountValues>({
    resolver: zodResolver(ledgerAccountSchema),
    defaultValues: {
      code: account?.code ?? "", nameEn: account?.name_en ?? "", nameUr: account?.name_ur ?? "", type: account?.account_type ?? "expense", parentId: account?.parent_id ?? "", isGroup: account ? !account.is_postable : false,
      cashFlow: (account?.cash_flow ?? "") as LedgerAccountValues["cashFlow"], isActive: account?.is_active ?? true,
    },
  });
  const { errors } = form.formState;
  const [type, group, active] = useWatch({ control: form.control, name: ["type", "isGroup", "isActive"] });
  // Accounts the documents use keep their type and group flag.
  const fixed = !!account?.system_key;
  const submit = form.handleSubmit((values) => startTransition(async () => {
    const res = await saveLedgerAccountAction(account?.id ?? null, values);
    setResult(res);
    if (!res.ok) return;
    toast.add({ title: a.accountSaved, type: "success" });
    onDone();
  }));
  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <DialogHeader><DialogTitle>{account ? a.editAccount : a.addAccount}</DialogTitle></DialogHeader>
      <ActionError result={result} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="acc-code" label={a.code} required error={errors.code?.message}><Input id="acc-code" dir="ltr" {...form.register("code")} /></Field>
        <Field id="acc-type" label={a.type} required error={errors.type?.message}>
          <NativeSelect id="acc-type" disabled={fixed} {...form.register("type", { onChange: () => form.setValue("parentId", "") })}>{ACCOUNT_TYPES.map((x) => <option key={x} value={x}>{a.types[x]}</option>)}</NativeSelect>
        </Field>
        <Field id="acc-en" label={a.name} required error={errors.nameEn?.message}><Input id="acc-en" dir="ltr" {...form.register("nameEn")} /></Field>
        <Field id="acc-ur" label={a.nameUr} required error={errors.nameUr?.message}><Input id="acc-ur" dir="rtl" lang="ur" {...form.register("nameUr")} /></Field>
        <Field id="acc-parent" label={a.group} optional error={errors.parentId?.message}>
          <NativeSelect id="acc-parent" {...form.register("parentId")}><option value="">{t.documents.none}</option>{groups.filter((g) => g.account_type === type && g.id !== account?.id).map((g) => <option key={g.id} value={g.id}>{g.code} · {locale === "ur" ? g.name_ur : g.name_en}</option>)}</NativeSelect>
        </Field>
        <Field id="acc-cash" label={a.cashFlowSection} optional error={errors.cashFlow?.message}>
          <NativeSelect id="acc-cash" {...form.register("cashFlow")}><option value="">{a.byType}</option>{CASH_SECTIONS.map((x) => <option key={x} value={x}>{a.sections[x]}</option>)}</NativeSelect>
        </Field>
      </div>
      {!fixed && <label className="flex items-center gap-2.5 text-sm"><Checkbox checked={group} onCheckedChange={(v) => form.setValue("isGroup", v === true, { shouldDirty: true })} />{a.isGroup}</label>}
      {account && !fixed && <label className="flex items-center gap-2.5 text-sm"><Checkbox checked={active} onCheckedChange={(v) => form.setValue("isActive", v === true, { shouldDirty: true })} />{a.active}</label>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>{t.common.cancel}</Button>
        <Button type="submit" disabled={pending}>{pending ? t.common.saving : t.common.save}</Button>
      </DialogFooter>
    </form>
  );
}
