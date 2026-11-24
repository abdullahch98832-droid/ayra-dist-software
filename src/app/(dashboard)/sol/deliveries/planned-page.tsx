import { loadWarehouseChoices } from "@/features/catalog/queries";
import { loadDriverList, loadVehicles } from "@/features/fleet/queries";
import { itemName, type SolJob } from "@/features/sol/queries";
import { PlannedForm } from "./planned-form";

interface Existing { id: string; values: Omit<Parameters<typeof PlannedForm>[0]["defaults"], "jobId" | "lines">; quantities: Map<string, number> }

/** Plans a delivery of a job, or changes a planned one. */
export async function PlannedPage({ job, local, today, existing }: { job: SolJob; local: (en: string, ur: string | null | undefined) => string; today: string; existing?: Existing }) {
  const [vehicles, drivers, warehouses] = await Promise.all([loadVehicles(), loadDriverList(), loadWarehouseChoices()]);
  const main = warehouses.filter((w) => w.type === "main");
  const lines = job.items.map((l) => ({
    id: l.id, name: itemName(local, l), detail: l.product?.sku ?? (l.kind === "other" ? null : l.description),
    unit: l.unit ? local(l.unit.name_en, l.unit.name_ur) : l.service?.unit_label ? local(l.service.unit_label, l.service.unit_label_ur) : null,
    max: (l.quantity - l.delivered_quantity).toFixed(2).replace(/\.?0+$/, "") || "0", product: l.kind === "product",
  })).filter((l) => Number(l.max) > 0 || existing?.quantities.has(l.id));
  return (
    <PlannedForm
      deliveryId={existing?.id ?? null} cancelPath={existing ? `/sol/deliveries/${existing.id}` : `/sol/jobs/${job.id}`} lines={lines}
      vehicles={vehicles.filter((v) => v.is_active || v.id === existing?.values.vehicleId).map((v) => ({ id: v.id, label: `${v.registration_no} · ${v.name}`, driverId: v.driver_id }))}
      drivers={drivers.filter((d) => d.isActive || d.id === existing?.values.driverId)} warehouses={warehouses.filter((w) => w.type !== "damaged")}
      defaults={{
        jobId: job.id, vehicleId: "", driverId: "", warehouseId: main.length === 1 ? main[0]?.id ?? "" : "", date: today, destination: job.address ?? "", odometerStart: "", notes: "", requestId: crypto.randomUUID(),
        ...existing?.values, lines: lines.map((l) => ({ itemId: l.id, quantity: existing?.quantities.has(l.id) ? String(existing.quantities.get(l.id)) : "" })),
      }}
    />
  );
}
