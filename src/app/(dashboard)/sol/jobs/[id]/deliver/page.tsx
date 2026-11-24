import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { businessToday } from "@/features/dashboard/period";
import { loadJob } from "@/features/sol/queries";
import { isOpenJob } from "@/features/sol/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { PlannedPage } from "../../../deliveries/planned-page";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sol.planDelivery };
}

export default async function PlanDeliveryPage({ params }: PageProps<"/sol/jobs/[id]/deliver">) {
  const { id, ctx, t, local } = await pageContext(params);
  if (!can(ctx, "sol.dispatch") && !can(ctx, "sol.manage")) return <Forbidden />;
  const job = await loadJob(id);
  if (!job || !isOpenJob(job.status) || job.type?.uses_deliveries === false) notFound();
  return (
    <>
      <PageHeader title={t.sol.planDelivery} breadcrumbs={[{ label: t.sol.tabs.jobs, href: "/sol/jobs" }, { label: job.doc_no, href: `/sol/jobs/${id}` }]} />
      <PlannedPage job={job} local={local} today={businessToday()} />
    </>
  );
}
