"use client";

import { useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { saveVehicleAction } from "@/features/fleet/actions";
import type { Driver } from "@/features/fleet/queries";
import { FUEL_TYPES, OWNERSHIPS, VEHICLE_STATUSES, vehicleSchema, type VehicleValues } from "@/features/fleet/schema";
import { useI18n } from "@/i18n/context";
import { DocumentForm } from "@/components/documents/document-form";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { Ltr } from "@/components/shared/bidi";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function VehicleForm({ vehicleId, defaults, drivers }: { vehicleId: string | null; defaults: VehicleValues; drivers: Driver[] }) {
  const { t, locale } = useI18n();
  const v = t.vehicles;
  return (
    <DocumentForm<VehicleValues> defaults={defaults} resolver={zodResolver(vehicleSchema)} save={saveVehicleAction.bind(null, vehicleId)} openPath={(id) => `/vehicles/${id}`} cancelPath={vehicleId ? `/vehicles/${vehicleId}` : "/vehicles"} submitLabel={t.common.save} savedMessage={v.saved}>
      {(form) => {
        const { errors } = form.formState;
        return (
          <FormSection title={v.details} className="lg:grid-cols-3">
            <Field id="registration" label={v.registration} required error={errors.registration?.message}><Input id="registration" dir="ltr" className="uppercase" autoComplete="off" {...form.register("registration")} /></Field>
            <Field id="name" label={v.name} required hint={v.nameHint} error={errors.name?.message}><Input id="name" {...form.register("name")} /></Field>
            <Field id="type" label={v.type} optional hint={v.typeHint} error={errors.type?.message}><Input id="type" {...form.register("type")} /></Field>
            <Field id="make" label={v.make} optional error={errors.make?.message}><Input id="make" {...form.register("make")} /></Field>
            <Field id="model" label={v.model} optional error={errors.model?.message}><Input id="model" {...form.register("model")} /></Field>
            <Field id="capacity" label={v.capacity} optional error={errors.capacity?.message}><Input id="capacity" {...form.register("capacity")} /></Field>
            <Field id="fuelType" label={v.fuelType} optional error={errors.fuelType?.message}>
              <NativeSelect id="fuelType" {...form.register("fuelType")}><option value="">{t.documents.choose}</option>{FUEL_TYPES.map((x) => <option key={x} value={x}>{v.fuels[x]}</option>)}</NativeSelect>
            </Field>
            <Field id="ownership" label={v.ownership} required error={errors.ownership?.message}>
              <NativeSelect id="ownership" {...form.register("ownership")}>{OWNERSHIPS.map((x) => <option key={x} value={x}>{v.ownerships[x]}</option>)}</NativeSelect>
            </Field>
            <Field id="status" label={v.status} required hint={v.statusHint} error={errors.status?.message}>
              <NativeSelect id="status" {...form.register("status")}>{VEHICLE_STATUSES.map((x) => <option key={x} value={x}>{v.statuses[x]}</option>)}</NativeSelect>
            </Field>
            <div className="grid content-start gap-2">
              <Field id="driverId" label={v.driver} optional error={errors.driverId?.message}>
                <NativeSelect id="driverId" {...form.register("driverId")}><option value="">{v.none}</option>{drivers.map((d) => <option key={d.id} value={d.id}>{locale === "ur" && d.nameUr ? d.nameUr : d.nameEn}</option>)}</NativeSelect>
              </Field>
              <DriverContact drivers={drivers} />
            </div>
            <Field id="notes" label={t.documents.notes} optional className="sm:col-span-2" error={errors.notes?.message}><Textarea id="notes" rows={2} {...form.register("notes")} /></Field>
          </FormSection>
        );
      }}
    </DocumentForm>
  );
}

function DriverContact({ drivers }: { drivers: Driver[] }) {
  const { t } = useI18n();
  const id = useWatch<VehicleValues, "driverId">({ name: "driverId" });
  const phone = drivers.find((d) => d.id === id)?.phone;
  return phone ? <p className="text-xs text-muted-foreground">{t.vehicles.driverContact}: <Ltr>{phone}</Ltr></p> : null;
}
