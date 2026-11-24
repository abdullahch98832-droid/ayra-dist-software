import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadDriverList, loadVehicle } from "@/features/fleet/queries";
import type { VehicleValues } from "@/features/fleet/schema";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { VehicleForm } from "../../vehicle-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).vehicles.edit };
}

export default async function EditVehiclePage({ params }: PageProps<"/vehicles/[id]/edit">) {
  const { id, ctx, t } = await pageContext(params);
  if (!can(ctx, "vehicles.manage")) return <Forbidden />;
  const [x, drivers] = await Promise.all([loadVehicle(id), loadDriverList()]);
  if (!x) notFound();
  return (
    <>
      <PageHeader title={t.vehicles.edit} breadcrumbs={[{ label: t.vehicles.title, href: "/vehicles" }, { label: x.registration_no, href: `/vehicles/${id}` }]} />
      <VehicleForm
        vehicleId={id} drivers={drivers.filter((d) => d.isActive || d.id === x.driver_id)}
        defaults={{
          registration: x.registration_no, name: x.name, type: x.vehicle_type ?? "", make: x.make ?? "", model: x.model ?? "", capacity: x.capacity ?? "", driverId: x.driver_id ?? "",
          fuelType: (x.fuel_type ?? "") as VehicleValues["fuelType"], ownership: x.ownership, status: x.status as VehicleValues["status"], notes: x.notes ?? "",
        }}
      />
    </>
  );
}
