"use client";

import { useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { WarehouseChoice } from "@/features/catalog/queries";
import type { ProductOption } from "@/features/catalog/types";
import { saveTransferAction } from "@/features/inventory/actions";
import { transferSchema, type TransferValues } from "@/features/inventory/schema";
import { useI18n } from "@/i18n/context";
import { DocumentForm } from "@/components/documents/document-form";
import { IssueLines } from "@/components/documents/issue-lines";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { Input } from "@/components/ui/input";

export function TransferForm({ transferId, defaults, warehouses, products }: {
  transferId: string | null;
  defaults: TransferValues;
  warehouses: WarehouseChoice[];
  products: ProductOption[];
}) {
  const { t, locale } = useI18n();
  const s = t.stock;
  const name = (w: WarehouseChoice) => (locale === "ur" && w.nameUr ? w.nameUr : w.nameEn);
  const options = (
    <>
      <option value="">{t.documents.choose}</option>
      {warehouses.map((w) => <option key={w.id} value={w.id}>{name(w)}</option>)}
    </>
  );
  return (
    <DocumentForm<TransferValues>
      defaults={defaults}
      resolver={zodResolver(transferSchema)}
      save={(values) => saveTransferAction(transferId, values)}
      openPath={(id) => `/inventory/transfers/${id}`}
      cancelPath={transferId ? `/inventory/transfers/${transferId}` : "/inventory/transfers"}
    >
      {(form) => {
        const { errors } = form.formState;
        return (
          <>
            <FormSection title={s.transfer} className="lg:grid-cols-4">
              <Field id="fromId" label={s.fromWarehouse} required error={errors.fromId?.message}><NativeSelect id="fromId" {...form.register("fromId")}>{options}</NativeSelect></Field>
              <Field id="toId" label={s.toWarehouse} required error={errors.toId?.message}><NativeSelect id="toId" {...form.register("toId")}>{options}</NativeSelect></Field>
              <Field id="date" label={t.documents.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" {...form.register("date")} /></Field>
              <Field id="notes" label={t.documents.notes} optional error={errors.notes?.message}><Input id="notes" {...form.register("notes")} /></Field>
            </FormSection>
            <Lines products={products} />
          </>
        );
      }}
    </DocumentForm>
  );
}

function Lines({ products }: { products: ProductOption[] }) {
  const fromId = useWatch<TransferValues, "fromId">({ name: "fromId" });
  return <IssueLines products={products} warehouseId={fromId} />;
}
