"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import type { LedgerAccount } from "@/features/accounting/queries";
import { saveCategoryAction } from "@/features/expenses/actions";
import type { CategoryRow } from "@/features/expenses/queries";
import { categorySchema, VEHICLE_KINDS, type CategoryValues } from "@/features/expenses/schema";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { ActionError } from "@/components/forms/action-error";
import { Field, NativeSelect } from "@/components/forms/field";
import { Ltr } from "@/components/shared/bidi";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

export function CategoriesTable({ categories, accounts }: { categories: CategoryRow[]; accounts: LedgerAccount[] }) {
  const { t, locale } = useI18n();
  const x = t.expenses;
  const [editing, setEditing] = useState<CategoryRow | "new" | null>(null);
  const local = (en: string, ur: string | null) => (locale === "ur" && ur ? ur : en);
  const columns: DataTableColumn<CategoryRow>[] = [
    { id: "name", header: x.category, primary: true, sortValue: (c) => local(c.name_en, c.name_ur), cell: (c) => <span className="font-medium">{local(c.name_en, c.name_ur)}</span> },
    { id: "account", header: x.categoryAccount, cell: (c) => c.account && <span><Ltr className="text-muted-foreground">{c.account.code}</Ltr> {local(c.account.name_en, c.account.name_ur)}</span> },
    { id: "vehicle", header: x.vehicleKind, hideBelow: "lg", cell: (c) => (c.vehicle_kind ? x.vehicleKinds[c.vehicle_kind as "fuel"] : "—") },
    { id: "status", header: t.common.status, cell: (c) => <StatusBadge tone={c.is_payroll ? "blue" : c.is_active ? "green" : "gray"}>{c.is_payroll ? x.payrollCategory : c.is_active ? t.catalog.active : t.catalog.inactive}</StatusBadge> },
    { id: "actions", header: "", cell: (c) => !c.is_payroll && <Button variant="ghost" size="icon-sm" aria-label={`${t.common.edit}: ${c.name_en}`} onClick={() => setEditing(c)}><Pencil /></Button> },
  ];
  return (
    <>
      <DataTable rows={categories} columns={columns} rowKey={(c) => c.id} caption={x.tabs.categories} searchText={(c) => `${c.name_en} ${c.name_ur} ${c.code}`} toolbar={<Button className="sm:ms-auto" onClick={() => setEditing("new")}><Plus aria-hidden />{t.catalog.addItem}</Button>} empty={{ title: x.tabs.categories }} />
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing && <CategoryForm key={editing === "new" ? "new" : editing.id} category={editing === "new" ? null : editing} accounts={accounts} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CategoryForm({ category, accounts, onDone }: { category: CategoryRow | null; accounts: LedgerAccount[]; onDone: () => void }) {
  const { t, locale } = useI18n();
  const x = t.expenses;
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<null> | null>(null);
  const form = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { code: category?.code ?? "", nameEn: category?.name_en ?? "", nameUr: category?.name_ur ?? "", accountId: category?.gl_account_id ?? "", vehicleKind: (category?.vehicle_kind ?? "") as CategoryValues["vehicleKind"], isActive: category?.is_active ?? true },
  });
  const { errors } = form.formState;
  const active = useWatch({ control: form.control, name: "isActive" });
  const submit = form.handleSubmit((values) => startTransition(async () => {
    const res = await saveCategoryAction(category?.id ?? null, values);
    setResult(res);
    if (!res.ok) return;
    toast.add({ title: t.catalog.itemSaved, type: "success" });
    onDone();
  }));
  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <DialogHeader><DialogTitle>{x.category}</DialogTitle></DialogHeader>
      <ActionError result={result} />
      {!category && <Field id="cat-code" label={x.code} required hint={x.codeHint} error={errors.code?.message}><Input id="cat-code" dir="ltr" {...form.register("code", { setValueAs: (v: string) => v.toUpperCase() })} /></Field>}
      <Field id="cat-en" label={t.catalog.nameEn} required error={errors.nameEn?.message}><Input id="cat-en" dir="ltr" {...form.register("nameEn")} /></Field>
      <Field id="cat-ur" label={t.catalog.nameUr} required error={errors.nameUr?.message}><Input id="cat-ur" dir="rtl" lang="ur" {...form.register("nameUr")} /></Field>
      <Field id="cat-account" label={x.categoryAccount} required error={errors.accountId?.message}>
        <NativeSelect id="cat-account" {...form.register("accountId")}><option value="">{t.documents.choose}</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {locale === "ur" ? a.name_ur : a.name_en}</option>)}</NativeSelect>
      </Field>
      <Field id="cat-vehicle" label={x.vehicleKind} optional error={errors.vehicleKind?.message}>
        <NativeSelect id="cat-vehicle" {...form.register("vehicleKind")}><option value="">{x.notVehicle}</option>{VEHICLE_KINDS.map((k) => <option key={k} value={k}>{x.vehicleKinds[k]}</option>)}</NativeSelect>
      </Field>
      <label className="flex items-center gap-2.5 text-sm"><Checkbox checked={active} onCheckedChange={(v) => form.setValue("isActive", v === true, { shouldDirty: true })} />{t.catalog.active}</label>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>{t.common.cancel}</Button>
        <Button type="submit" disabled={pending}>{pending ? t.common.saving : t.common.save}</Button>
      </DialogFooter>
    </form>
  );
}
