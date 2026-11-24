"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { completeDeliveryAction } from "@/features/sales/actions";
import { CONDITIONS, deliverySchema, type DeliveryValues } from "@/features/sales/schema";
import { useI18n } from "@/i18n/context";
import { wholeAbove } from "@/lib/utils/quantity";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect, useMessage } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { Ltr } from "@/components/shared/bidi";
import { formatNumber } from "@/components/shared/format";
import { Input } from "@/components/ui/input";

export interface DeliveredLine { itemId: string; name: string; sku: string; unit: string; quantity: number }

export function ConfirmForm({ deliveryId, lines, canReturn }: {
  deliveryId: string;
  lines: DeliveredLine[];
  /** Without it, goods that came back are recorded later as a customer return. */
  canReturn: boolean;
}) {
  const { t } = useI18n();
  const s = t.sales;
  const limited = deliverySchema.superRefine((v, ctx) => {
    v.lines.forEach((l, i) => {
      if (wholeAbove(l.quantity, lines[i]?.quantity ?? 0)) ctx.addIssue({ code: "custom", message: "tooMuch", path: ["lines", i, "quantity"] });
    });
  });
  return (
    <DocumentForm<DeliveryValues>
      defaults={{ id: deliveryId, receivedBy: "", notes: "", returnReason: "", lines: lines.map((l) => ({ itemId: l.itemId, quantity: "", condition: "saleable" })) }}
      resolver={zodResolver(limited)}
      save={completeDeliveryAction}
      openPath={(id) => `/sales/deliveries/${id}`}
      cancelPath="/sales/deliveries"
      submitLabel={s.confirmDelivery}
      savedMessage={s.delivered}
      confirm={{ title: s.confirmTitle, description: s.confirmHint }}
    >
      {(form) => (
        <>
          <FormSection title={s.confirmDelivery}>
            <Field id="receivedBy" label={s.receivedBy} optional error={form.formState.errors.receivedBy?.message}><Input id="receivedBy" {...form.register("receivedBy")} /></Field>
            <Field id="notes" label={s.deliveryNote} optional error={form.formState.errors.notes?.message}><Input id="notes" {...form.register("notes")} /></Field>
          </FormSection>
          {canReturn && <Returned lines={lines} />}
        </>
      )}
    </DocumentForm>
  );
}

function Returned({ lines }: { lines: DeliveredLine[] }) {
  const { t, locale } = useI18n();
  const s = t.sales;
  const message = useMessage();
  const { control, register, formState: { errors } } = useFormContext<DeliveryValues>();
  const values = useWatch({ control, name: "lines" }) ?? [];
  const any = values.some((l) => /[1-9]/.test(l.quantity ?? ""));
  return (
    <section className="rounded-xl border bg-card shadow-card">
      <header className="border-b px-5 py-4">
        <h2 className="text-base font-semibold text-navy">{s.returnedNow}</h2>
        <p className="text-sm text-muted-foreground">{s.nothingReturned}</p>
      </header>
      <ul className="divide-y">
        {lines.map((l, i) => {
          const error = errors.lines?.[i]?.quantity?.message;
          return (
            <li key={l.itemId} className="grid gap-3 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_9rem] sm:items-center">
              <div className="min-w-0">
                <p className="text-sm font-medium break-words">{l.name}</p>
                <p className="text-xs text-muted-foreground"><Ltr>{l.sku}</Ltr> · {l.unit}</p>
              </div>
              <p className="text-sm"><span className="block text-xs text-muted-foreground">{s.dispatched}</span><Ltr className="tabular-nums">{formatNumber(l.quantity, locale)}</Ltr></p>
              <div>
                <label htmlFor={`back-${l.itemId}`} className="block text-xs text-muted-foreground">{s.returnedNow}</label>
                <Input id={`back-${l.itemId}`} dir="ltr" inputMode="numeric" autoComplete="off" className="tabular-nums" aria-invalid={error ? true : undefined} {...register(`lines.${i}.quantity`)} />
                {error && <p role="alert" className="text-xs text-destructive">{message(error)}</p>}
              </div>
              <div>
                <label htmlFor={`condition-${l.itemId}`} className="block text-xs text-muted-foreground">{s.condition}</label>
                <NativeSelect id={`condition-${l.itemId}`} {...register(`lines.${i}.condition`)}>{CONDITIONS.map((c) => <option key={c} value={c}>{s.conditions[c]}</option>)}</NativeSelect>
              </div>
            </li>
          );
        })}
      </ul>
      {any && (
        <div className="border-t px-5 py-4">
          <Field id="returnReason" label={s.returnReason} required error={errors.returnReason?.message}><Input id="returnReason" {...register("returnReason")} /></Field>
        </div>
      )}
    </section>
  );
}
