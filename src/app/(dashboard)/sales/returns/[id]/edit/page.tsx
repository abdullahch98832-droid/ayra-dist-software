import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadProductOptions } from "@/features/catalog/product-options";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { loadCustomerOption } from "@/features/customers/queries";
import { loadInvoice, loadReturn, loadReturnedQuantities } from "@/features/sales/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { formatPaisa, toDbAmount, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { ReturnForm } from "../../return-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sales.editReturn };
}

export default async function EditReturnPage({ params }: PageProps<"/sales/returns/[id]/edit">) {
  const { id, ctx, t, locale } = await pageContext(params);
  if (!can(ctx, "sales.return")) return <Forbidden />;
  const doc = await loadReturn(id);
  if (!doc || doc.status !== "draft") notFound();
  const invoice = doc.sales_invoice_id ? await loadInvoice(ctx, doc.sales_invoice_id) : null;
  const [warehouses, customer, returned, products] = await Promise.all([
    loadWarehouseChoices(), loadCustomerOption(doc.customer_id), loadReturnedQuantities(invoice?.sales_invoice_items.map((l) => l.id) ?? []),
    loadProductOptions(ctx, [...doc.customer_return_items.map((l) => l.product_id), ...(invoice?.sales_invoice_items.map((l) => l.product_id) ?? [])]),
  ]);
  const left = (invoice?.sales_invoice_items ?? []).map((l) => ({ ...l, left: (l.base_quantity ?? 0) - (returned.get(l.id) ?? 0) })).filter((l) => l.left > 0);
  const kept = new Set(doc.customer_return_items.map((l) => l.sales_invoice_item_id));
  return (
    <>
      <PageHeader title={`${t.sales.editReturn} ${doc.doc_no}`} breadcrumbs={[{ label: t.sales.tabs.returns, href: "/sales/returns" }]} />
      <ReturnForm
        returnId={id} customer={customer} invoice={invoice ? { id: invoice.id, docNo: invoice.doc_no } : null} warehouses={warehouses} products={products}
        returnable={left.map((l) => ({ invoiceItemId: l.id, base: l.left, factor: l.factor, price: formatPaisa(toPaisa(l.unit_price), locale) }))}
        defaults={{
          customerId: doc.customer_id, invoiceId: doc.sales_invoice_id ?? "", warehouseId: doc.warehouse_id, damagedWarehouseId: doc.damaged_warehouse_id ?? "", date: doc.return_date, reason: doc.reason ?? "",
          requestId: crypto.randomUUID(),
          lines: [
            ...doc.customer_return_items.map((l) => ({ invoiceItemId: l.sales_invoice_item_id ?? "", productId: l.product_id, unitId: l.unit_id, quantity: String(l.quantity), price: l.sales_invoice_item_id ? "" : toDbAmount(toPaisa(l.unit_price)), condition: l.condition })),
            ...left.filter((l) => !kept.has(l.id)).map((l) => ({ invoiceItemId: l.id, productId: l.product_id, unitId: l.unit_id, quantity: "", price: "", condition: "saleable" as const })),
          ],
        }}
      />
    </>
  );
}
