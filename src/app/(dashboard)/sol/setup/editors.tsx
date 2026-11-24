"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { saveServiceAction, saveTypeAction } from "@/features/sol/actions";
import type { JobType, Service } from "@/features/sol/queries";
import { useI18n } from "@/i18n/context";
import type { ActionResult } from "@/lib/action-result";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { ActionError } from "@/components/forms/action-error";
import { Field } from "@/components/forms/field";
import { MoneyInput } from "@/components/forms/money-input";
import { Ltr } from "@/components/shared/bidi";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

interface Common { id: string | null; nameEn: string; nameUr: string; isActive: boolean }

/** A list whose items are edited in a dialog; `fields` renders what is special to the list. */
function Editor<T extends Common>({ title, items, blank, action, fields, detail }: {
  title: string;
  items: T[];
  blank: T;
  action: (id: string | null, values: unknown) => Promise<ActionResult<null>>;
  fields: (value: T, change: (part: Partial<T>) => void, error: (key: string) => string | undefined) => React.ReactNode;
  detail: (item: T) => React.ReactNode;
}) {
  const { t, locale } = useI18n();
  const s = t.sol;
  const [editing, setEditing] = useState<T | null>(null);
  const [result, setResult] = useState<ActionResult<null> | null>(null);
  const [pending, startTransition] = useTransition();
  const error = (key: string) => (result && !result.ok ? result.fieldErrors?.[key]?.[0] : undefined);
  const open = (item: T) => { setResult(null); setEditing(item); };
  const change = (part: Partial<T>) => setEditing((e) => (e ? { ...e, ...part } : e));
  return (
    <SectionCard title={title} action={<Button size="sm" variant="outline" onClick={() => open(blank)}><Plus aria-hidden />{t.catalog.addItem}</Button>}>
      {items.length === 0 && <p className="text-sm text-muted-foreground">{t.states.emptyTitle}</p>}
      <ul className="divide-y">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0 text-sm">
              <p className="font-medium break-words">{locale === "ur" && item.nameUr ? item.nameUr : item.nameEn}</p>
              <p className="text-xs text-muted-foreground">{detail(item)}</p>
            </div>
            <span className="flex shrink-0 items-center gap-2">
              {!item.isActive && <StatusBadge tone="gray">{s.inactive}</StatusBadge>}
              <Button variant="ghost" size="icon-sm" aria-label={`${t.common.edit}: ${item.nameEn}`} onClick={() => open(item)}><Pencil /></Button>
            </span>
          </li>
        ))}
      </ul>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          {editing && (
            <form
              className="grid gap-5" noValidate
              onSubmit={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  const res = await action(editing.id, editing);
                  setResult(res);
                  if (res.ok) { setEditing(null); toast.add({ title: s.typeSaved, type: "success" }); }
                });
              }}
            >
              <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
              <ActionError result={result} />
              <Field id="item-en" label={s.nameEn} required error={error("nameEn")}><Input id="item-en" dir="ltr" value={editing.nameEn} onChange={(e) => change({ nameEn: e.target.value } as Partial<T>)} /></Field>
              <Field id="item-ur" label={s.nameUr} optional error={error("nameUr")}><Input id="item-ur" dir="rtl" lang="ur" value={editing.nameUr} onChange={(e) => change({ nameUr: e.target.value } as Partial<T>)} /></Field>
              {fields(editing, change, error)}
              <Check label={s.active} checked={editing.isActive} onChange={(v) => change({ isActive: v } as Partial<T>)} />
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

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2.5 text-sm"><Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />{label}</label>;
}

export function TypeEditor({ items }: { items: JobType[] }) {
  const { t } = useI18n();
  const s = t.sol;
  const uses = (x: Pick<JobType, "usesServices" | "usesProducts" | "usesDeliveries">) => [x.usesServices && s.usesServices, x.usesProducts && s.usesProducts, x.usesDeliveries && s.usesDeliveries].filter(Boolean).join(" · ");
  return (
    <Editor
      title={s.types} action={saveTypeAction} items={items.map((x) => ({ ...x, id: x.id as string | null, nameUr: x.nameUr ?? "" }))}
      blank={{ id: null, nameEn: "", nameUr: "", usesServices: true, usesProducts: true, usesDeliveries: true, isActive: true }} detail={uses}
      fields={(v, change) => (
        <div className="grid gap-3">
          <Check label={s.usesServices} checked={v.usesServices} onChange={(x) => change({ usesServices: x })} />
          <Check label={s.usesProducts} checked={v.usesProducts} onChange={(x) => change({ usesProducts: x })} />
          <Check label={s.usesDeliveries} checked={v.usesDeliveries} onChange={(x) => change({ usesDeliveries: x })} />
        </div>
      )}
    />
  );
}

export function ServiceEditor({ items }: { items: Service[] }) {
  const { t, locale } = useI18n();
  const s = t.sol;
  return (
    <Editor
      title={s.services} action={saveServiceAction}
      items={items.map((x) => ({ ...x, id: x.id as string | null, nameUr: x.nameUr ?? "", unitLabel: x.unitLabel ?? "", unitLabelUr: x.unitLabelUr ?? "", price: x.price ?? "" }))}
      blank={{ id: null, nameEn: "", nameUr: "", unitLabel: "", unitLabelUr: "", price: "", isActive: true }}
      detail={(x) => <>{x.price && <Ltr>{formatPaisa(toPaisa(x.price), locale)}</Ltr>}{x.unitLabel && <> · <bdi>{locale === "ur" && x.unitLabelUr ? x.unitLabelUr : x.unitLabel}</bdi></>}</>}
      fields={(v, change, error) => (
        <>
          <Field id="item-price" label={s.defaultPrice} optional error={error("price")}><MoneyInput id="item-price" value={v.price} onChange={(e) => change({ price: e.target.value })} /></Field>
          <Field id="item-unit" label={s.unitLabel} optional error={error("unitLabel")}><Input id="item-unit" value={v.unitLabel} onChange={(e) => change({ unitLabel: e.target.value })} /></Field>
          <Field id="item-unit-ur" label={s.unitLabelUr} optional error={error("unitLabelUr")}><Input id="item-unit-ur" dir="rtl" lang="ur" value={v.unitLabelUr} onChange={(e) => change({ unitLabelUr: e.target.value })} /></Field>
        </>
      )}
    />
  );
}
