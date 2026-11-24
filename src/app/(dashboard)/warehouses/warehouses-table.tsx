"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { saveWarehouseAction } from "@/features/warehouses/actions";
import { warehouseSchema, type WarehouseValues } from "@/features/warehouses/schema";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { ActionError } from "@/components/forms/action-error";
import { Field, NativeSelect } from "@/components/forms/field";
import { Ltr } from "@/components/shared/bidi";
import { formatNumber } from "@/components/shared/format";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

export interface WarehouseRow extends WarehouseValues { id: string; products: number | null }

export function WarehousesTable({ rows, vehicles, canManage }: { rows: WarehouseRow[]; vehicles: { id: string; label: string }[]; canManage: boolean }) {
  const { t, locale } = useI18n();
  const w = t.warehouses;
  const [editing, setEditing] = useState<WarehouseRow | "new" | null>(null);
  const columns: DataTableColumn<WarehouseRow>[] = [
    { id: "name", header: t.common.name, primary: true, sortValue: (r) => r.nameEn, cell: (r) => <span className="font-medium">{locale === "ur" && r.nameUr ? r.nameUr : r.nameEn}</span> },
    { id: "code", header: w.code, sortValue: (r) => r.code, cell: (r) => <Ltr className="font-mono text-xs">{r.code}</Ltr> },
    { id: "type", header: w.type, sortValue: (r) => w.types[r.type], cell: (r) => <StatusBadge tone={r.type === "damaged" ? "amber" : r.type === "vehicle" ? "blue" : "gray"} dot={false}>{w.types[r.type]}</StatusBadge> },
    ...(rows.some((r) => r.products !== null) ? [{ id: "products", header: w.products, align: "end" as const, sortValue: (r: WarehouseRow) => r.products, cell: (r: WarehouseRow) => formatNumber(r.products ?? 0, locale) }] : []),
    { id: "status", header: t.common.status, cell: (r) => <StatusBadge tone={r.isActive ? "green" : "gray"}>{r.isActive ? t.catalog.active : t.catalog.inactive}</StatusBadge> },
  ];
  const add = canManage && <Button onClick={() => setEditing("new")}><Plus aria-hidden />{w.add}</Button>;
  return (
    <>
      <DataTable
        rows={rows} columns={columns} rowKey={(r) => r.id} caption={w.title} toolbar={add && <div className="sm:ms-auto">{add}</div>}
        actions={canManage ? (r) => <Button variant="ghost" size="icon" aria-label={`${t.common.edit}: ${r.nameEn}`} onClick={() => setEditing(r)}><Pencil /></Button> : undefined}
        empty={{ title: t.states.emptyTitle, action: add }}
      />
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          {editing && <WarehouseForm key={editing === "new" ? "new" : editing.id} row={editing === "new" ? null : editing} vehicles={vehicles} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function WarehouseForm({ row, vehicles, onDone }: { row: WarehouseRow | null; vehicles: { id: string; label: string }[]; onDone: () => void }) {
  const { t } = useI18n();
  const w = t.warehouses;
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<null> | null>(null);
  const form = useForm<WarehouseValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: row ?? { code: "", nameEn: "", nameUr: "", type: "main", vehicleId: "", address: "", isActive: true },
  });
  const { errors } = form.formState;
  const type = useWatch({ control: form.control, name: "type" });
  const isActive = useWatch({ control: form.control, name: "isActive" });
  const submit = form.handleSubmit((values) => startTransition(async () => {
    const res = await saveWarehouseAction(row?.id ?? null, values);
    setResult(res);
    if (res.ok) { toast.add({ title: w.saved, type: "success" }); onDone(); }
  }));
  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <DialogHeader><DialogTitle>{row ? w.edit : w.add}</DialogTitle></DialogHeader>
      <ActionError result={result} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="wh-code" label={w.code} required error={errors.code?.message}><Input id="wh-code" dir="ltr" disabled={!!row} {...form.register("code", { setValueAs: (v: string) => v.toUpperCase() })} /></Field>
        <Field id="wh-type" label={w.type} required error={errors.type?.message}>
          <NativeSelect id="wh-type" disabled={!!row} {...form.register("type")}>
            {(["main", "damaged", ...(vehicles.length || row?.type === "vehicle" ? ["vehicle"] as const : [])] as const).map((x) => <option key={x} value={x}>{w.types[x]}</option>)}
          </NativeSelect>
        </Field>
        <Field id="wh-en" label={t.catalog.nameEn} required error={errors.nameEn?.message}><Input id="wh-en" dir="ltr" {...form.register("nameEn")} /></Field>
        <Field id="wh-ur" label={t.catalog.nameUr} optional error={errors.nameUr?.message}><Input id="wh-ur" dir="rtl" lang="ur" {...form.register("nameUr")} /></Field>
        {type === "vehicle" && (
          <Field id="wh-vehicle" label={w.vehicle} required error={errors.vehicleId?.message} className="sm:col-span-2">
            <NativeSelect id="wh-vehicle" disabled={!!row} {...form.register("vehicleId")}>
              <option value="">{t.documents.choose}</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </NativeSelect>
          </Field>
        )}
        <Field id="wh-address" label={w.address} optional className="sm:col-span-2" error={errors.address?.message}><Textarea id="wh-address" rows={2} {...form.register("address")} /></Field>
        <label className="flex items-center gap-2.5 text-sm"><Checkbox checked={isActive} onCheckedChange={(v) => form.setValue("isActive", v === true)} />{t.catalog.active}</label>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>{t.common.cancel}</Button>
        <Button type="submit" disabled={pending}>{pending ? t.common.saving : t.common.save}</Button>
      </DialogFooter>
    </form>
  );
}
