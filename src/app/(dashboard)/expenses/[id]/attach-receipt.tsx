"use client";

import { useState, useTransition } from "react";
import { attachReceiptAction } from "@/features/expenses/actions";
import { useI18n } from "@/i18n/context";
import { useMessage } from "@/components/forms/field";
import { SectionCard } from "@/components/shared/section-card";
import { toast } from "@/components/ui/toast";

export function AttachReceipt({ expenseId }: { expenseId: string }) {
  const { t } = useI18n();
  const x = t.expenses;
  const message = useMessage();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <SectionCard title={x.attach} className="print:hidden">
      <input
        type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label={x.attach} disabled={pending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          startTransition(async () => {
            const body = new FormData();
            body.set("file", file);
            const result = await attachReceiptAction(expenseId, body);
            if (!result.ok) return setError(result.fieldErrors?.file?.[0] ?? result.code);
            toast.add({ title: x.attached, type: "success" });
          });
        }}
        className="w-full max-w-md min-w-0 rounded-lg border border-input bg-card text-sm shadow-xs file:me-3 file:h-10 file:border-0 file:bg-accent file:px-3 file:text-accent-foreground"
      />
      {error ? <p role="alert" className="mt-2 text-sm text-destructive">{message(error)}</p> : <p className="mt-2 text-xs text-muted-foreground">{pending ? x.uploading : x.receiptHint}</p>}
    </SectionCard>
  );
}
