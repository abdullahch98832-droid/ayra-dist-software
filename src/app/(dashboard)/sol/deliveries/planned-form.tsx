"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { WarehouseChoice } from "@/features/catalog/queries";
import { savePlannedAction } from "@/features/sol/actions";
import { plannedSchema, type PlannedValues } from "@/features/sol/schema";
import { useI18n } from "@/i18n/context";
import { decimalAbove } from "@/lib/utils/quantity";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { Input } from "@/components/ui/input";
import { QuantityLines, type QuantityLine } from "./quantity-lines";

export interface VehicleChoice { id: string; label: string; driverId: string | null }

export function PlannedForm({ deliveryId, defaults, lines, vehicles, drivers, warehouses, cancelPath }: {
  deliveryId: string | null;
  defaults: PlannedValues;
  lines: (QuantityLine & { product: boolean })[];
  vehicles: VehicleChoice[];
  drivers: { id: string; nameEn: string; nameUr: string | null }[];
  warehouses: WarehouseChoice[];
  cancelPath: string;
}) {
  const { t, locale } = useI18n();
  const s = t.sol;
  const local = (x: { nameEn: string; nameUr: string | null }) => (locale === "ur" && x.nameUr ? x.nameUr : x.nameEn);
  const schema = plannedSchema.superRefine((v, ctx) => {
    v.lines.forEach((l, i) => {
      const line = lines[i];
      if (!line || l.quantity === "") return;
      if (line.product && !/^\d+$/.test(l.quantity)) ctx.addIssue({ code: "custom", message: "invalidQuantity", path: ["lines", i, "quantity"] });
      else if (decimalAbove(l.quantity, line.max)) ctx.addIssue({ code: "custom", message: "tooMuch", path: ["lines", i, "quantity"] });
    });
    if (v.warehouseId === "" && v.lines.some((l, i) => lines[i]?.product && /[1-9]/.test(l.quantity))) ctx.addIssue({ code: "custom", message: "required", path: ["warehouseId"] });
  });
  return (
    <DocumentForm<PlannedValues> defaults={defaults} resolver={zodResolver(schema)} save={savePlannedAction.bind(null, deliveryId)} openPath={(id) => `/sol/deliveries/${id}`} cancelPath={cancelPath} submitLabel={t.common.save} savedMessage={s.deliverySaved}>
      {(form) => {
        const { errors } = form.formState;
        return (
          <>
            <FormSection title={s.delivery} className="lg:grid-cols-3">
              <Field id="destination" label={s.destination} required error={errors.destination?.message} className="sm:col-span-2"><Input id="destination" {...form.register("destination")} /></Field>
              <Field id="date" label={s.deliveryDate} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" {...form.register("date")} /></Field>
              <Field id="vehicleId" label={s.vehicle} optional error={errors.vehicleId?.message}>
                <NativeSelect
                  id="vehicleId"
                  {...form.register("vehicleId", {
                    // The vehicle's usual driver, unless another one was chosen.
                    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
                      const usual = vehicles.find((v) => v.id === e.target.value)?.driverId;
                      if (usual && drivers.some((d) => d.id === usual) && form.getValues("driverId") === "") form.setValue("driverId", usual, { shouldDirty: true });
                    },
                  })}
                >
                  <option value="">{s.noVehicle}</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </NativeSelect>
              </Field>
              <Field id="driverId" label={s.driver} optional error={errors.driverId?.message}>
                <NativeSelect id="driverId" {...form.register("driverId")}>
                  <option value="">{s.noDriver}</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{local(d)}</option>)}
                </NativeSelect>
              </Field>
              <Odometer />
              {lines.some((l) => l.product) && (
                <Field id="warehouseId" label={s.fromWarehouse} error={errors.warehouseId?.message}>
                  <NativeSelect id="warehouseId" {...form.register("warehouseId")}>
                    <option value="">{t.documents.choose}</option>
                    {warehouses.map((w) => <option key={w.id} value={w.id}>{local(w)}</option>)}
                  </NativeSelect>
                </Field>
              )}
              <Field id="notes" label={t.documents.notes} optional error={errors.notes?.message} className="sm:col-span-2"><Input id="notes" {...form.register("notes")} /></Field>
            </FormSection>
            {lines.length > 0 && <QuantityLines title={s.send} hint={s.sendHint} lines={lines} maxLabel={s.remaining} inputLabel={s.send} />}
          </>
        );
      }}
    </DocumentForm>
  );
}

function Odometer() {
  const { t } = useI18n();
  const { register, formState: { errors } } = useFormContext<PlannedValues>();
  const vehicle = useWatch<PlannedValues, "vehicleId">({ name: "vehicleId" });
  if (!vehicle) return null;
  return <Field id="odometerStart" label={t.sol.odometerStart} optional error={errors.odometerStart?.message}><Input id="odometerStart" dir="ltr" inputMode="numeric" {...register("odometerStart")} /></Field>;
}
