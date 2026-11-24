import type { Metadata } from "next";
import { businessToday } from "@/features/dashboard/period";
import { flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadFlowSuppliers, loadUnbilledReceipts } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { BillForm } from "../bill-form";

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/bills/new">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.purchasing.newBill };
}

export default async function NewBillPage({ params, searchParams }: PageProps<"/purchasing/[flow]/bills/new">) {
  const { flow, ctx, t } = await purchasingPage(params);
  if (!can(ctx, "purchasing.create")) return <Forbidden />;
  const query = await searchParams;
  const [suppliers, receipts] = await Promise.all([loadFlowSuppliers(flow), loadUnbilledReceipts(flow)]);
  const chosen = receipts.find((r) => r.id === query.receipt);
  const supplierId = chosen?.supplier_id ?? suppliers.find((s) => s.id === query.supplier)?.id ?? (suppliers.length === 1 ? suppliers[0]?.id ?? "" : "");
  return (
    <>
      <PageHeader title={t.purchasing.newBill} description={t.purchasing.flows[flow]} breadcrumbs={[{ label: t.purchasing.tabs.bills, href: flowPath(flow, "bills") }]} />
      <BillForm
        flow={flow} billId={null} suppliers={suppliers}
        receipts={receipts.map((r) => ({ id: r.id, docNo: r.doc_no, date: r.receipt_date, reference: r.supplier_reference, supplierId: r.supplier_id, total: toDbAmount(toPaisa(r.total_amount)) }))}
        defaults={{
          supplierId, number: "", date: businessToday(), dueDate: "", notes: "",
          amount: chosen ? toDbAmount(toPaisa(chosen.total_amount)) : "", receiptIds: chosen ? [chosen.id] : [],
        }}
      />
    </>
  );
}
