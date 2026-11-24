"use client";

import { useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { WarehouseChoice } from "@/features/catalog/queries";
import type { ProductOption } from "@/features/catalog/types";
import { saveReceiptAction } from "@/features/purchasing/actions";
import { flowPath, type Flow } from "@/features/purchasing/flow";
import type { FlowSupplier } from "@/features/purchasing/queries";
import { receiptSchema, type ReceiptValues } from "@/features/purchasing/schema";
import { useI18n } from "@/i18n/context";
import { isolate } from "@/i18n/format";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { amountOf, convertPrice, parseQuantity } from "@/lib/utils/quantity";
import { DocumentForm } from "@/components/documents/document-form";
import { LineEditor, type LineValues } from "@/components/documents/line-editor";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { formatNumber } from "@/components/shared/format";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** What the purchase order still expects, per order line. */
export interface OrderLine {
  orderItemId: string;
  factor: number;
  /** Order price per ordered unit, decimal. */
  price: string;
  remainingBase: number;
}

const ZERO = BigInt(0);
const inUnit = (base: bigint, factor: number) => (base > ZERO && base % BigInt(factor) === ZERO ? (base / BigInt(factor)).toString() : "");

export function ReceiptForm({ flow, receiptId, order, defaults, suppliers, warehouses, products, orderLines }: {
  flow: Flow;
  receiptId: string | null;
  order: { id: string; docNo: string } | null;
  defaults: ReceiptValues;
  suppliers: FlowSupplier[];
  warehouses: WarehouseChoice[];
  products: ProductOption[];
  orderLines: OrderLine[];
}) {
  const { t, locale } = useI18n();
  const d = t.documents;
  const p = t.purchasing;
  const name = (x: { nameEn: string; nameUr: string | null }) => (locale === "ur" && x.nameUr ? x.nameUr : x.nameEn);
  const byLine = new Map(orderLines.map((l) => [l.orderItemId, l]));
  const factorOf = new Map(products.flatMap((x) => x.units.map((u) => [`${x.id}:${u.unitId}`, u.factor] as const)));
  const baseOf = new Map(products.map((x) => [x.id, x.units.find((u) => u.unitId === x.baseUnitId)]));

  return (
    <DocumentForm<ReceiptValues>
      defaults={defaults}
      resolver={zodResolver(receiptSchema)}
      save={(values) => saveReceiptAction(receiptId, values)}
      openPath={(id) => flowPath(flow, "receipts", id)}
      cancelPath={receiptId ? flowPath(flow, "receipts", receiptId) : order ? flowPath(flow, "orders", order.id) : flowPath(flow, "receipts")}
    >
      {(form) => {
        const { errors } = form.formState;
        return (
          <>
            <FormSection title={p.receipt} description={order ? `${p.againstOrder}: ${isolate(order.docNo)}` : undefined} className="lg:grid-cols-4">
              <Field id="supplierId" label={d.supplier} required error={errors.supplierId?.message}>
                {order ? <Input id="supplierId" readOnly value={suppliers.filter((s) => s.id === defaults.supplierId).map(name).join("")} /> : (
                  <NativeSelect id="supplierId" {...form.register("supplierId")}>
                    {suppliers.length !== 1 && <option value="">{d.choose}</option>}
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
                  </NativeSelect>
                )}
              </Field>
              <Field id="warehouseId" label={d.warehouse} required error={errors.warehouseId?.message}>
                <NativeSelect id="warehouseId" {...form.register("warehouseId")}>
                  <option value="">{d.choose}</option>
                  {warehouses.filter((w) => w.type !== "damaged").map((w) => <option key={w.id} value={w.id}>{name(w)}</option>)}
                </NativeSelect>
              </Field>
              <Field id="damagedWarehouseId" label={p.damagedWarehouse} optional error={errors.damagedWarehouseId?.message}>
                <NativeSelect id="damagedWarehouseId" {...form.register("damagedWarehouseId")}>
                  <option value="">{d.none}</option>
                  {warehouses.filter((w) => w.type === "damaged").map((w) => <option key={w.id} value={w.id}>{name(w)}</option>)}
                </NativeSelect>
              </Field>
              <Field id="date" label={d.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" {...form.register("date")} /></Field>
              <Field id="reference" label={p.supplierReference} optional error={errors.reference?.message}><Input id="reference" dir="ltr" {...form.register("reference")} /></Field>
              <Field id="notes" label={d.notes} optional className="sm:col-span-2 lg:col-span-3" error={errors.notes?.message}><Textarea id="notes" rows={2} {...form.register("notes")} /></Field>
            </FormSection>
            <LineEditor
              products={products}
              lockProducts={!!order}
              lockUnits={false}
              columns={[
                { key: "expected", label: p.expected, kind: "quantity" },
                {
                  key: "accepted", label: p.accepted, hint: p.acceptedHint, kind: "quantity", showBase: true,
                  warn: (l) => {
                    const ordered = byLine.get(l.orderItemId ?? "");
                    if (!ordered) return undefined;
                    const factor = BigInt(factorOf.get(`${l.productId}:${l.unitId}`) ?? 1);
                    const received = ((parseQuantity(l.accepted) ?? ZERO) + (parseQuantity(l.damaged) ?? ZERO)) * factor;
                    return received > BigInt(ordered.remainingBase) ? p.overReceived : undefined;
                  },
                },
                { key: "damaged", label: p.damaged, hint: p.damagedHint, kind: "quantity" },
                { key: "rejected", label: p.rejected, hint: p.rejectedHint, kind: "quantity" },
                { key: "cost", label: d.unitCost, kind: "money" },
              ]}
              newLine={(product, unit) => ({ productId: product.id, unitId: unit.unitId, orderItemId: "", expected: "", accepted: "", damaged: "", rejected: "", cost: unit.purchasePrice ?? "", notes: "" })}
              unitChange={(line, next, previous): Record<string, string> => {
                const ordered = byLine.get(line.orderItemId ?? "");
                if (!ordered) return { cost: next.purchasePrice ?? "" };
                const convert = (q: string | undefined): string => {
                  const n = parseQuantity(q);
                  return n === null ? "" : inUnit(n * BigInt(previous?.factor ?? 1), next.factor);
                };
                return {
                  expected: convert(line.expected), accepted: convert(line.accepted), damaged: convert(line.damaged), rejected: convert(line.rejected),
                  cost: toDbAmount(convertPrice(toPaisa(ordered.price), BigInt(ordered.factor), BigInt(next.factor))),
                };
              }}
              amount={(l) => amountOf([l.accepted, l.damaged], l.cost)}
              info={(l) => {
                const ordered = byLine.get(l.orderItemId ?? "");
                const base = baseOf.get(l.productId);
                return ordered && base ? <p className="mt-1 text-xs text-muted-foreground">{p.remaining}: {isolate(formatNumber(ordered.remainingBase, locale))} {name(base)}</p> : null;
              }}
            />
            <ConditionNotes />
          </>
        );
      }}
    </DocumentForm>
  );
}

/** Says what damaged and rejected mean as soon as any are entered. */
function ConditionNotes() {
  const lines = (useWatch({ name: "lines" }) ?? []) as LineValues[];
  const { t } = useI18n();
  if (!lines.some((l) => /[1-9]/.test(`${l.damaged ?? ""}${l.rejected ?? ""}`))) return null;
  return (
    <ul className="grid gap-1 text-sm text-muted-foreground">
      <li><span className="font-medium text-foreground">{t.purchasing.damaged}:</span> {t.purchasing.damagedHint}</li>
      <li><span className="font-medium text-foreground">{t.purchasing.rejected}:</span> {t.purchasing.rejectedHint}</li>
    </ul>
  );
}
