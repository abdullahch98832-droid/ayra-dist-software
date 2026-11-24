import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadProductOptions } from "@/features/catalog/product-options";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { inventoryPage } from "@/features/inventory/page-context";
import { loadTransfer } from "@/features/inventory/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { TransferForm } from "../../transfer-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).documents.edit };
}

export default async function EditTransferPage({ params }: PageProps<"/inventory/transfers/[id]/edit">) {
  const { id, ctx, t } = await inventoryPage(params);
  if (!can(ctx, "inventory.transfer")) return <Forbidden />;
  const doc = await loadTransfer(id);
  if (!doc || doc.status !== "draft") notFound();
  const [warehouses, products] = await Promise.all([loadWarehouseChoices(), loadProductOptions(ctx, doc.stock_transfer_items.map((l) => l.product_id))]);
  return (
    <>
      <PageHeader title={`${t.documents.edit} ${doc.doc_no}`} breadcrumbs={[{ label: t.stock.tabs.transfers, href: "/inventory/transfers" }]} />
      <TransferForm
        transferId={id} warehouses={warehouses} products={products}
        defaults={{
          fromId: doc.from_warehouse_id, toId: doc.to_warehouse_id, date: doc.transfer_date, notes: doc.notes ?? "", requestId: crypto.randomUUID(),
          lines: doc.stock_transfer_items.map((l) => ({ productId: l.product_id, unitId: l.unit_id, quantity: String(l.quantity) })),
        }}
      />
    </>
  );
}
