import type { Metadata } from "next";
import { loadProductOptions } from "@/features/catalog/product-options";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { loadCustomerOption } from "@/features/customers/queries";
import { businessToday } from "@/features/dashboard/period";
import { loadInvoice, loadReturnedQuantities } from "@/features/sales/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext, uuidParam } from "@/lib/page-context";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/states";
import { ReturnForm } from "../return-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sales.newReturn };
}

export default async function NewReturnPage({ searchParams }: PageProps<"/sales/returns/new">) {
  const { ctx, t, locale } = await pageContext();
  if (!can(ctx, "sales.return")) return <Forbidden />;
  const query = await searchParams;
  const invoiceId = uuidParam(query.invoice);
  const invoice = invoiceId ? await loadInvoice(ctx, invoiceId) : null;
  const [warehouses, customer, returned, products] = await Promise.all([
    loadWarehouseChoices(), loadCustomerOption(invoice?.customer_id ?? uuidParam(query.customer)),
    loadReturnedQuantities(invoice?.sales_invoice_items.map((l) => l.id) ?? []), loadProductOptions(ctx, invoice?.sales_invoice_items.map((l) => l.product_id) ?? []),
  ]);
  const normal = warehouses.filter((w) => w.type === "main");
  const damaged = warehouses.filter((w) => w.type === "damaged");
  const left = (invoice?.sales_invoice_items ?? []).map((l) => ({ ...l, left: (l.base_quantity ?? 0) - (returned.get(l.id) ?? 0) })).filter((l) => l.left > 0);
  return (
    <>
      <PageHeader title={t.sales.newReturn} breadcrumbs={[{ label: t.sales.tabs.returns, href: "/sales/returns" }]} />
      {invoice && left.length === 0 ? <EmptyState title={t.sales.nothingReturnable} /> : (
        <ReturnForm
          returnId={null} customer={customer} invoice={invoice ? { id: invoice.id, docNo: invoice.doc_no } : null} warehouses={warehouses} products={products}
          returnable={left.map((l) => ({ invoiceItemId: l.id, base: l.left, factor: l.factor, price: formatPaisa(toPaisa(l.unit_price), locale) }))}
          defaults={{
            customerId: customer?.id ?? "", invoiceId: invoice?.id ?? "", warehouseId: invoice?.warehouse_id ?? (normal.length === 1 ? normal[0]?.id ?? "" : ""),
            damagedWarehouseId: damaged.length === 1 ? damaged[0]?.id ?? "" : "", date: businessToday(), reason: "", requestId: crypto.randomUUID(),
            lines: left.map((l) => ({ invoiceItemId: l.id, productId: l.product_id, unitId: l.unit_id, quantity: "", price: "", condition: "saleable" as const })),
          }}
        />
      )}
    </>
  );
}
