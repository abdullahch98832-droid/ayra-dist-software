"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createPeriodAction } from "@/features/accounting/actions";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { ActionError } from "@/components/forms/action-error";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

export function AddPeriod({ month: current }: { month: string }) {
  const { t } = useI18n();
  const a = t.accounting;
  const [month, setMonth] = useState(current);
  const [result, setResult] = useState<ActionResult<null> | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      noValidate className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await createPeriodAction(month);
          setResult(res);
          if (res.ok) toast.add({ title: a.periodAdded, type: "success" });
        });
      }}
    >
      <ActionError result={result} />
      <div className="flex flex-wrap items-end gap-3">
        <Field id="period-month" label={a.period} className="w-full sm:w-52"><Input id="period-month" type="month" dir="ltr" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        <Button type="submit" className="h-10" disabled={pending}><Plus aria-hidden />{a.addPeriod}</Button>
      </div>
    </form>
  );
}
