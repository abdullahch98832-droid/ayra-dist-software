import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { businessToday } from "@/features/dashboard/period";
import { loadJob, loadSolDelivery } from "@/features/sol/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { PlannedPage } from "../../planned-page";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sol.editDelivery };
}

export default async function EditDeliveryPage({ params }: PageProps<"/sol/deliveries/[id]/edit">) {
  const { id, ctx, t, local } = await pageContext(params);
  if (!can(ctx, "sol.dispatch") && !can(ctx, "sol.manage")) return <Forbidden />;
  const delivery = await loadSolDelivery(id);
  const job = delivery?.status === "draft" ? await loadJob(delivery.sol_job_id) : null;
  if (!delivery || !job) notFound();
  return (
    <>
      <PageHeader title={t.sol.editDelivery} breadcrumbs={[{ label: t.sol.tabs.deliveries, href: "/sol/deliveries" }, { label: delivery.doc_no, href: `/sol/deliveries/${id}` }]} />
      <PlannedPage
        job={job} local={local} today={businessToday()}
        existing={{
          id, quantities: new Map(delivery.items.map((l) => [l.sol_job_item_id, l.quantity])),
          values: {
            vehicleId: delivery.vehicle_id ?? "", driverId: delivery.driver_id ?? "", warehouseId: delivery.warehouse_id ?? "", date: delivery.delivery_date, destination: delivery.destination,
            odometerStart: delivery.odometer_start === null ? "" : String(delivery.odometer_start), notes: delivery.notes ?? "", requestId: crypto.randomUUID(),
          },
        }}
      />
    </>
  );
}
