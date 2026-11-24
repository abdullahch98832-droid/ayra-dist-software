import type { Metadata } from "next";
import { businessToday, parsePeriod } from "@/features/dashboard/period";
import { loadVehicles, reportVehicleLog } from "@/features/fleet/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext, uuidParam } from "@/lib/page-context";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { UrlSelect } from "@/components/tables/url-filters";
import { TripsTable } from "../trips-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).vehicles.tabs.trips };
}

export default async function TripsPage({ searchParams }: PageProps<"/vehicles/trips">) {
  const { ctx, t, local } = await pageContext();
  if (!can(ctx, "vehicles.view")) return <Forbidden />;
  const v = t.vehicles;
  const query = await searchParams;
  const today = businessToday();
  const period = parsePeriod(query, today);
  const [rows, vehicles] = await Promise.all([reportVehicleLog(period, uuidParam(query.vehicle)), loadVehicles()]);
  return (
    <>
      <PageHeader title={v.tabs.trips} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={v.trips} description={t.reports.vehicleTripsHint}>
        <TripsTable
          t={t} local={local} rows={rows} canOpen={{ sol: can(ctx, "sol.view"), sales: can(ctx, "sales.view") || can(ctx, "sales.view_all") }}
          toolbar={<UrlSelect param="vehicle" label={v.allVehicles} options={vehicles.map((x) => ({ value: x.id, label: `${x.registration_no} · ${x.name}` }))} />}
        />
      </PeriodFrame>
    </>
  );
}
