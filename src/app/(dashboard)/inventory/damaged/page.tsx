import type { Metadata } from "next";
import { PackageX } from "lucide-react";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { inventoryPage } from "@/features/inventory/page-context";
import { loadDamaged } from "@/features/inventory/queries";
import { flowOf, flowPath } from "@/features/purchasing/flow";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).stock.tabs.damaged };
}

export default async function DamagedPage() {
  const { ctx, t, local } = await inventoryPage();
  if (!can(ctx, "inventory.view")) return <Forbidden />;
  const s = t.stock;
  const [rows, warehouses] = await Promise.all([loadDamaged(ctx), loadWarehouseChoices()]);
  const hasWarehouse = warehouses.some((w) => w.type === "damaged");
  const returns = can(ctx, "purchasing.create");
  const adjust = can(ctx, "inventory.adjust");
  return (
    <>
      <PageHeader
        title={s.tabs.damaged}
        description={s.damagedHint}
        actions={
          <>
            {can(ctx, "reports.view") && <LinkButton variant="outline" href="/reports/damaged">{t.reports.damaged}</LinkButton>}
            {hasWarehouse && can(ctx, "inventory.transfer") && <LinkButton href="/inventory/transfers/new?to=damaged"><PackageX aria-hidden />{s.markDamaged}</LinkButton>}
          </>
        }
      />
      <div className="grid gap-6">
        {!hasWarehouse && <FormAlert tone="info">{s.noDamagedWarehouse}</FormAlert>}
        <SpecTable
          caption={s.tabs.damaged}
          rows={rows.map((r) => ({
            id: `${r.product_id}:${r.warehouse_id}`, product: local(r.product.name_en, r.product.name_ur), sku: r.product.sku, unit: local(r.product.unit.name_en, r.product.unit.name_ur),
            warehouse: local(r.warehouse.name_en, r.warehouse.name_ur), quantity: r.on_hand,
            writeOff: s.writeOff, writeOffHref: `/inventory/adjustments/new?kind=write_off&warehouse=${r.warehouse_id}&product=${r.product_id}`,
            back: s.returnToSupplier, backHref: `${flowPath(flowOf(r.fromCompany), "returns", "new")}?warehouse=${r.warehouse_id}&product=${r.product_id}${r.supplierId ? `&supplier=${r.supplierId}` : ""}`,
          }))}
          columns={[
            { key: "product", sub: "sku", label: t.documents.product, kind: "text", primary: true },
            { key: "warehouse", label: t.documents.warehouse, kind: "text" },
            { key: "quantity", sub: "unit", label: s.onHand, kind: "quantity" },
            ...(returns ? [{ key: "back", label: s.returnToSupplier, kind: "link" as const }] : []),
            ...(adjust ? [{ key: "writeOff", label: s.writeOff, kind: "link" as const }] : []),
          ]}
          searchKeys={["product", "sku"]}
          empty={{ title: s.damagedEmpty }}
        />
      </div>
    </>
  );
}
