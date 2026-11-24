"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { WarehouseChoice } from "@/features/catalog/queries";
import type { ProductOption } from "@/features/catalog/types";
import { saveOrderAction } from "@/features/purchasing/actions";
import { flowPath, type Flow } from "@/features/purchasing/flow";
import type { FlowSupplier } from "@/features/purchasing/queries";
import { orderSchema, type OrderValues } from "@/features/purchasing/schema";
import { useI18n } from "@/i18n/context";
import { amountOf } from "@/lib/utils/quantity";
import { DocumentForm } from "@/components/documents/document-form";
import { LineEditor } from "@/components/documents/line-editor";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function OrderForm({ flow, orderId, defaults, suppliers, warehouses, products }: {
  flow: Flow;
  orderId: string | null;
  defaults: OrderValues;
  suppliers: FlowSupplier[];
  warehouses: WarehouseChoice[];
  products: ProductOption[];
}) {
  const { t, locale } = useI18n();
  const d = t.documents;
  const name = (x: { nameEn: string; nameUr: string | null }) => (locale === "ur" && x.nameUr ? x.nameUr : x.nameEn);
  return (
    <DocumentForm<OrderValues>
      defaults={defaults}
      resolver={zodResolver(orderSchema)}
      save={(values) => saveOrderAction(orderId, values)}
      openPath={(id) => flowPath(flow, "orders", id)}
      cancelPath={orderId ? flowPath(flow, "orders", orderId) : flowPath(flow, "orders")}
    >
      {(form) => {
        const { errors } = form.formState;
        return (
          <>
            <FormSection title={t.purchasing.order} className="lg:grid-cols-4">
              <Field id="supplierId" label={d.supplier} required error={errors.supplierId?.message}>
                <NativeSelect id="supplierId" {...form.register("supplierId")}>
                  {suppliers.length !== 1 && <option value="">{d.choose}</option>}
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
                </NativeSelect>
              </Field>
              <Field id="warehouseId" label={d.warehouse} required error={errors.warehouseId?.message}>
                <NativeSelect id="warehouseId" {...form.register("warehouseId")}>
                  <option value="">{d.choose}</option>
                  {warehouses.filter((w) => w.type !== "damaged").map((w) => <option key={w.id} value={w.id}>{name(w)}</option>)}
                </NativeSelect>
              </Field>
              <Field id="date" label={d.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" {...form.register("date")} /></Field>
              <Field id="expectedDate" label={t.purchasing.expectedDate} optional error={errors.expectedDate?.message}><Input id="expectedDate" type="date" dir="ltr" {...form.register("expectedDate")} /></Field>
              <Field id="notes" label={d.notes} optional className="sm:col-span-2 lg:col-span-4" error={errors.notes?.message}><Textarea id="notes" rows={2} {...form.register("notes")} /></Field>
            </FormSection>
            <LineEditor
              products={products}
              columns={[{ key: "quantity", label: d.quantity, kind: "quantity", showBase: true }, { key: "price", label: d.unitCost, kind: "money" }]}
              newLine={(product, unit) => ({ productId: product.id, unitId: unit.unitId, quantity: "", price: unit.purchasePrice ?? "" })}
              amount={(l) => amountOf([l.quantity], l.price)}
            />
          </>
        );
      }}
    </DocumentForm>
  );
}
