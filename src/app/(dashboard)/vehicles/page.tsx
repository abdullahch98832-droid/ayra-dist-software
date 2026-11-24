import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { loadDriverList, loadVehicles, vehiclesOnTrip } from "@/features/fleet/queries";
import { vehicleOptions } from "@/features/sol/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).vehicles.title };
}

export default async function VehiclesPage() {
  const { ctx, t, local } = await pageContext();
  if (!can(ctx, "vehicles.view")) return <Forbidden />;
  const v = t.vehicles;
  const [vehicles, drivers, busy] = await Promise.all([loadVehicles(), loadDriverList(), vehiclesOnTrip()]);
  const names = new Map(drivers.map((d) => [d.id, d]));
  const add = can(ctx, "vehicles.manage") && <LinkButton href="/vehicles/new"><Plus aria-hidden />{v.add}</LinkButton>;
  return (
    <>
      <PageHeader title={v.title} description={v.subtitle} actions={add} />
      <SpecTable
        caption={v.title}
        rows={vehicles.map((x) => {
          const driver = names.get(x.driver_id ?? "");
          return {
            id: x.id, no: x.registration_no, noHref: `/vehicles/${x.id}`, name: x.name, type: x.vehicle_type, model: [x.make, x.model].filter(Boolean).join(" "), driver: driver ? local(driver.nameEn, driver.nameUr) : null, phone: driver?.phone,
            fuel: x.fuel_type ? v.fuels[x.fuel_type as "petrol"] : null, ownership: v.ownerships[x.ownership], status: x.status === "active" && busy.has(x.id) ? "trip" : x.status,
          };
        })}
        columns={[
          { key: "no", sub: "name", label: v.registration, kind: "link", primary: true }, { key: "type", label: v.type, kind: "text" }, { key: "model", label: `${v.make} / ${v.model}`, kind: "text", hideBelow: "lg" },
          { key: "driver", sub: "phone", label: v.driver, kind: "text" }, { key: "fuel", label: v.fuelType, kind: "text", hideBelow: "xl" }, { key: "ownership", label: v.ownership, kind: "text", hideBelow: "xl" },
          { key: "status", label: v.status, kind: "status", options: { ...vehicleOptions(t), trip: { label: v.onTrip, tone: "blue" } } },
        ]}
        searchKeys={["no", "name", "type", "model", "driver"]}
        empty={{ title: v.empty, description: v.emptyHint, action: add }}
      />
    </>
  );
}
