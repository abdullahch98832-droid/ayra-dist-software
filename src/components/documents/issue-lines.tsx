"use client";

import type { ProductOption, UnitOption } from "@/features/catalog/types";
import { useI18n } from "@/i18n/context";
import { fill, isolate } from "@/i18n/format";
import { parseQuantity } from "@/lib/utils/quantity";
import { formatNumber } from "@/components/shared/format";
import { LineEditor, type LineColumn, type LineValues } from "./line-editor";

const ZERO = BigInt(0);

/** Lines that take stock out of a warehouse: shows what is available there and warns beyond it. */
export function IssueLines({ products, warehouseId, extraColumns = [], newLine, amount, quantityLabel, totals, outgoing = () => true }: {
  products: ProductOption[];
  warehouseId: string;
  extraColumns?: LineColumn[];
  newLine?: (product: ProductOption, unit: UnitOption) => LineValues;
  amount?: React.ComponentProps<typeof LineEditor>["amount"];
  quantityLabel?: string;
  totals?: React.ComponentProps<typeof LineEditor>["totals"];
  /** Whether a line takes stock out (other adjustments may also add). */
  outgoing?: (line: LineValues) => boolean;
}) {
  const { t, locale } = useI18n();
  const availableOf = (product: ProductOption | undefined) => (product?.available && warehouseId ? product.available[warehouseId] ?? 0 : null);
  return (
    <LineEditor
      products={products}
      columns={[
        {
          key: "quantity", label: quantityLabel ?? t.documents.quantity, kind: "quantity", showBase: true,
          warn: (line, product) => {
            const available = availableOf(product);
            const entered = parseQuantity(line.quantity);
            const factor = product?.units.find((u) => u.unitId === line.unitId)?.factor ?? 1;
            if (available === null || entered === null || !outgoing(line)) return undefined;
            const taken = (entered < ZERO ? -entered : entered) * BigInt(factor);
            return taken > BigInt(available) ? fill(t.stock.belowZeroWarning, { quantity: isolate(formatNumber(available, locale)) }) : undefined;
          },
        },
        ...extraColumns,
      ]}
      newLine={newLine ?? ((product, unit) => ({ productId: product.id, unitId: unit.unitId, quantity: "" }))}
      amount={amount}
      totals={totals}
      info={(_, product) => {
        const available = availableOf(product);
        const base = product?.units.find((u) => u.unitId === product.baseUnitId);
        return available === null || !base ? null : (
          <p className="mt-1 text-xs text-muted-foreground">{t.stock.available}: {isolate(formatNumber(available, locale))} {locale === "ur" && base.nameUr ? base.nameUr : base.nameEn}</p>
        );
      }}
    />
  );
}
