"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCheck, Save } from "lucide-react";
import { saveReconciliationAction } from "@/features/cash-bank/actions";
import type { BankReconciliation } from "@/features/cash-bank/queries";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";
import { parseRupees, toDbAmount, toPaisa } from "@/lib/utils/money";
import { ActionError } from "@/components/forms/action-error";
import { Field, NativeSelect } from "@/components/forms/field";
import { Ltr, Money } from "@/components/shared/bidi";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatDate } from "@/components/shared/format";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

const ZERO = BigInt(0);
const typed = (text: string) => { try { return parseRupees(text); } catch { return null; } };

/** The movements of a bank account beside its statement. Totals follow the ticks at once; the database calculates them again. */
export function ReconciliationSheet({ reconciliation: r, editable }: { reconciliation: BankReconciliation; editable: boolean }) {
  const { t, locale } = useI18n();
  const a = t.analytics;
  const b = a.bank;
  const initial = useMemo(() => new Set(r.lines.filter((l) => l.cleared).map((l) => l.id)), [r.lines]);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(initial);
  const [balance, setBalance] = useState(r.totals.statement);
  const [notes, setNotes] = useState(r.notes);
  const [openOnly, setOpenOnly] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ActionResult<null> | null>(null);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState({ ticked: initial as ReadonlySet<string>, balance: r.totals.statement, notes: r.notes });
  const dirty = editable && (balance !== saved.balance || notes !== saved.notes || ticked.size !== saved.ticked.size || [...ticked].some((id) => !saved.ticked.has(id)));
  useUnsavedChanges(dirty);

  const open = r.lines.filter((l) => !ticked.has(l.id));
  const inward = open.reduce((sum, l) => { const v = toPaisa(l.amount); return v > ZERO ? sum + v : sum; }, ZERO);
  const outward = open.reduce((sum, l) => { const v = toPaisa(l.amount); return v < ZERO ? sum - v : sum; }, ZERO);
  const statement = typed(balance);
  const adjusted = toPaisa(r.totals.ledger) - inward + outward;
  const difference = statement === null ? null : statement - adjusted;
  const shown = openOnly ? open : r.lines;

  const save = (complete: boolean) => startTransition(async () => {
    const values = { ticked, balance, notes };
    const res = await saveReconciliationAction({ id: r.id, balance: statement === null ? balance : toDbAmount(statement), notes, lines: [...ticked], complete });
    setResult(res);
    if (!res.ok) return;
    setSaved(values);
    setConfirming(false);
    toast.add({ title: complete ? b.completed : b.saved, type: "success" });
  });
  const toggle = (id: string) => setTicked((old) => { const next = new Set(old); if (!next.delete(id)) next.add(id); return next; });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <aside className="grid gap-4 rounded-2xl border bg-card p-5 shadow-card xl:sticky xl:top-24 xl:order-2">
        <dl className="grid gap-2.5 text-sm">
          {([[a.ledgerBalance, toPaisa(r.totals.ledger), ""], [a.unclearedIn, inward, "−"], [a.unclearedOut, outward, "+"]] as const).map(([label, value, sign]) => (
            <div key={label} className="flex items-baseline justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="shrink-0"><Ltr>{sign && `${sign} `}</Ltr><Money amount={value} locale={locale} /></dd></div>
          ))}
          <div className="flex items-baseline justify-between gap-4 border-t pt-2.5 font-semibold text-navy"><dt>{a.adjustedBalance}</dt><dd className="shrink-0"><Money amount={adjusted} locale={locale} /></dd></div>
          {!editable && <div className="flex items-baseline justify-between gap-4"><dt className="text-muted-foreground">{a.statementBalance}</dt><dd className="shrink-0"><Money amount={toPaisa(r.totals.statement)} locale={locale} /></dd></div>}
        </dl>
        {editable && <Field id="balance" label={a.statementBalance} error={statement === null ? "invalidAmount" : undefined}><Input id="balance" dir="ltr" inputMode="decimal" autoComplete="off" className="tabular-nums" value={balance} onChange={(e) => setBalance(e.target.value)} /></Field>}
        <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3", difference === ZERO ? "bg-success-soft" : "bg-warning-soft")} aria-live="polite">
          <span className="text-sm font-medium text-navy">{a.difference}</span>
          <span className="flex items-center gap-2">{difference !== null && <Money amount={difference} locale={locale} className="font-semibold" />}<StatusBadge tone={difference === ZERO ? "green" : "amber"}>{difference === ZERO ? a.agrees : a.differs}</StatusBadge></span>
        </div>
        {editable ? (
          <>
            <Field id="notes" label={t.common.notes}><Input id="notes" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} /></Field>
            <ActionError result={confirming ? null : result} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={pending || statement === null || !dirty} onClick={() => save(false)}><Save aria-hidden />{pending && !confirming ? t.common.saving : b.save}</Button>
              <Button disabled={pending || difference !== ZERO} onClick={() => { setResult(null); setConfirming(true); }}><CheckCheck aria-hidden />{b.complete}</Button>
            </div>
            {difference !== ZERO && <p className="text-xs text-muted-foreground">{b.mustAgree} {b.bookFirst}</p>}
          </>
        ) : r.notes && <p className="text-sm text-muted-foreground"><bdi>{r.notes}</bdi></p>}
        <ConfirmDialog open={confirming} onOpenChange={setConfirming} title={b.completeTitle} description={b.completeHint} tone="default" confirmLabel={b.complete} pending={pending} error={confirming ? result : null} onConfirm={() => save(true)} />
      </aside>
      <section aria-label={b.lines} className="min-w-0 overflow-clip rounded-2xl border bg-card shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0"><h2 className="font-semibold text-navy">{b.lines}</h2>{editable && <p className="text-xs text-muted-foreground">{b.linesHint}</p>}</div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <NativeSelect aria-label={b.show} value={openOnly ? "open" : "all"} onChange={(e) => setOpenOnly(e.target.value === "open")} className="w-40"><option value="all">{b.showAll}</option><option value="open">{b.showOpen}</option></NativeSelect>
            {editable && r.lines.length > 0 && <Button variant="outline" onClick={() => setTicked(open.length ? new Set(r.lines.map((l) => l.id)) : new Set())}>{open.length ? b.tickAll : b.tickNone}</Button>}
          </div>
        </div>
        {shown.length === 0 ? <EmptyState title={r.lines.length === 0 ? b.noLines : a.noUncleared} className="m-4" /> : (
          <ul className="divide-y">
            {shown.map((l) => {
              const on = ticked.has(l.id);
              const kind = (t.accounting.sources as Record<string, string>)[l.type ?? "manual"] ?? l.type;
              const party = l.party ? (locale === "ur" && l.partyUr ? l.partyUr : l.party) : l.description;
              const label = `${l.number ?? l.entry} ${kind}`;
              return (
                <li key={l.id}>
                  <label className={cn("flex items-center gap-4 px-5 py-3 text-sm transition-colors", editable && "cursor-pointer hover:bg-accent/40", on && "bg-success-soft/50")}>
                    {editable ? <Checkbox aria-label={label} checked={on} onCheckedChange={() => toggle(l.id)} /> : <StatusBadge tone={on ? "green" : "amber"}>{on ? b.cleared : a.uncleared}</StatusBadge>}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2"><span className="font-medium"><Ltr>{l.number ?? l.entry}</Ltr></span><span className="text-xs text-muted-foreground">{kind}{l.reversal && ` · ${t.accounting.reversal}`}</span></span>
                      <span className="block text-xs break-words text-muted-foreground"><bdi>{formatDate(l.date, locale)}</bdi>{party && <> · <bdi>{party}</bdi></>}</span>
                    </span>
                    <Money amount={toPaisa(l.amount)} locale={locale} className="shrink-0 font-medium" />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
