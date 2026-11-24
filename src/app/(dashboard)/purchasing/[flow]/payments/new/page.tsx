import type { Metadata } from "next";
import { businessToday } from "@/features/dashboard/period";
import { accountPay, flowPath } from "@/features/purchasing/flow";
import { purchasingPage } from "@/features/purchasing/page-context";
import { loadBalances, loadFinancialAccounts, loadFlowSuppliers, loadUnpaidBills } from "@/features/purchasing/queries";
import { can } from "@/lib/auth/session";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { PaymentForm } from "../payment-form";

export async function generateMetadata({ params }: PageProps<"/purchasing/[flow]/payments/new">): Promise<Metadata> {
  return { title: (await purchasingPage(params)).t.purchasing.newPayment };
}

export default async function NewPaymentPage({ params, searchParams }: PageProps<"/purchasing/[flow]/payments/new">) {
  const { flow, ctx, t } = await purchasingPage(params);
  if (!can(ctx, accountPay(flow))) return <Forbidden />;
  const query = await searchParams;
  const [suppliers, accounts, unpaid, balances] = await Promise.all([loadFlowSuppliers(flow), loadFinancialAccounts(), loadUnpaidBills(flow), loadBalances(flow)]);
  const bills = unpaid.map((b) => ({
    id: b.supplier_invoice_id ?? "", supplierId: b.supplier_id ?? "", number: b.invoice_number ?? "", date: b.invoice_date ?? "", dueDate: b.due_date,
    outstanding: toDbAmount(toPaisa(b.outstanding ?? 0)),
  }));
  const bill = bills.find((b) => b.id === query.bill);
  const supplierId = bill?.supplierId ?? suppliers.find((s) => s.id === query.supplier)?.id ?? (suppliers.length === 1 ? suppliers[0]?.id ?? "" : "");
  return (
    <>
      <PageHeader title={t.purchasing.newPayment} description={t.purchasing.flows[flow]} breadcrumbs={[{ label: t.purchasing.tabs.payments, href: flowPath(flow, "payments") }]} />
      <PaymentForm
        flow={flow} suppliers={suppliers} accounts={accounts} bills={bills} balances={balances}
        defaults={{
          supplierId, date: businessToday(), amount: bill?.outstanding ?? "", accountId: accounts.length === 1 ? accounts[0]?.id ?? "" : "", method: "cash", reference: "", notes: "", requestId: crypto.randomUUID(),
          allocations: bills.filter((b) => b.supplierId === supplierId).map((b) => ({ billId: b.id, amount: b.id === bill?.id ? b.outstanding : "" })),
        }}
      />
    </>
  );
}
