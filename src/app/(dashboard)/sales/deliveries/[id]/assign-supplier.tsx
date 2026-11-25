"use client";

import { useState, useTransition } from "react";
import { UserCheck } from "lucide-react";
import { assignSupplierAction } from "@/features/supply/actions";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { ActionError } from "@/components/forms/action-error";
import { NativeSelect } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** The office may change who takes the goods to the shop while they are on the way. */
export function AssignSupplier({ deliveryId, current, staff }: { deliveryId: string; current: string; staff: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const s = t.supply;
  const [value, setValue] = useState(current);
  const [result, setResult] = useState<ActionResult<null> | null>(null);
  const [pending, startTransition] = useTransition();
  const save = () => startTransition(async () => {
    const res = await assignSupplierAction(deliveryId, value);
    setResult(res);
    if (res.ok) toast.add({ title: s.assigned, type: "success" });
  });
  return (
    <div className="grid gap-3 rounded-2xl border bg-card p-5 shadow-card print:hidden">
      <label htmlFor="assign" className="text-sm font-medium text-navy">{current ? s.assign : s.choose}</label>
      <div className="flex flex-wrap gap-3">
        <NativeSelect id="assign" value={value} onChange={(e) => setValue(e.target.value)} className="w-full sm:w-72"><option value="">{s.none}</option>{staff.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect>
        <Button variant="outline" disabled={pending || value === current} onClick={save}><UserCheck aria-hidden />{pending ? t.common.saving : t.common.save}</Button>
      </div>
      <ActionError result={result} />
    </div>
  );
}
