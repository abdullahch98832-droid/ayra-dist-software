"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { Field } from "@/components/forms/field";
import { ActionError } from "@/components/forms/action-error";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

/** A button that runs a server action, after confirmation when `confirm` is given. */
export function ActionButton({
  label, icon, variant = "default", action, confirm, reasonLabel, success, redirectTo,
}: {
  label: string;
  icon?: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  action: (reason: string) => Promise<ActionResult<unknown>>;
  confirm?: { title: string; description: string; tone?: "danger" | "default" };
  /** Asks for a reason inside the confirmation; it is required. */
  reasonLabel?: string;
  success: string;
  redirectTo?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<ActionResult<unknown> | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    if (reasonLabel && !reason.trim()) return setMissing(true);
    startTransition(async () => {
      const result = await action(reason);
      setError(result.ok ? null : result);
      if (!result.ok) return;
      setOpen(false);
      toast.add({ title: success, type: "success" });
      if (redirectTo) router.push(redirectTo);
    });
  };

  return (
    <>
      <Button variant={variant} disabled={pending} onClick={() => { setError(null); if (confirm) setOpen(true); else run(); }}>
        {icon}{pending && !confirm ? t.common.processing : label}
      </Button>
      {!confirm && <ActionError result={error} />}
      {confirm && (
        <ConfirmDialog
          open={open} onOpenChange={setOpen} title={confirm.title} description={confirm.description} tone={confirm.tone ?? "default"}
          confirmLabel={label} pending={pending} error={error} onConfirm={run}
        >
          {reasonLabel && (
            <Field id="action-reason" label={reasonLabel} required error={missing && !reason.trim() ? "required" : undefined}>
              <Textarea id="action-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
