import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { flowOf, flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadBill, loadFlowSuppliers, loadUnbilledReceipts } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { BillForm } from "../../bill-form";

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/bills/[id]/edit">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.documents.edit };
}

export default async function EditBillPage({ params }: PageProps<"/purchasing/[flow]/bills/[id]/edit">) {
  const { flow, id, ctx, t } = await purchasingPage(params);
  if (!can(ctx, "purchasing.create")) return <Forbidden />;
  const bill = await loadBill(id);
  if (!bill || bill.status !== "draft" || flowOf(bill.is_principal ?? false) !== flow) notFound();
  const [suppliers, unbilled] = await Promise.all([loadFlowSuppliers(flow), loadUnbilledReceipts(flow)]);
  const supplierId = bill.supplier_id ?? "";
  const row = (r: { id: string; doc_no: string; receipt_date: string; total_amount: number; supplier_reference?: string | null }) =>
    ({ id: r.id, docNo: r.doc_no, date: r.receipt_date, reference: r.supplier_reference ?? null, supplierId, total: toDbAmount(toPaisa(r.total_amount)) });
  return (
    <>
      <PageHeader title={`${t.documents.edit} ${bill.doc_no}`} breadcrumbs={[{ label: t.purchasing.tabs.bills, href: flowPath(flow, "bills") }]} />
      <BillForm
        flow={flow} billId={id} suppliers={suppliers}
        receipts={[...bill.receipts.map(row), ...unbilled.filter((r) => r.supplier_id === supplierId).map(row)]}
        defaults={{
          supplierId, number: bill.invoice_number ?? "", date: bill.invoice_date ?? "", dueDate: bill.due_date ?? "", notes: bill.notes ?? "",
          amount: toDbAmount(toPaisa(bill.amount ?? 0)), receiptIds: bill.receipts.map((r) => r.id),
        }}
      />
    </>
  );
}
