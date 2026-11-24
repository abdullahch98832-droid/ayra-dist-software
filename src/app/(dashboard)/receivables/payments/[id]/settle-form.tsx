"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { settleInvoicesAction } from "@/features/receivables/actions";
import type { OpenInvoice } from "@/features/receivables/schema";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { toPaisa } from "@/lib/utils/money";
import { allocationIssues, InvoiceAllocations, type AllocationValues } from "@/components/documents/invoice-allocations";
import { ActionError } from "@/components/forms/action-error";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** Uses what is still on account of a posted payment. */
export function SettleForm({ paymentId, invoices, available }: { paymentId: string; invoices: OpenInvoice[]; available: string }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<null> | null>(null);
  const form = useForm<AllocationValues>({ defaultValues: { allocations: invoices.map((i) => ({ invoiceId: i.id, amount: "" })) } });
  const left = toPaisa(available);

  const submit = form.handleSubmit((values) => {
    const issues = allocationIssues(values, invoices, left);
    for (const issue of issues) {
      if (issue.path[0] === "allocations") form.setError(`allocations.${Number(issue.path[1])}.amount`, { message: issue.message });
      else form.setError("root", { message: issue.message });
    }
    if (issues.length) return;
    startTransition(async () => {
      const res = await settleInvoicesAction({ paymentId, allocations: values.allocations });
      setResult(res);
      if (res.ok) toast.add({ title: t.receivables.settleDone, type: "success" });
    });
  });

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <ActionError result={result} />
      {form.formState.errors.root && <p role="alert" className="text-sm text-destructive">{(t.errors as Record<string, string>)[form.formState.errors.root.message ?? ""]}</p>}
      <InvoiceAllocations control={form.control} setValue={form.setValue} register={form.register} errors={form.formState.errors} invoices={invoices} available={left} empty={t.receivables.noOpenInvoices} />
      <div><Button type="submit" disabled={pending}>{pending ? t.common.processing : t.receivables.settle}</Button></div>
    </form>
  );
}
