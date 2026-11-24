import type { Metadata } from "next";
import { loadCustomerOption } from "@/features/customers/queries";
import { businessToday } from "@/features/dashboard/period";
import { loadJobTypes, loadServices, loadStaff } from "@/features/sol/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext, uuidParam } from "@/lib/page-context";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { JobForm } from "../job-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sol.newJob };
}

export default async function NewJobPage({ searchParams }: PageProps<"/sol/jobs/new">) {
  const { ctx, t } = await pageContext();
  if (!can(ctx, "sol.manage")) return <Forbidden />;
  const customerId = uuidParam((await searchParams).customer);
  const [customer, types, staff, services] = await Promise.all([customerId ? loadCustomerOption(customerId) : null, loadJobTypes(), loadStaff(), loadServices()]);
  const active = types.filter((x) => x.isActive);
  return (
    <>
      <PageHeader title={t.sol.newJob} breadcrumbs={[{ label: t.sol.tabs.jobs, href: "/sol/jobs" }]} />
      {active.length === 0 ? <FormAlert tone="info">{t.sol.noTypes}</FormAlert> : (
        <JobForm
          jobId={null} customer={customer} lockClient={false} types={active} staff={staff.filter((x) => x.isActive)} services={services} products={[]} seesCosts={can(ctx, "costs.view")} canAddClient={can(ctx, "customers.manage")} delivered={[]}
          defaults={{
            customerId: customer?.id ?? "", typeId: active.length === 1 ? active[0]?.id ?? "" : "", contactName: "", contactPhone: "", address: "", description: "", contract: "", responsibleId: "",
            date: businessToday(), startDate: "", dueDate: "", notes: "", requestId: crypto.randomUUID(), lines: [],
          }}
        />
      )}
    </>
  );
}
