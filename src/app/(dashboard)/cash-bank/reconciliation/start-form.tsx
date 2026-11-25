"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Scale } from "lucide-react";
import { startReconciliationAction } from "@/features/cash-bank/actions";
import { reconciliationSchema, type ReconciliationValues } from "@/features/cash-bank/schema";
import { useI18n } from "@/i18n/context";
import { fill, isolate } from "@/i18n/format";
import type { ActionResult } from "@/lib/action-result";
import { ActionError } from "@/components/forms/action-error";
import { Field } from "@/components/forms/field";
import { formatDate } from "@/components/shared/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function StartReconciliation({ account, today, after }: { account: { id: string; name: string }; today: string; after: string | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="justify-self-start" onClick={() => setOpen(true)}><Scale aria-hidden />{t.analytics.bank.start}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">{open && <StartForm account={account} today={today} after={after} onClose={() => setOpen(false)} />}</DialogContent>
      </Dialog>
    </>
  );
}

function StartForm({ account, today, after, onClose }: { account: { id: string; name: string }; today: string; after: string | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const b = t.analytics.bank;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<string> | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const form = useForm<ReconciliationValues>({ resolver: zodResolver(reconciliationSchema), defaultValues: { accountId: account.id, date: today, balance: "", requestId } });
  const { errors } = form.formState;
  const submit = form.handleSubmit((values) => startTransition(async () => {
    const res = await startReconciliationAction(values);
    setResult(res);
    if (res.ok && res.data) router.push(`/cash-bank/reconciliation/${res.data}`);
  }));
  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <DialogHeader><DialogTitle>{b.start}: <bdi>{account.name}</bdi></DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">{b.startHint}{after && <> {fill(b.until, { date: isolate(formatDate(after, locale) ?? "") })}</>}</p>
      <ActionError result={result} />
      <Field id="statement-date" label={t.analytics.statementDate} required error={errors.date?.message}><Input id="statement-date" type="date" dir="ltr" max={today} {...form.register("date")} /></Field>
      <Field id="statement-balance" label={t.analytics.statementBalance} hint={b.balanceHint} required error={errors.balance?.message}><Input id="statement-balance" dir="ltr" inputMode="decimal" autoComplete="off" className="tabular-nums" {...form.register("balance")} /></Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>{t.common.cancel}</Button>
        <Button type="submit" disabled={pending}>{pending ? t.common.saving : b.continue}</Button>
      </DialogFooter>
    </form>
  );
}
