"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { completeDeliveryAction } from "@/features/sales/actions";
import { CONDITIONS, deliverySchema, type DeliveryValues } from "@/features/sales/schema";
import { useI18n } from "@/i18n/context";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { wholeAbove } from "@/lib/utils/quantity";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect, useMessage } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { MoneyInput } from "@/components/forms/money-input";
import { Ltr } from "@/components/shared/bidi";
import { formatNumber } from "@/components/shared/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface DeliveredLine { itemId: string; name: string; sku: string; unit: string; quantity: number }

export function ConfirmForm({ deliveryId, lines, canReturn, shop, supplier, due, accounts, collects }: {
  deliveryId: string;
  lines: DeliveredLine[];
  /** Without it, goods that came back are recorded later as a customer return. */
  canReturn: boolean;
  shop: string;
  /** Employee who takes the goods to the shop. */
  supplier: string;
  /** Still to pay, when the user may know it. */
  due: string | null;
  accounts: { id: string; name: string }[];
  /** The user may record money received with the goods. */
  collects: boolean;
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
      defaults={{ id: deliveryId, receivedBy: shop, notes: "", returnReason: "", suppliedBy: supplier, amount: "", destination: supplier ? "held" : accounts[0]?.id ?? "held", method: "cash", reference: "", lines: lines.map((l) => ({ itemId: l.itemId, quantity: "", condition: "saleable" })) }}
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
          <FormSection title={t.supply.shopReceived}>
            <Field id="receivedBy" label={s.receivedBy} optional error={form.formState.errors.receivedBy?.message}><Input id="receivedBy" {...form.register("receivedBy")} /></Field>
            <Field id="notes" label={s.deliveryNote} optional error={form.formState.errors.notes?.message}><Input id="notes" {...form.register("notes")} /></Field>
          </FormSection>
          {collects && <MoneyReceived due={due} accounts={accounts} held={supplier !== ""} />}
          {canReturn && <Returned lines={lines} />}
        </>
      )}
    </DocumentForm>
  );
}

function MoneyReceived({ due, accounts, held }: { due: string | null; accounts: { id: string; name: string }[]; held: boolean }) {
  const { t, locale } = useI18n();
  const s = t.supply;
  const { control, register, setValue, formState: { errors } } = useFormContext<DeliveryValues>();
  const [amount, method, destination] = useWatch({ control, name: ["amount", "method", "destination"] });
  const any = /[1-9]/.test(amount ?? "");
  return (
    <FormSection title={s.money} description={s.moneyHint}>
      <div className="grid content-start gap-2">
        <Field id="amount" label={s.moneyAmount} optional error={errors.amount?.message}><MoneyInput id="amount" {...register("amount")} /></Field>
        {due !== null && toPaisa(due) > BigInt(0) && <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setValue("amount", due, { shouldDirty: true, shouldValidate: true })}>{s.fullAmount}: <Ltr>{formatPaisa(toPaisa(due), locale)}</Ltr></Button>}
      </div>
      {any && (
        <>
          <Field id="destination" label={s.into} required error={errors.destination?.message ?? errors.suppliedBy?.message}>
            <NativeSelect id="destination" {...register("destination")}>{held && <option value="held">{s.heldBySupplier}</option>}{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</NativeSelect>
          </Field>
          {destination !== "held" && (
            <Field id="method" label={t.receivables.method} required error={errors.method?.message}>
              <NativeSelect id="method" {...register("method")}>{(["cash", "bank_transfer", "cheque", "online", "other"] as const).map((m) => <option key={m} value={m}>{t.purchasing.methods[m]}</option>)}</NativeSelect>
            </Field>
          )}
          {destination !== "held" && method !== "cash" && <Field id="reference" label={t.receivables.reference} error={errors.reference?.message}><Input id="reference" {...register("reference")} /></Field>}
        </>
      )}
    </FormSection>
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
    <section className="rounded-2xl border bg-card shadow-card">
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
