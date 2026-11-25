import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { businessToday } from "@/features/dashboard/period";
import { itemName, loadItemCosts, loadJob, loadOrderPurchases } from "@/features/sol/queries";
import { isOpenJob } from "@/features/sol/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { BuyForm } from "./buy-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).distributor.orderFromAyra };
}

export default async function BuyForOrderPage({ params }: PageProps<"/sol/orders/[id]/buy">) {
  const { id, ctx, t, local } = await pageContext(params);
  if (!can(ctx, "sol.manage") || !can(ctx, "purchasing.create")) return <Forbidden />;
  const job = await loadJob(id);
  if (!job || !job.type?.is_order || !isOpenJob(job.status)) notFound();
  const [costs, purchases, warehouses] = await Promise.all([loadItemCosts(ctx, id), loadOrderPurchases(id), loadWarehouseChoices()]);
  // What earlier purchase orders of this order already cover, product by product.
  const covered = new Map<string, number>();
  for (const p of purchases) if (p.status !== "cancelled") for (const i of p.purchase_order_items) covered.set(i.product_id, (covered.get(i.product_id) ?? 0) + (i.base_quantity ?? 0));
  const lines = job.items.filter((l) => l.kind === "product").map((l) => {
    const needed = Number(l.quantity) * l.factor;
    const used = Math.min(covered.get(l.product_id ?? "") ?? 0, needed);
    covered.set(l.product_id ?? "", (covered.get(l.product_id ?? "") ?? 0) - used);
    return { productId: l.product_id ?? "", unitId: l.unit_id ?? "", name: itemName(local, l), sku: l.product?.sku ?? "", unit: l.unit ? local(l.unit.name_en, l.unit.name_ur) : "", needed: Number(l.quantity), left: Math.ceil((needed - used) / l.factor), price: costs.get(l.id) ?? "" };
  });
  const places = warehouses.filter((w) => w.type !== "damaged");
  return (
    <>
      <PageHeader title={t.distributor.orderFromAyra} description={t.distributor.orderFromAyraHint} breadcrumbs={[{ label: t.distributor.tab, href: "/sol/orders" }, { label: job.doc_no, href: `/sol/orders/${id}` }]} />
      <BuyForm
        lines={lines} warehouses={places.map((w) => ({ id: w.id, name: local(w.nameEn, w.nameUr) }))}
        defaults={{ jobId: id, warehouseId: places[0]?.id ?? "", date: businessToday(), expectedDate: "", notes: "", requestId: crypto.randomUUID(), lines: lines.map((l) => ({ productId: l.productId, unitId: l.unitId, quantity: l.left > 0 ? String(l.left) : "", price: l.price })) }}
      />
    </>
  );
}
