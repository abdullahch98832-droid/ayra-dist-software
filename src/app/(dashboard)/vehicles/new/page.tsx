import type { Metadata } from "next";
import { loadDriverList } from "@/features/fleet/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { VehicleForm } from "../vehicle-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).vehicles.add };
}

export default async function NewVehiclePage() {
  const { ctx, t } = await pageContext();
  if (!can(ctx, "vehicles.manage")) return <Forbidden />;
  const drivers = await loadDriverList();
  return (
    <>
      <PageHeader title={t.vehicles.add} breadcrumbs={[{ label: t.vehicles.title, href: "/vehicles" }]} />
      <VehicleForm vehicleId={null} drivers={drivers.filter((d) => d.isActive)} defaults={{ registration: "", name: "", type: "", make: "", model: "", capacity: "", driverId: "", fuelType: "", ownership: "owned", status: "active", notes: "" }} />
    </>
  );
}
