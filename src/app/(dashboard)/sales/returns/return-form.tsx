"use client";

import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { WarehouseChoice } from "@/features/catalog/queries";
import type { ProductOption } from "@/features/catalog/types";
import type { CustomerOption } from "@/features/customers/schema";
import { saveReturnAction } from "@/features/sales/actions";
import { CONDITIONS, returnSchema, type ReturnValues } from "@/features/sales/schema";
import { useI18n } from "@/i18n/context";
import { fill, isolate } from "@/i18n/format";
import { amountOf, parseQuantity } from "@/lib/utils/quantity";
import { CustomerPicker } from "@/components/documents/customer-picker";
import { DocumentForm } from "@/components/documents/document-form";
import { LineEditor } from "@/components/documents/line-editor";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { Ltr } from "@/components/shared/bidi";
import { formatNumber } from "@/components/shared/format";
import { Input } from "@/components/ui/input";

/** What can still come back of an invoice line, in base units. */
export interface ReturnableLine { invoiceItemId: string; base: number; factor: number; price: string }

const ZERO = BigInt(0);

export function ReturnForm({ returnId, defaults, customer, invoice, warehouses, products, returnable }: {
  returnId: string | null;
  defaults: ReturnValues;
  customer: CustomerOption | null;
  invoice: { id: string; docNo: string } | null;
  warehouses: WarehouseChoice[];
  products: ProductOption[];
  returnable: ReturnableLine[];
}) {
  const { t, locale } = useI18n();
  const s = t.sales;
  const [chosen, setChosen] = useState(customer);
  const name = (x: { nameEn: string; nameUr: string | null }) => (locale === "ur" && x.nameUr ? x.nameUr : x.nameEn);
  const byLine = new Map(returnable.map((l) => [l.invoiceItemId, l]));
  const factorOf = new Map(products.flatMap((p) => p.units.map((u) => [`${p.id}:${u.unitId}`, u.factor] as const)));

  const limited = returnSchema.superRefine((v, ctx) => {
    // Several lines can share one invoice line (good and damaged), so they are added up.
    const used = new Map<string, bigint>();
    v.lines.forEach((l, i) => {
      const line = byLine.get(l.invoiceItemId);
      if (!line) return;
      const base = (used.get(l.invoiceItemId) ?? ZERO) + (parseQuantity(l.quantity) ?? ZERO) * BigInt(factorOf.get(`${l.productId}:${l.unitId}`) ?? 1);
      used.set(l.invoiceItemId, base);
      if (base > BigInt(line.base)) ctx.addIssue({ code: "custom", message: "tooMuch", path: ["lines", i, "quantity"] });
    });
  });

  return (
    <DocumentForm<ReturnValues>
      defaults={defaults}
      resolver={zodResolver(limited)}
      save={(values) => saveReturnAction(returnId, values)}
      openPath={(id) => `/sales/returns/${id}`}
      cancelPath={returnId ? `/sales/returns/${returnId}` : "/sales/returns"}
    >
      {(form) => {
        const { errors } = form.formState;
        return (
          <>
            <FormSection title={s.customerReturn} description={invoice ? s.returnInvoiceHint : undefined} className="lg:grid-cols-3">
              <Field id="customerId" label={s.customer} required error={errors.customerId?.message}>
                {invoice || returnId
                  ? <Input id="customerId" readOnly value={chosen ? name(chosen) : ""} />
                  : <CustomerPicker id="customerId" value={chosen} onChange={(c) => { setChosen(c); form.setValue("customerId", c.id, { shouldDirty: true, shouldValidate: form.formState.isSubmitted }); }} />}
              </Field>
              <Field id="invoice" label={s.invoiceNo}><Input id="invoice" readOnly dir={invoice ? "ltr" : undefined} value={invoice?.docNo ?? s.withoutInvoice} /></Field>
              <Field id="date" label={t.documents.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" {...form.register("date")} /></Field>
              <Field id="warehouseId" label={s.returnWarehouse} required error={errors.warehouseId?.message}>
                <NativeSelect id="warehouseId" {...form.register("warehouseId")}>
                  <option value="">{t.documents.choose}</option>
                  {warehouses.filter((w) => w.type !== "damaged").map((w) => <option key={w.id} value={w.id}>{name(w)}</option>)}
                </NativeSelect>
              </Field>
              <Field id="damagedWarehouseId" label={s.damagedWarehouse} optional error={errors.damagedWarehouseId?.message}>
                <NativeSelect id="damagedWarehouseId" {...form.register("damagedWarehouseId")}>
                  <option value="">{t.documents.none}</option>
                  {warehouses.filter((w) => w.type === "damaged").map((w) => <option key={w.id} value={w.id}>{name(w)}</option>)}
                </NativeSelect>
              </Field>
              <Field id="reason" label={t.documents.reason} required error={errors.reason?.message}><Input id="reason" {...form.register("reason")} /></Field>
            </FormSection>
            <Lines products={products} invoice={!!invoice} byLine={byLine} />
          </>
        );
      }}
    </DocumentForm>
  );
}

function Lines({ products, invoice, byLine }: { products: ProductOption[]; invoice: boolean; byLine: Map<string, ReturnableLine> }) {
  const { t, locale } = useI18n();
  const s = t.sales;
  const { control } = useFormContext<ReturnValues>();
  useWatch({ control, name: "lines" });
  return (
    <LineEditor
      products={products}
      lockProducts={invoice}
      lockUnits={false}
      columns={[
        { key: "quantity", label: t.documents.quantity, kind: "quantity", showBase: true },
        { key: "condition", label: s.condition, kind: "select", options: CONDITIONS.map((c) => ({ value: c, label: s.conditions[c] })) },
        ...(invoice ? [] : [{ key: "price", label: s.returnPrice, kind: "money" as const }]),
      ]}
      newLine={(product, unit) => ({ productId: product.id, unitId: unit.unitId, invoiceItemId: "", quantity: "", price: unit.salePrice ?? "", condition: "saleable" })}
      amount={invoice ? undefined : (l) => amountOf([l.quantity], l.price)}
      unitChange={invoice ? () => ({}) : undefined}
      info={(l, product) => {
        const line = byLine.get(l.invoiceItemId ?? "");
        const base = product?.units.find((u) => u.unitId === product.baseUnitId);
        return line && base ? (
          <p className="mt-1 text-xs text-muted-foreground">{fill(s.returnable, { quantity: `${isolate(formatNumber(line.base, locale))} ${locale === "ur" && base.nameUr ? base.nameUr : base.nameEn}` })} · <Ltr>{line.price}</Ltr></p>
        ) : null;
      }}
    />
  );
}
