import type { Metadata } from "next";
import { reportVehicles } from "@/features/fleet/queries";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { vehicleOptions } from "@/features/sol/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.vehicles };
}

export default async function VehiclesReport({ searchParams }: PageProps<"/reports/vehicles">) {
  const { ctx, t, today, period, allowed, local } = await reportPage(REPORTS.vehicles, searchParams);
  if (!allowed) return <Forbidden />;
  const v = t.vehicles;
  const rows = await reportVehicles(period);
  const costs = can(ctx, "expenses.view");
  return (
    <>
      <PageHeader title={t.reports.vehicles} breadcrumbs={[{ label: t.reports.title, href: "/reports" }]} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={t.reports.vehicles} description={v.useHint}>
        <SpecTable
          caption={t.reports.vehicles}
          exportName={`vehicles-${period.from}-${period.to}`}
          rows={rows.map((x) => ({
            id: x.vehicle_id, no: x.registration_no, noHref: `/vehicles/${x.vehicle_id}`, name: x.name, driver: x.driver_en ? local(x.driver_en, x.driver_ur) : null, status: x.status, jobs: x.jobs, sol: x.sol_deliveries, sales: x.sales_deliveries, distance: x.distance,
            fuel: x.fuel, litres: x.litres, maintenance: x.maintenance, repairs: x.repairs, other: x.other, total: x.total, forJobs: x.for_jobs,
          }))}
          columns={[
            { key: "no", sub: "name", label: v.registration, kind: "link", primary: true }, { key: "driver", label: v.driver, kind: "text", hideBelow: "2xl" }, { key: "status", label: v.status, kind: "status", options: vehicleOptions(t) },
            { key: "jobs", label: v.jobs, kind: "quantity", hideBelow: "2xl" }, { key: "sol", label: v.solTrips, kind: "quantity", total: true }, { key: "sales", label: v.salesTrips, kind: "quantity", total: true }, { key: "distance", label: v.distance, kind: "quantity", hideBelow: "lg", total: true },
            ...(costs ? [
              { key: "fuel", label: v.fuel, kind: "money" as const, hideBelow: "xl" as const, total: true }, { key: "litres", label: v.litres, kind: "decimal" as const, hideBelow: "2xl" as const }, { key: "maintenance", label: v.maintenance, kind: "money" as const, hideBelow: "2xl" as const, total: true },
              { key: "repairs", label: v.repairs, kind: "money" as const, hideBelow: "2xl" as const, total: true }, { key: "other", label: v.other, kind: "money" as const, hideBelow: "2xl" as const, total: true }, { key: "total", label: v.total, kind: "money" as const, total: true },
              { key: "forJobs", label: v.forJobs, kind: "money" as const, hideBelow: "xl" as const, total: true },
            ] : []),
          ]}
          searchKeys={["no", "name", "driver"]}
          empty={{ title: v.empty }}
        />
      </PeriodFrame>
    </>
  );
}
