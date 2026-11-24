"use client";

import { useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { WarehouseChoice } from "@/features/catalog/queries";
import type { ProductOption } from "@/features/catalog/types";
import { saveAdjustmentAction } from "@/features/inventory/actions";
import { ADJUSTMENT_KINDS, adjustmentSchema, type AdjustmentValues } from "@/features/inventory/schema";
import { useI18n } from "@/i18n/context";
import { amountOf } from "@/lib/utils/quantity";
import { DocumentForm } from "@/components/documents/document-form";
import { IssueLines } from "@/components/documents/issue-lines";
import { Field, NativeSelect } from "@/components/forms/field";
import { FormSection } from "@/components/forms/form-section";
import { Input } from "@/components/ui/input";

export function AdjustmentForm({ adjustmentId, defaults, warehouses, products, costs }: {
  adjustmentId: string | null;
  defaults: AdjustmentValues;
  warehouses: WarehouseChoice[];
  products: ProductOption[];
  /** Whether the user may see costs; opening stock needs one either way. */
  costs: boolean;
}) {
  const { t, locale } = useI18n();
  const s = t.stock;
  const name = (w: WarehouseChoice) => (locale === "ur" && w.nameUr ? w.nameUr : w.nameEn);
  return (
    <DocumentForm<AdjustmentValues>
      defaults={defaults}
      resolver={zodResolver(adjustmentSchema)}
      save={(values) => saveAdjustmentAction(adjustmentId, values)}
      openPath={(id) => `/inventory/adjustments/${id}`}
      cancelPath={adjustmentId ? `/inventory/adjustments/${adjustmentId}` : "/inventory/adjustments"}
    >
      {(form) => {
        const { errors } = form.formState;
        return (
          <>
            <FormSection title={s.adjustment} className="lg:grid-cols-4">
              <Field id="kind" label={s.kind} required error={errors.kind?.message}>
                <NativeSelect id="kind" {...form.register("kind")}>{ADJUSTMENT_KINDS.map((k) => <option key={k} value={k}>{s.kinds[k]}</option>)}</NativeSelect>
              </Field>
              <Field id="warehouseId" label={t.documents.warehouse} required error={errors.warehouseId?.message}>
                <NativeSelect id="warehouseId" {...form.register("warehouseId")}>
                  <option value="">{t.documents.choose}</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{name(w)}</option>)}
                </NativeSelect>
              </Field>
              <Field id="date" label={t.documents.date} required error={errors.date?.message}><Input id="date" type="date" dir="ltr" {...form.register("date")} /></Field>
              <Reason error={errors.reason?.message}><Input id="reason" {...form.register("reason")} /></Reason>
              <KindHint />
            </FormSection>
            <Lines products={products} costs={costs} />
          </>
        );
      }}
    </DocumentForm>
  );
}

const useKind = () => useWatch<AdjustmentValues, "kind">({ name: "kind" });

function Reason({ error, children }: { error?: string; children: React.ReactNode }) {
  const { t } = useI18n();
  const opening = useKind() === "opening";
  return <Field id="reason" label={t.documents.reason} required={!opening} optional={opening} error={error}>{children}</Field>;
}

function KindHint() {
  const { t } = useI18n();
  return <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">{t.stock.kindHints[useKind()]}</p>;
}

function Lines({ products, costs }: { products: ProductOption[]; costs: boolean }) {
  const { t } = useI18n();
  const kind = useKind();
  const warehouseId = useWatch<AdjustmentValues, "warehouseId">({ name: "warehouseId" });
  const opening = kind === "opening";
  return (
    <IssueLines
      products={products}
      warehouseId={warehouseId}
      outgoing={(line) => kind === "write_off" || (kind === "other" && (line.quantity ?? "").trim().startsWith("-"))}
      quantityLabel={kind === "other" ? t.stock.signedQuantity : undefined}
      extraColumns={[
        ...(opening || (kind === "other" && costs) ? [{ key: "cost", label: t.documents.unitCost, kind: "money" as const }] : []),
        { key: "notes", label: t.documents.notes, kind: "text" },
      ]}
      newLine={(product, unit) => ({ productId: product.id, unitId: unit.unitId, quantity: "", cost: opening ? unit.purchasePrice ?? "" : "", notes: "" })}
      amount={opening ? (l) => amountOf([l.quantity], l.cost) : undefined}
    />
  );
}
