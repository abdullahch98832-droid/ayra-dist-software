"use client";

import { CircleHelp, TriangleAlert } from "lucide-react";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ActionError } from "@/components/forms/action-error";

/**
 * Confirmation for destructive or irreversible actions. Focus starts on cancel,
 * a click outside does not dismiss it, and the server's refusal is shown in place.
 */
export function ConfirmDialog({
  open, onOpenChange, title, description, subject, confirmLabel, cancelLabel, tone = "danger", pending = false, error, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** The record being acted on, shown prominently so the user can check it. */
  subject?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  pending?: boolean;
  error?: ActionResult<unknown> | null;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const Icon = tone === "danger" ? TriangleAlert : CircleHelp;
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <div className="flex gap-4">
          <span className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            tone === "danger" ? "bg-destructive-soft text-destructive" : "bg-accent text-accent-foreground"
          )}>
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="grid min-w-0 gap-1.5">
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {subject && <p className="font-medium break-words">{subject}</p>}
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </div>
        </div>
        <ActionError result={error} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={pending} autoFocus onClick={() => onOpenChange(false)}>{cancelLabel ?? t.common.cancel}</Button>
          <Button variant={tone === "danger" ? "destructive" : "default"} disabled={pending} onClick={onConfirm}>
            {pending ? t.common.processing : confirmLabel}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
