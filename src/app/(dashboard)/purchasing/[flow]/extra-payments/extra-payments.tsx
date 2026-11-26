"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, FileText, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { saveExtraAction, voidExtraAction } from "@/features/company-extra/actions";
import type { ExtraPayment } from "@/features/company-extra/queries";
import { documentHref } from "@/features/documents/kinds";
import { EXTRA_KINDS, EXTRA_METHODS, extraSchema, type ExtraValues } from "@/features/company-extra/schema";
import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";
import { toPaisa } from "@/lib/utils/money";
import { ActionButton } from "@/components/documents/action-button";
import { ActionError } from "@/components/forms/action-error";
import { ContributorsField, SingleAccount, SplitOption, type ContributorsForm } from "@/components/forms/contributors-field";
import { Field, NativeSelect } from "@/components/forms/field";
import { MoneyInput } from "@/components/forms/money-input";
import { Ltr, Money } from "@/components/shared/bidi";
import { LinkButton } from "@/components/shared/link-button";
import { formatDate } from "@/components/shared/format";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

interface Account { id: string; name: string; isActive: boolean }

const ZERO = BigInt(0);

/** The company-money entries of a period, each of which can be corrected or voided. */
export function ExtraPayments({ rows, pay, today, accounts }: { rows: ExtraPayment[]; pay: boolean; today: string; accounts: Account[] }) {
  const { t, locale } = useI18n();
  const x = t.supply.extra;
  const [editing, setEditing] = useState<ExtraPayment | "new" | null>(null);
  const kindBadge = (r: ExtraPayment) =>
    r.direction === "in"
      ? <StatusBadge tone="green">{x.in}</StatusBadge>
      : <StatusBadge tone={r.kind === "extra" ? "blue" : "amber"}>{r.kind === "extra" ? x.extraTotal : x.accountTotal}</StatusBadge>;
  const columns: DataTableColumn<ExtraPayment>[] = [
    {
      id: "name", header: x.name, primary: true, sortValue: (r) => r.name, cell: (r) => (
        <span className={cn(r.isVoid && "text-muted-foreground line-through")}>
          <bdi className="font-medium break-words">{r.name}</bdi>
          <Ltr className="block text-xs text-muted-foreground">{r.number}</Ltr>
        </span>
      ),
    },
    { id: "when", header: x.date, sortValue: (r) => r.paidAt, cell: (r) => <bdi className="whitespace-nowrap">{formatDate(r.date, locale)}</bdi> },
    { id: "kind", header: x.kind, hideBelow: "xl", sortValue: (r) => `${r.direction}-${r.kind}`, cell: kindBadge },
    { id: "account", header: t.accounting.account, hideBelow: "lg", sortValue: (r) => r.account, cell: (r) => <span><bdi>{r.contributors.length > 0 ? r.contributors.map((c) => c.name).join(", ") : r.account}</bdi><span className="block text-xs text-muted-foreground">{t.purchasing.methods[r.method]}{r.reference && <> · <bdi>{r.reference}</bdi></>}</span></span> },
    { id: "notes", header: x.notes, hideBelow: "2xl", cell: (r) => <bdi className="text-sm break-words text-muted-foreground">{r.isVoid ? r.voidReason : r.notes || "—"}</bdi> },
    {
      id: "amount", header: x.amount, align: "end", sortValue: (r) => toPaisa(r.amount),
      cell: (r) => r.isVoid
        ? <StatusBadge tone="gray">{x.statusVoid}</StatusBadge>
        : <span className={cn("font-medium whitespace-nowrap", r.direction === "in" && "text-emerald-600 dark:text-emerald-400")}>{r.direction === "in" ? "+" : "−"}<Money amount={toPaisa(r.amount)} locale={locale} /></span>,
      // Net of the period: money in counts up, money out counts down.
      footer: (list) => {
        const net = list.filter((r) => !r.isVoid).reduce((s, r) => s + (r.direction === "in" ? toPaisa(r.amount) : -toPaisa(r.amount)), ZERO);
        return <span className={cn(net < ZERO && "text-muted-foreground")}>{net < ZERO ? "−" : ""}<Money amount={net < ZERO ? -net : net} locale={locale} /></span>;
      },
    },
    {
      id: "actions", header: "", cell: (r: ExtraPayment) => (
        <span className="flex justify-end gap-1">
          <LinkButton variant="ghost" size="icon-sm" aria-label={`${t.docs.pdf}: ${r.number}`} href={documentHref("company_money", { id: r.id })}><FileText /></LinkButton>
          {pay && !r.isVoid && (
            <>
              <Button variant="ghost" size="icon-sm" aria-label={`${x.edit}: ${r.name}`} onClick={() => setEditing(r)}><Pencil /></Button>
              <ActionButton label={x.void} icon={<Ban aria-hidden />} variant="ghost" action={voidExtraAction.bind(null, r.id)} reasonLabel={t.documents.reason} success={x.voided} confirm={{ title: x.voidTitle, description: x.voidHint, tone: "danger" }} />
            </>
          )}
        </span>
      ),
    },
  ];
  const add = pay && <Button onClick={() => setEditing("new")}><Plus aria-hidden />{x.add}</Button>;
  return (
    <>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} caption={x.title} toolbar={add} searchText={(r) => `${r.name} ${r.number} ${r.reference} ${r.notes}`} searchPlaceholder={x.search} empty={{ title: x.empty, description: x.emptyHint }} />
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {editing && <ExtraForm key={editing === "new" ? "new" : editing.id} payment={editing === "new" ? null : editing} today={today} accounts={accounts} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExtraForm({ payment, today, accounts, onDone }: { payment: ExtraPayment | null; today: string; accounts: Account[]; onDone: () => void }) {
  const { t } = useI18n();
  const x = t.supply.extra;
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<string> | null>(null);
  const activeAccounts = accounts.filter((a) => a.isActive);
  const [defaults] = useState<ExtraValues>(() =>
    payment
      ? { name: payment.name, date: payment.date, amount: payment.amount, direction: payment.direction, kind: payment.kind, accountId: payment.accountId, method: payment.method, reference: payment.reference, notes: payment.notes, contributors: payment.contributors.map((c) => ({ accountId: c.accountId || (accounts.find((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase())?.id ?? ""), amount: c.amount })), requestId: crypto.randomUUID() }
      : { name: "", date: today, amount: "", direction: "out", kind: "extra", accountId: activeAccounts[0]?.id ?? "", method: "cash", reference: "", notes: "", contributors: [], requestId: crypto.randomUUID() },
  );
  const form = useForm<ExtraValues>({ resolver: zodResolver(extraSchema), defaultValues: defaults });
  const { errors } = form.formState;
  const isIn = useWatch({ control: form.control, name: "direction" }) === "in";
  const noAccounts = activeAccounts.length === 0 && !payment;
  const choices = accounts.filter((a) => a.isActive || a.id === payment?.accountId || payment?.contributors.some((c) => c.accountId === a.id));
  const split = form as unknown as ContributorsForm;

  const submit = form.handleSubmit((values) => startTransition(async () => {
    const res = await saveExtraAction(payment?.id ?? null, values);
    setResult(res);
    if (!res.ok) return;
    toast.add({ title: x.saved, type: "success" });
    onDone();
  }));

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader><DialogTitle>{payment ? `${x.edit}: ${payment.number}` : x.add}</DialogTitle></DialogHeader>
      <ActionError result={result} />
      <Field id="extra-direction" label={x.direction} required error={errors.direction?.message}>
        <NativeSelect id="extra-direction" {...form.register("direction")}>
          <option value="out">{x.outLabel}</option>
          <option value="in">{x.inLabel}</option>
        </NativeSelect>
      </Field>
      <Field id="extra-name" label={x.name} hint={x.nameHint} required error={errors.name?.message}><Input id="extra-name" {...form.register("name")} /></Field>
      {noAccounts ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {x.noAccountsHint} <Link href="/cash-bank" className="font-medium underline">{x.noAccounts}</Link>
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="extra-date" label={x.date} required error={errors.date?.message}><Input id="extra-date" type="date" dir="ltr" max={today} {...form.register("date")} /></Field>
          <Field id="extra-amount" label={x.amount} required error={errors.amount?.message}><MoneyInput id="extra-amount" {...form.register("amount")} /></Field>
          <SingleAccount form={split}>
            <Field id="extra-account" label={isIn ? x.receivedInto : x.paidFrom} required error={errors.accountId?.message}>
              <NativeSelect id="extra-account" {...form.register("accountId")}><option value="">{t.documents.choose}</option>{choices.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}<SplitOption accounts={choices} /></NativeSelect>
            </Field>
          </SingleAccount>
          <Field id="extra-method" label={x.method} required error={errors.method?.message}>
            <NativeSelect id="extra-method" {...form.register("method")}>{EXTRA_METHODS.map((m) => <option key={m} value={m}>{t.purchasing.methods[m]}</option>)}</NativeSelect>
          </Field>
          <Field id="extra-reference" label={x.reference} optional error={errors.reference?.message}><Input id="extra-reference" {...form.register("reference")} /></Field>
        </div>
      )}
      {!isIn && (
        <Field id="extra-kind" label={x.kind} hint={x.kindHint} required error={errors.kind?.message}>
          <NativeSelect id="extra-kind" {...form.register("kind")}>{EXTRA_KINDS.map((k) => <option key={k} value={k}>{x.kinds[k]}</option>)}</NativeSelect>
        </Field>
      )}
      {!noAccounts && <ContributorsField form={split} accounts={choices.map((a) => ({ id: a.id, label: a.name }))} />}
      <Field id="extra-notes" label={x.notes} optional error={errors.notes?.message}><Textarea id="extra-notes" rows={2} {...form.register("notes")} /></Field>
      {payment && <p className="text-xs text-muted-foreground">{x.editNote}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>{t.common.cancel}</Button>
        <Button type="submit" disabled={pending || noAccounts}>{pending ? t.common.saving : t.common.save}</Button>
      </DialogFooter>
    </form>
  );
}
