"use client";

import { useEffect, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { WarehouseChoice } from "@/features/catalog/queries";
import type { ProductOption } from "@/features/catalog/types";
import { customerSummaryAction } from "@/features/customers/actions";
import type { CustomerOption } from "@/features/customers/schema";
import { saveOrderAction } from "@/features/sales/actions";
import { orderSchema, type OrderValues } from "@/features/sales/schema";
import { useI18n } from "@/i18n/context";
import { fill, isolate } from "@/i18n/format";
import { formatPaisa, parseRupees, sumPaisa, toPaisa, type Paisa } from "@/lib/utils/money";
import { amountOf } from "@/lib/utils/quantity";
import { CustomerPicker } from "@/components/documents/customer-picker";
import { DocumentForm } from "@/components/documents/document-form";
import { IssueLines } from "@/components/documents/issue-lines";
import type { LineValues } from "@/components/documents/line-editor";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const ZERO = BigInt(0);
const rupees = (text: string | undefined): Paisa => {
  try {
    return (text ?? "").trim() === "" ? ZERO : parseRupees(text ?? "");
  } catch {
    return ZERO;
  }
};

export function OrderForm({ orderId, defaults, customer, warehouses, products, takers, fixedTaker }: {
  orderId: string | null;
  defaults: OrderValues;
  customer: CustomerOption | null;
  warehouses: WarehouseChoice[];
  products: ProductOption[];
  takers: { id: string; nameEn: string; nameUr: string | null }[];
  /** Order takers sell in their own name. */
  fixedTaker: boolean;
}) {
  const { t, locale } = useI18n();
  const s = t.sales;
  const [chosen, setChosen] = useState(customer);
  const name = (x: { nameEn: string; nameUr: string | null }) => (locale === "ur" && x.nameUr ? x.nameUr : x.nameEn);
  return (
    <DocumentForm<OrderValues>
      defaults={defaults}
      resolver={zodResolver(orderSchema)}
      save={(values) => saveOrderAction(orderId, values)}
      openPath={(id) => `/sales/orders/${id}`}
      cancelPath={orderId ? `/sales/orders/${orderId}` : "/sales/orders"}
    >
      {(form) => {
        const { errors } = form.formState;
        return (
          <>
            <FormSection title={s.order} className="lg:grid-cols-4">
              <Field id="customerId" label={s.customer} required className="sm:col-span-2" error={errors.customerId?.message}>
                <CustomerPicker
                  id="customerId" value={chosen}
                  onChange={(c) => {
                    setChosen(c);
                    form.setValue("customerId", c.id, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
                    if (!fixedTaker && c.orderTakerId && takers.some((x) => x.id === c.orderTakerId)) form.setValue("orderTakerId", c.orderTakerId, { shouldDirty: true });
                  }}
                />
              </Field>
              {!fixedTaker && (
                <Field id="orderTakerId" label={s.orderTaker} optional error={errors.orderTakerId?.message}>
                  <NativeSelect id="orderTakerId" {...form.register("orderTakerId")}>
                    <option value="">{t.customers.noOrderTaker}</option>
                    {takers.map((x) => <option key={x.id} value={x.id}>{name(x)}</option>)}
                  </NativeSelect>
                </Field>
              )}
              <Field id="warehouseId" label={t.documents.warehouse} required error={errors.warehouseId?.message}>
                <NativeSelect id="warehouseId" {...form.register("warehouseId")}>
                  <option value="">{t.documents.choose}</option>
                  {warehouses.filter((w) => w.type !== "damaged").map((w) => <option key={w.id} value={w.id}>{name(w)}</option>)}
                </NativeSelect>
              </Field>
              <Field id="date" label={s.orderDate} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" {...form.register("date")} /></Field>
              <Field id="requiredDate" label={s.deliveryDate} optional error={errors.requiredDate?.message}><Input id="requiredDate" type="date" dir="ltr" {...form.register("requiredDate")} /></Field>
              <Field id="notes" label={t.documents.notes} optional className="sm:col-span-2" error={errors.notes?.message}><Textarea id="notes" rows={2} {...form.register("notes")} /></Field>
              <Credit />
            </FormSection>
            <Lines products={products} />
            <p className="text-sm text-muted-foreground">{s.beforeTax}</p>
          </>
        );
      }}
    </DocumentForm>
  );
}

const lineAmount = (l: LineValues): Paisa | null => {
  const gross = amountOf([l.quantity], l.price);
  return gross === null ? null : gross - rupees(l.discount);
};

function Lines({ products }: { products: ProductOption[] }) {
  const { t, locale } = useI18n();
  const s = t.sales;
  const warehouseId = useWatch<OrderValues, "warehouseId">({ name: "warehouseId" });
  const gross = (lines: LineValues[]) => sumPaisa(lines.map((l) => amountOf([l.quantity], l.price) ?? ZERO));
  return (
    <IssueLines
      products={products}
      warehouseId={warehouseId}
      extraColumns={[
        {
          key: "price", label: t.documents.unitPrice, kind: "money",
          warn: (line, product) => {
            const list = product?.units.find((u) => u.unitId === line.unitId)?.salePrice;
            return list && (line.price ?? "").trim() !== "" && rupees(line.price) !== toPaisa(list) ? fill(s.listPrice, { amount: isolate(formatPaisa(toPaisa(list), locale)) }) : undefined;
          },
        },
        { key: "discount", label: s.discount, kind: "money" },
      ]}
      newLine={(product, unit) => ({ productId: product.id, unitId: unit.unitId, quantity: "", price: unit.salePrice ?? "", discount: "" })}
      amount={lineAmount}
      totals={(lines) => {
        const discount = sumPaisa(lines.map((l) => rupees(l.discount)));
        return discount > ZERO ? [{ label: s.gross, value: gross(lines) }, { label: s.totalDiscount, value: -discount }] : [];
      }}
    />
  );
}

/** Credit left for the chosen shop, compared with the order as it is typed. */
function Credit() {
  const { t, locale } = useI18n();
  const { control } = useFormContext<OrderValues>();
  const customerId = useWatch({ control, name: "customerId" });
  const lines = useWatch({ control, name: "lines" }) as unknown as LineValues[] | undefined;
  const [credit, setCredit] = useState<{ customerId: string; available: string | undefined } | null>(null);
  useEffect(() => {
    if (!customerId) return;
    let current = true;
    customerSummaryAction(customerId).then((r) => { if (current) setCredit({ customerId, available: r?.credit_available }); }).catch(() => undefined);
    return () => { current = false; };
  }, [customerId]);
  if (!credit || credit.customerId !== customerId || credit.available === undefined) return null;
  const available = toPaisa(credit.available);
  const total = sumPaisa((lines ?? []).map((l) => lineAmount(l) ?? ZERO));
  const over = total > available;
  return (
    <p className={`text-sm sm:col-span-2 lg:col-span-4 ${over ? "font-medium text-warning" : "text-muted-foreground"}`} role={over ? "status" : undefined}>
      {fill(over ? t.sales.overLimit : t.sales.creditAvailable, { amount: isolate(formatPaisa(available, locale)) })}
    </p>
  );
}
