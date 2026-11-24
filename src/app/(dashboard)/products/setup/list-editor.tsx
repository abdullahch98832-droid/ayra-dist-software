"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { ActionError } from "@/components/forms/action-error";
import { Field } from "@/components/forms/field";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

export interface ListItem { id: string; code?: string; nameEn: string; nameUr: string | null; isActive: boolean }

/** Simple named list (categories, brands, units) edited in a dialog. */
export function ListEditor({ title, items, withCode = false, action }: {
  title: string;
  items: ListItem[];
  withCode?: boolean;
  action: (id: string | null, values: unknown) => Promise<ActionResult<null>>;
}) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState<{ id: string | null; code: string; nameEn: string; nameUr: string; isActive: boolean } | null>(null);
  const [result, setResult] = useState<ActionResult<null> | null>(null);
  const [pending, startTransition] = useTransition();
  const error = (key: string) => (result && !result.ok ? result.fieldErrors?.[key]?.[0] : undefined);
  const open = (item: ListItem | null) => {
    setResult(null);
    setEditing({ id: item?.id ?? null, code: item?.code ?? "", nameEn: item?.nameEn ?? "", nameUr: item?.nameUr ?? "", isActive: item?.isActive ?? true });
  };

  return (
    <SectionCard title={title} action={<Button size="sm" variant="outline" onClick={() => open(null)}><Plus aria-hidden />{t.catalog.addItem}</Button>}>
      {items.length === 0 && <p className="text-sm text-muted-foreground">{t.states.emptyTitle}</p>}
      <ul className="divide-y">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 text-sm">
              <span className="font-medium break-words">{locale === "ur" && item.nameUr ? item.nameUr : item.nameEn}</span>
              {item.code && <bdi className="ms-2 font-mono text-xs text-muted-foreground" dir="ltr">{item.code}</bdi>}
            </span>
            <span className="flex items-center gap-2">
              {!item.isActive && <StatusBadge tone="gray">{t.catalog.inactive}</StatusBadge>}
              <Button variant="ghost" size="icon-sm" aria-label={`${t.common.edit}: ${item.nameEn}`} onClick={() => open(item)}><Pencil /></Button>
            </span>
          </li>
        ))}
      </ul>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing && (
            <form
              className="grid gap-5"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  const res = await action(editing.id, editing);
                  setResult(res);
                  if (res.ok) { setEditing(null); toast.add({ title: t.catalog.itemSaved, type: "success" }); }
                });
              }}
            >
              <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
              <ActionError result={result} />
              {withCode && (
                <Field id="item-code" label={t.catalog.code} required hint={t.catalog.unitCodeHint} error={error("code")}>
                  <Input id="item-code" dir="ltr" disabled={!!editing.id} value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} />
                </Field>
              )}
              <Field id="item-en" label={t.catalog.nameEn} required error={error("nameEn")}>
                <Input id="item-en" dir="ltr" value={editing.nameEn} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} />
              </Field>
              <Field id="item-ur" label={t.catalog.nameUr} required={withCode} optional={!withCode} error={error("nameUr")}>
                <Input id="item-ur" dir="rtl" lang="ur" value={editing.nameUr} onChange={(e) => setEditing({ ...editing, nameUr: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2.5 text-sm">
                <Checkbox checked={editing.isActive} onCheckedChange={(v) => setEditing({ ...editing, isActive: v === true })} />{t.catalog.active}
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t.common.cancel}</Button>
                <Button type="submit" disabled={pending}>{pending ? t.common.saving : t.common.save}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
