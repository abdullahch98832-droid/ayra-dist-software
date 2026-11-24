import type { loadMovements } from "@/features/inventory/queries";
import type { Dictionary } from "@/i18n";
import { SpecTable } from "@/components/tables/spec-table";

/** Stock movements, shared by the inventory tab and the report. */
export function MovementsTable({ t, local, rows, costs, toolbar, server, exportName }: {
  t: Dictionary;
  local: (en: string, ur: string | null | undefined) => string;
  rows: Awaited<ReturnType<typeof loadMovements>>["rows"];
  costs: boolean;
  toolbar?: React.ReactNode;
  server?: React.ComponentProps<typeof SpecTable>["server"];
  exportName?: string;
}) {
  const s = t.stock;
  const types = s.movementTypes as Record<string, string>;
  return (
    <SpecTable
      caption={s.tabs.movements}
      rows={rows.map((m) => ({
        id: String(m.id), date: m.movement_date, product: local(m.name_en, m.name_ur), sku: m.sku, warehouse: local(m.warehouse_en, m.warehouse_ur), type: m.movement_type,
        doc: m.doc_no, quantity: m.quantity, unit: local(m.unit_en, m.unit_ur), balance: m.balance_after, value: m.value_change, override: m.negative_override ? "yes" : null, by: m.created_by_name,
      }))}
      columns={[
        { key: "date", label: t.documents.date, kind: "date" },
        { key: "product", sub: "sku", label: t.documents.product, kind: "text", primary: true },
        { key: "warehouse", label: t.documents.warehouse, kind: "text", hideBelow: "lg" },
        { key: "type", label: s.kind, kind: "status", options: Object.fromEntries(Object.entries(types).map(([k, label]) => [k, { label, tone: "gray" as const }])) },
        { key: "doc", label: t.documents.number, kind: "code", hideBelow: "lg" },
        { key: "quantity", sub: "unit", label: t.documents.quantity, kind: "quantity" },
        { key: "balance", label: s.balanceAfter, kind: "quantity" },
        ...(costs ? [{ key: "value", label: s.valueChange, kind: "money" as const, hideBelow: "xl" as const }] : []),
        ...(rows.some((m) => m.negative_override) ? [{ key: "override", label: s.overrideUsed, kind: "status" as const, options: { yes: { label: s.overrideUsed, tone: "amber" as const } } }] : []),
        { key: "by", label: s.movedBy, kind: "text", hideBelow: "2xl" },
      ]}
      toolbar={toolbar}
      server={server}
      exportName={exportName}
      empty={{ title: s.noMovements }}
    />
  );
}
