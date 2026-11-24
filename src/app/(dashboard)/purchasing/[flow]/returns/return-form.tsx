"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { WarehouseChoice } from "@/features/catalog/queries";
import type { ProductOption } from "@/features/catalog/types";
import { saveReturnAction } from "@/features/purchasing/actions";
import { flowPath, type Flow } from "@/features/purchasing/flow";
import type { FlowSupplier } from "@/features/purchasing/queries";
import { returnSchema, type ReturnValues } from "@/features/purchasing/schema";
import { useI18n } from "@/i18n/context";
import { amountOf } from "@/lib/utils/quantity";
import { DocumentForm } from "@/components/documents/document-form";
import { LineEditor } from "@/components/documents/line-editor";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { Input } from "@/components/ui/input";

export function ReturnForm({ flow, returnId, defaults, suppliers, warehouses, products }: {
  flow: Flow;
  returnId: string | null;
  defaults: ReturnValues;
  suppliers: FlowSupplier[];
  warehouses: WarehouseChoice[];
  products: ProductOption[];
}) {
  const { t, locale } = useI18n();
  const d = t.documents;
  const name = (x: { nameEn: string; nameUr: string | null }) => (locale === "ur" && x.nameUr ? x.nameUr : x.nameEn);
  return (
    <DocumentForm<ReturnValues>
      defaults={defaults}
      resolver={zodResolver(returnSchema)}
      save={(values) => saveReturnAction(returnId, values)}
      openPath={(id) => flowPath(flow, "returns", id)}
      cancelPath={returnId ? flowPath(flow, "returns", returnId) : flowPath(flow, "returns")}
    >
      {(form) => {
        const { errors } = form.formState;
        return (
          <>
            <FormSection title={t.purchasing.supplierReturn} className="lg:grid-cols-4">
              <Field id="supplierId" label={d.supplier} required error={errors.supplierId?.message}>
                <NativeSelect id="supplierId" {...form.register("supplierId")}>
                  {suppliers.length !== 1 && <option value="">{d.choose}</option>}
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
                </NativeSelect>
              </Field>
              <Field id="warehouseId" label={t.purchasing.returnWarehouse} required error={errors.warehouseId?.message}>
                <NativeSelect id="warehouseId" {...form.register("warehouseId")}>
                  <option value="">{d.choose}</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{name(w)}</option>)}
                </NativeSelect>
              </Field>
              <Field id="date" label={d.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" {...form.register("date")} /></Field>
              <Field id="reason" label={d.reason} optional error={errors.reason?.message}><Input id="reason" {...form.register("reason")} /></Field>
            </FormSection>
            <LineEditor
              products={products}
              columns={[{ key: "quantity", label: d.quantity, kind: "quantity", showBase: true }, { key: "price", label: t.purchasing.creditPrice, kind: "money" }]}
              newLine={(product, unit) => ({ productId: product.id, unitId: unit.unitId, quantity: "", price: unit.purchasePrice ?? "" })}
              amount={(l) => amountOf([l.quantity], l.price)}
            />
          </>
        );
      }}
    </DocumentForm>
  );
}
