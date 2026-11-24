"use client";

import { useWatch, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { WarehouseChoice } from "@/features/catalog/queries";
import { completeSolDeliveryAction, returnSolGoodsAction } from "@/features/sol/actions";
import { arrivalSchema, solReturnSchema, type ArrivalValues, type SolReturnValues } from "@/features/sol/schema";
import { useI18n } from "@/i18n/context";
import { decimalAbove, parseQuantity } from "@/lib/utils/quantity";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { Input } from "@/components/ui/input";
import { QuantityLines, type QuantityLine } from "../quantity-lines";

type Line = QuantityLine & { product: boolean };
interface Issue { message: string; path: (string | number)[] }

function quantityIssues(values: { quantity: string }[], lines: Line[]): Issue[] {
  return values.flatMap((v, i): Issue[] => {
    const line = lines[i];
    if (!line || v.quantity === "") return [];
    if (line.product && !/^\d+$/.test(v.quantity)) return [{ message: "invalidQuantity", path: ["lines", i, "quantity"] }];
    return decimalAbove(v.quantity, line.max) ? [{ message: "tooMuch", path: ["lines", i, "quantity"] }] : [];
  });
}
const productReturned = (values: { quantity: string }[], lines: Line[]) => values.some((v, i) => lines[i]?.product && /[1-9]/.test(v.quantity));

export function ArrivalForm({ deliveryId, lines, warehouses, warehouseId, odometerStart, hasVehicle, canReturn }: {
  deliveryId: string;
  lines: Line[];
  warehouses: WarehouseChoice[];
  warehouseId: string;
  odometerStart: number | null;
  hasVehicle: boolean;
  canReturn: boolean;
}) {
  const { t } = useI18n();
  const s = t.sol;
  const schema = arrivalSchema.superRefine((v, ctx) => {
    for (const issue of quantityIssues(v.lines, lines)) ctx.addIssue({ code: "custom", ...issue });
    if (v.warehouseId === "" && productReturned(v.lines, lines)) ctx.addIssue({ code: "custom", message: "required", path: ["warehouseId"] });
    const end = parseQuantity(v.odometerEnd);
    if (odometerStart !== null && end !== null && end < BigInt(odometerStart)) ctx.addIssue({ code: "custom", message: "odometerLower", path: ["odometerEnd"] });
  });
  return (
    <DocumentForm<ArrivalValues>
      defaults={{ id: deliveryId, receivedBy: "", notes: "", odometerEnd: "", warehouseId, returnReason: "", lines: lines.map((l) => ({ itemId: l.id, quantity: "" })) }}
      resolver={zodResolver(schema)} save={completeSolDeliveryAction} openPath={(id) => `/sol/deliveries/${id}`} cancelPath="/sol/deliveries" submitLabel={s.confirmDelivery} savedMessage={s.deliveredDone}
      confirm={{ title: s.confirmDeliveryTitle, description: s.confirmDeliveryHint }}
    >
      {(form) => {
        const { errors } = form.formState;
        return (
          <>
            <FormSection title={s.confirmDelivery} className="lg:grid-cols-3">
              <Field id="receivedBy" label={s.receivedBy} optional error={errors.receivedBy?.message}><Input id="receivedBy" {...form.register("receivedBy")} /></Field>
              {hasVehicle && <Field id="odometerEnd" label={s.odometerEnd} optional error={errors.odometerEnd?.message}><Input id="odometerEnd" dir="ltr" inputMode="numeric" {...form.register("odometerEnd")} /></Field>}
              <Field id="notes" label={s.deliveryNote} optional error={errors.notes?.message}><Input id="notes" {...form.register("notes")} /></Field>
            </FormSection>
            {canReturn && lines.length > 0 && (
              <QuantityLines title={s.broughtBack} hint={s.broughtBackHint} lines={lines} maxLabel={s.sent} inputLabel={s.broughtBack}>
                <ReturnFields reason="returnReason" optional register={form.register as unknown as Register} errors={errors as Errors} warehouses={warehouses} product={lines.some((l) => l.product)} />
              </QuantityLines>
            )}
          </>
        );
      }}
    </DocumentForm>
  );
}

/** Goods that come back after the delivery was confirmed. */
export function ReturnForm({ deliveryId, lines, warehouses, warehouseId }: { deliveryId: string; lines: Line[]; warehouses: WarehouseChoice[]; warehouseId: string }) {
  const { t } = useI18n();
  const s = t.sol;
  const schema = solReturnSchema.superRefine((v, ctx) => {
    for (const issue of quantityIssues(v.lines, lines)) ctx.addIssue({ code: "custom", ...issue });
    if (v.warehouseId === "" && productReturned(v.lines, lines)) ctx.addIssue({ code: "custom", message: "required", path: ["warehouseId"] });
  });
  return (
    <DocumentForm<SolReturnValues>
      defaults={{ deliveryId, warehouseId, reason: "", requestId: crypto.randomUUID(), lines: lines.map((l) => ({ itemId: l.id, quantity: "" })) }}
      resolver={zodResolver(schema)} save={returnSolGoodsAction} openPath={(id) => `/sol/deliveries/${id}`} cancelPath={`/sol/deliveries/${deliveryId}`} submitLabel={s.returnGoods} savedMessage={s.returned}
      confirm={{ title: s.returnGoods, description: s.confirmDeliveryHint }}
    >
      {(form) => (
        <QuantityLines title={s.returnGoods} hint={s.confirmDeliveryHint} lines={lines} maxLabel={s.delivered} inputLabel={s.broughtBack}>
          <ReturnFields reason="reason" register={form.register as unknown as Register} errors={form.formState.errors as Errors} warehouses={warehouses} product={lines.some((l) => l.product)} />
        </QuantityLines>
      )}
    </DocumentForm>
  );
}

type Register = UseFormRegister<Record<string, string>>;
type Errors = FieldErrors<Record<string, string>>;

function ReturnFields({ reason, register, errors, warehouses, product, optional = false }: { reason: "reason" | "returnReason"; register: Register; errors: Errors; warehouses: WarehouseChoice[]; product: boolean; optional?: boolean }) {
  const { t, locale } = useI18n();
  const lines = useWatch({ name: "lines" }) as { quantity: string }[] | undefined;
  const any = (lines ?? []).some((l) => /[1-9]/.test(l.quantity ?? ""));
  if (optional && !any) return null;
  return (
    <div className="grid gap-5 border-t px-5 py-4 sm:grid-cols-2">
      <Field id={reason} label={t.sol.returnReason} required error={errors[reason]?.message}><Input id={reason} {...register(reason)} /></Field>
      {product && (
        <Field id="warehouseId" label={t.sol.returnWarehouse} error={errors.warehouseId?.message}>
          <NativeSelect id="warehouseId" {...register("warehouseId")}>
            <option value="">{t.documents.choose}</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{locale === "ur" && w.nameUr ? w.nameUr : w.nameEn}</option>)}
          </NativeSelect>
        </Field>
      )}
    </div>
  );
}
