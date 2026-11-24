import type { Metadata } from "next";
import { loadCustomerOption } from "@/features/customers/queries";
import { businessToday } from "@/features/dashboard/period";
import { loadOpenInvoices, loadReceivingAccounts } from "@/features/receivables/queries";
import { HELD } from "@/features/receivables/schema";
import { loadTakers } from "@/features/takers/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext, uuidParam } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { PaymentForm } from "../payment-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).receivables.newPayment };
}

export default async function NewPaymentPage({ searchParams }: PageProps<"/receivables/payments/new">) {
  const { ctx, t } = await pageContext();
  if (!can(ctx, "receivables.collect")) return <Forbidden />;
  const query = await searchParams;
  const customer = await loadCustomerOption(uuidParam(query.customer));
  const [invoices, accounts, takers] = await Promise.all([customer ? loadOpenInvoices(customer.id) : [], loadReceivingAccounts(), loadTakers()]);
  const poster = can(ctx, "receivables.post");
  // Order takers collect in their own name and hold the cash until it is deposited.
  const collector = !poster && !can(ctx, "sales.view_all") ? ctx.employeeId : null;
  const active = takers.filter((x) => x.isActive);
  const invoice = invoices.find((i) => i.id === query.invoice);
  const isTaker = ctx.employeeId !== null && active.some((x) => x.id === ctx.employeeId);
  return (
    <>
      <PageHeader title={t.receivables.newPayment} breadcrumbs={[{ label: t.receivables.tabs.payments, href: "/receivables/payments" }]} />
      <PaymentForm
        customer={customer} invoices={invoices} accounts={accounts} takers={collector ? active.filter((x) => x.id === collector) : active} collector={collector} poster={poster} me={ctx.employeeId}
        defaults={{
          customerId: customer?.id ?? "", date: businessToday(), amount: invoice?.outstanding ?? "", method: "cash", destination: collector && isTaker ? HELD : accounts.length === 1 ? accounts[0]?.id ?? "" : "",
          collectedBy: collector ?? active.find((x) => x.id === customer?.orderTakerId)?.id ?? "", reference: "", notes: "", requestId: crypto.randomUUID(),
          allocations: invoices.map((i) => ({ invoiceId: i.id, amount: i.id === invoice?.id ? i.outstanding : "" })),
        }}
      />
    </>
  );
}
