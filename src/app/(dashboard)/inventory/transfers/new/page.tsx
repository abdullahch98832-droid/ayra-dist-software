import type { Metadata } from "next";
import { loadProductOptions } from "@/features/catalog/product-options";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { businessToday } from "@/features/dashboard/period";
import { inventoryPage, uuidParam } from "@/features/inventory/page-context";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { TransferForm } from "../transfer-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).stock.newTransfer };
}

/** `?to=damaged` prepares a move into the damaged-goods warehouse. */
export default async function NewTransferPage({ searchParams }: PageProps<"/inventory/transfers/new">) {
  const { ctx, t } = await inventoryPage();
  if (!can(ctx, "inventory.transfer")) return <Forbidden />;
  const query = await searchParams;
  const productId = uuidParam(query.product);
  const [warehouses, products] = await Promise.all([loadWarehouseChoices(), productId ? loadProductOptions(ctx, [productId]) : []]);
  const damaged = warehouses.filter((w) => w.type === "damaged");
  const normal = warehouses.filter((w) => w.type === "main");
  const toDamaged = query.to === "damaged";
  return (
    <>
      <PageHeader title={toDamaged ? t.stock.markDamaged : t.stock.newTransfer} breadcrumbs={[{ label: t.stock.tabs.transfers, href: "/inventory/transfers" }]} />
      <TransferForm
        transferId={null} warehouses={warehouses} products={products}
        defaults={{
          fromId: normal.length === 1 ? normal[0]?.id ?? "" : "", toId: toDamaged && damaged.length === 1 ? damaged[0]?.id ?? "" : "", date: businessToday(), notes: "", requestId: crypto.randomUUID(),
          lines: products.map((p) => ({ productId: p.id, unitId: p.baseUnitId, quantity: "" })),
        }}
      />
    </>
  );
}
