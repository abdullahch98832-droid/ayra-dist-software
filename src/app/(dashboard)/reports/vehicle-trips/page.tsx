import type { Metadata } from "next";
import { loadVehicles, reportVehicleLog } from "@/features/fleet/queries";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { uuidParam } from "@/lib/page-context";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { UrlSelect } from "@/components/tables/url-filters";
import { TripsTable } from "../../vehicles/trips-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.vehicleTrips };
}

export default async function VehicleTripsReport({ searchParams }: PageProps<"/reports/vehicle-trips">) {
  const { ctx, t, query, today, period, allowed, local } = await reportPage(REPORTS.vehicleTrips, searchParams);
  if (!allowed) return <Forbidden />;
  const [rows, vehicles] = await Promise.all([reportVehicleLog(period, uuidParam(query.vehicle)), loadVehicles()]);
  return (
    <>
      <PageHeader title={t.reports.vehicleTrips} breadcrumbs={[{ label: t.reports.title, href: "/reports" }]} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={t.reports.vehicleTrips} description={t.reports.vehicleTripsHint}>
        <TripsTable
          t={t} local={local} rows={rows} exportName={`vehicle-trips-${period.from}-${period.to}`} canOpen={{ sol: can(ctx, "sol.view"), sales: can(ctx, "sales.view") || can(ctx, "sales.view_all") }}
          toolbar={<UrlSelect param="vehicle" label={t.vehicles.allVehicles} options={vehicles.map((x) => ({ value: x.id, label: `${x.registration_no} · ${x.name}` }))} />}
        />
      </PeriodFrame>
    </>
  );
}
