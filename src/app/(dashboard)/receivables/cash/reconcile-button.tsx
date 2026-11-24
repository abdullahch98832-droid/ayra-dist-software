"use client";

import { useState, useTransition } from "react";
import { Scale } from "lucide-react";
import { reconcileAction } from "@/features/receivables/actions";
import { useI18n } from "@/i18n/context";
import { fill, isolate } from "@/i18n/format";
import type { ActionResult } from "@/lib/action-result";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { Field } from "@/components/forms/field";
import { MoneyInput } from "@/components/forms/money-input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

export function ReconcileButton({ employeeId, name, held }: { employeeId: string; name: string; held: number }) {
  const { t, locale } = useI18n();
  const r = t.receivables;
  const [open, setOpen] = useState(false);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<ActionResult<string> | null>(null);
  const [pending, startTransition] = useTransition();
  const invalid = result && !result.ok && result.code === "validation" ? result.fieldErrors?.counted?.[0] : undefined;

  const run = () => startTransition(async () => {
    const res = await reconcileAction({ employeeId, counted, notes });
    setResult(res);
    if (!res.ok) return;
    setOpen(false);
    setCounted("");
    setNotes("");
    toast.add({ title: r.reconciled, type: "success" });
  });

  return (
    <>
      <Button variant="outline" onClick={() => { setResult(null); setOpen(true); }}><Scale aria-hidden />{r.reconcile}: {name}</Button>
      <ConfirmDialog
        open={open} onOpenChange={setOpen} tone="default" title={fill(r.reconcileTitle, { name })} description={fill(r.reconcileHint, { amount: isolate(formatPaisa(toPaisa(held), locale)) })}
        confirmLabel={r.reconcile} pending={pending} error={result} onConfirm={run}
      >
        <Field id={`counted-${employeeId}`} label={r.counted} required error={invalid}><MoneyInput id={`counted-${employeeId}`} value={counted} onChange={(e) => setCounted(e.target.value)} /></Field>
        <Field id={`count-notes-${employeeId}`} label={t.documents.notes} optional><Input id={`count-notes-${employeeId}`} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </ConfirmDialog>
    </>
  );
}
