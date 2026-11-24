import type { Metadata } from "next";
import { businessToday } from "@/features/dashboard/period";
import { loadDriverList } from "@/features/fleet/queries";
import { loadStaff } from "@/features/sol/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { DriversTable } from "./drivers-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).vehicles.drivers };
}

export default async function DriversPage() {
  const { ctx, t } = await pageContext();
  if (!can(ctx, "vehicles.view")) return <Forbidden />;
  const manage = can(ctx, "vehicles.manage");
  const [drivers, staff] = await Promise.all([loadDriverList(), manage ? loadStaff() : []]);
  const taken = new Set(drivers.map((d) => d.employeeId));
  return (
    <>
      <PageHeader title={t.vehicles.drivers} />
      <DriversTable drivers={drivers} staff={staff.filter((x) => x.isActive && !taken.has(x.id))} manage={manage} today={businessToday()} />
    </>
  );
}
