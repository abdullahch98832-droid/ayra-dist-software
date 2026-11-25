import type { Metadata } from "next";
import { loadCustomerOption } from "@/features/customers/queries";
import { businessToday } from "@/features/dashboard/period";
import { loadOrderTypeId, loadStaff } from "@/features/sol/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext, uuidParam } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { JobForm } from "../../jobs/job-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).distributor.new };
}

export default async function NewDistributorOrderPage({ searchParams }: PageProps<"/sol/orders/new">) {
  const { ctx, t } = await pageContext();
  if (!can(ctx, "sol.manage")) return <Forbidden />;
  const customerId = uuidParam((await searchParams).customer);
  const [customer, typeId, staff] = await Promise.all([customerId ? loadCustomerOption(customerId) : null, loadOrderTypeId(), loadStaff()]);
  return (
    <>
      <PageHeader title={t.distributor.new} description={t.distributor.hint} breadcrumbs={[{ label: t.distributor.tab, href: "/sol/orders" }]} />
      <JobForm
        order jobId={null} customer={customer} lockClient={false} types={[]} staff={staff.filter((x) => x.isActive)} services={[]} products={[]} seesCosts={can(ctx, "costs.view")} canAddClient={can(ctx, "customers.manage")} delivered={[]}
        defaults={{
          customerId: customer?.id ?? "", typeId, contactName: "", contactPhone: "", address: "", description: "", contract: "0", responsibleId: "", date: businessToday(), startDate: "", dueDate: "", notes: "", requestId: crypto.randomUUID(), lines: [],
        }}
      />
    </>
  );
}
