"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { preparePayrollAction } from "@/features/payroll/actions";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { ActionError } from "@/components/forms/action-error";
import { Field, FormAlert } from "@/components/forms/field";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

export function PreparePayroll({ month: current, ready }: { month: string; ready: boolean }) {
  const { t } = useI18n();
  const p = t.payroll;
  const router = useRouter();
  const [month, setMonth] = useState(current);
  const [result, setResult] = useState<ActionResult<string> | null>(null);
  const [pending, startTransition] = useTransition();
  if (!ready) return <FormAlert tone="info">{p.none}</FormAlert>;
  return (
    <SectionCard title={p.prepare} description={p.prepareHint}>
      <form
        noValidate className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await preparePayrollAction({ month });
            setResult(res);
            if (!res.ok || !res.data) return;
            toast.add({ title: p.prepared, type: "success" });
            router.push(`/payroll/${res.data}/edit`);
          });
        }}
      >
        <ActionError result={result} />
        <div className="flex flex-wrap items-end gap-3">
          <Field id="month" label={p.month} className="w-full sm:w-52" error={result && !result.ok ? result.fieldErrors?.month?.[0] : undefined}><Input id="month" type="month" dir="ltr" max={current} value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
          <Button type="submit" size="lg" className="h-10" disabled={pending}>{pending ? t.common.processing : p.prepare}</Button>
        </div>
      </form>
    </SectionCard>
  );
}
