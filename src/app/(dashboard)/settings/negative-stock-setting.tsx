"use client";

import { useState, useTransition } from "react";
import { setNegativeStockAction } from "@/features/settings/actions";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { ActionError } from "@/components/forms/action-error";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export function NegativeStockSetting({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const s = t.settings;
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (value: boolean) => startTransition(async () => {
    const res = await setNegativeStockAction(value);
    setResult(res);
    if (!res.ok) return;
    setAsking(false);
    toast.add({ title: s.saved, type: "success" });
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">{s.negativeStock}<StatusBadge tone={enabled ? "amber" : "gray"}>{enabled ? s.enabled : s.disabled}</StatusBadge></p>
          <p className="mt-1 text-sm text-muted-foreground">{s.negativeStockHint}</p>
        </div>
        <Button variant="outline" disabled={pending} onClick={() => { setResult(null); if (enabled) save(false); else setAsking(true); }}>
          {pending && !asking ? t.common.saving : enabled ? s.turnOff : s.turnOnLabel}
        </Button>
      </div>
      {!asking && <ActionError result={result} />}
      <ConfirmDialog open={asking} onOpenChange={setAsking} title={s.turnOnTitle} description={s.turnOn} confirmLabel={s.turnOnLabel} pending={pending} error={result} onConfirm={() => save(true)} />
    </div>
  );
}
