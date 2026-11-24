"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { saveDriverAction } from "@/features/fleet/actions";
import type { Driver } from "@/features/fleet/queries";
import { driverSchema, type DriverValues } from "@/features/fleet/schema";
import type { Staff } from "@/features/sol/queries";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { ActionError } from "@/components/forms/action-error";
import { Field, FormAlert, NativeSelect } from "@/components/forms/field";
import { Ltr } from "@/components/shared/bidi";
import { formatDate } from "@/components/shared/format";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

export function DriversTable({ drivers, staff, manage, today }: { drivers: Driver[]; staff: Staff[]; manage: boolean; today: string }) {
  const { t, locale } = useI18n();
  const v = t.vehicles;
  const [editing, setEditing] = useState<Driver | "new" | null>(null);
  const name = (x: { nameEn: string; nameUr: string | null }) => (locale === "ur" && x.nameUr ? x.nameUr : x.nameEn);
  const columns: DataTableColumn<Driver>[] = [
    { id: "name", header: v.driver, primary: true, sortValue: name, cell: (d) => <span className="font-medium">{name(d)}</span> },
    { id: "phone", header: v.phone, cell: (d) => (d.phone ? <Ltr>{d.phone}</Ltr> : "—") },
    { id: "license", header: v.license, cell: (d) => (d.license ? <Ltr>{d.license}</Ltr> : "—") },
    { id: "expiry", header: v.licenseExpiry, sortValue: (d) => d.licenseExpiry ?? "", cell: (d) => (d.licenseExpiry ? <span className="flex flex-wrap items-center gap-2"><bdi>{formatDate(d.licenseExpiry, locale)}</bdi>{d.licenseExpiry < today && <StatusBadge tone="red">{v.licenseExpired}</StatusBadge>}</span> : "—") },
    { id: "status", header: v.status, cell: (d) => <StatusBadge tone={d.isActive ? "green" : "gray"}>{d.isActive ? v.driverActive : v.driverInactive}</StatusBadge> },
    ...(manage ? [{ id: "actions", header: "", cell: (d: Driver) => <Button variant="ghost" size="icon-sm" aria-label={`${v.editDriver}: ${d.nameEn}`} onClick={() => setEditing(d)}><Pencil /></Button> }] : []),
  ];
  const add = manage && <Button onClick={() => setEditing("new")}><Plus aria-hidden />{v.addDriver}</Button>;
  return (
    <>
      <DataTable rows={drivers} columns={columns} rowKey={(d) => d.id} caption={v.drivers} toolbar={drivers.length > 0 && add} searchText={(d) => `${d.nameEn} ${d.nameUr ?? ""} ${d.phone ?? ""} ${d.license ?? ""}`} empty={{ title: v.driverEmpty, description: v.driverEmptyHint, action: add }} />
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing && <DriverForm key={editing === "new" ? "new" : editing.id} driver={editing === "new" ? null : editing} staff={staff} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DriverForm({ driver, staff, onDone }: { driver: Driver | null; staff: Staff[]; onDone: () => void }) {
  const { t, locale } = useI18n();
  const v = t.vehicles;
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<null> | null>(null);
  const form = useForm<DriverValues>({
    resolver: zodResolver(driverSchema),
    defaultValues: { employeeId: driver?.employeeId ?? "", license: driver?.license ?? "", licenseExpiry: driver?.licenseExpiry ?? "", isActive: driver?.isActive ?? true },
  });
  const { errors } = form.formState;
  const active = useWatch({ control: form.control, name: "isActive" });
  const submit = form.handleSubmit((values) => startTransition(async () => {
    const res = await saveDriverAction(driver?.id ?? null, values);
    setResult(res);
    if (!res.ok) return;
    toast.add({ title: v.driverSaved, type: "success" });
    onDone();
  }));
  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <DialogHeader><DialogTitle>{driver ? v.editDriver : v.addDriver}</DialogTitle></DialogHeader>
      <ActionError result={result} />
      {driver ? <p className="text-sm font-medium">{locale === "ur" && driver.nameUr ? driver.nameUr : driver.nameEn}</p> : staff.length === 0 ? <FormAlert tone="info">{v.noEmployees}</FormAlert> : (
        <Field id="employeeId" label={v.employee} required error={errors.employeeId?.message}>
          <NativeSelect id="employeeId" {...form.register("employeeId")}>
            <option value="">{t.documents.choose}</option>
            {staff.map((x) => <option key={x.id} value={x.id}>{locale === "ur" && x.nameUr ? x.nameUr : x.nameEn} ({x.code})</option>)}
          </NativeSelect>
        </Field>
      )}
      <Field id="license" label={v.license} optional error={errors.license?.message}><Input id="license" dir="ltr" {...form.register("license")} /></Field>
      <Field id="licenseExpiry" label={v.licenseExpiry} optional error={errors.licenseExpiry?.message}><Input id="licenseExpiry" type="date" dir="ltr" {...form.register("licenseExpiry")} /></Field>
      <label className="flex items-center gap-2.5 text-sm"><Checkbox checked={active} onCheckedChange={(x) => form.setValue("isActive", x === true, { shouldDirty: true })} />{v.driverActive}</label>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>{t.common.cancel}</Button>
        <Button type="submit" disabled={pending}>{pending ? t.common.saving : t.common.save}</Button>
      </DialogFooter>
    </form>
  );
}
