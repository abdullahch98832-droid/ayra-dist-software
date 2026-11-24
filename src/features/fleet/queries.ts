import "server-only";
import type { Period } from "@/features/dashboard/period";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";

/** Every driver with contact details; also those who no longer drive. */
export async function loadDriverList() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_drivers");
  if (error) throw error;
  return data.map((d) => ({
    id: d.driver_id, employeeId: d.employee_id, nameEn: d.full_name, nameUr: d.full_name_ur as string | null, phone: d.phone as string | null, license: d.license_number as string | null,
    licenseExpiry: d.license_expiry as string | null, isActive: d.is_active,
  }));
}
export type Driver = Awaited<ReturnType<typeof loadDriverList>>[number];

const VEHICLE_COLUMNS = "id, registration_no, name, vehicle_type, make, model, capacity, driver_id, fuel_type, ownership, status, is_active, notes";

export async function loadVehicles() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("vehicles").select(VEHICLE_COLUMNS).order("registration_no");
  if (error) throw error;
  return data;
}
export type Vehicle = Awaited<ReturnType<typeof loadVehicles>>[number];

export async function loadVehicle(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("vehicles").select(VEHICLE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Vehicles on the road now. */
export async function vehiclesOnTrip(): Promise<Set<string>> {
  const supabase = await createClient();
  const [sol, sales] = await Promise.all([
    supabase.from("sol_deliveries").select("vehicle_id").eq("status", "dispatched").not("vehicle_id", "is", null),
    supabase.from("deliveries").select("vehicle_id").eq("status", "dispatched").not("vehicle_id", "is", null),
  ]);
  for (const r of [sol, sales]) if (r.error) throw r.error;
  return new Set([...(sol.data ?? []), ...(sales.data ?? [])].map((r) => r.vehicle_id ?? ""));
}

export async function reportVehicles(period: Pick<Period, "from" | "to">, vehicleId: string | null = null) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_vehicles", { p_from: period.from, p_to: period.to, p_vehicle_id: sqlNull(vehicleId) }).range(from, to));
}

export async function reportVehicleLog(period: Pick<Period, "from" | "to">, vehicleId: string | null = null) {
  const supabase = await createClient();
  return fetchAll((from, to) => supabase.rpc("report_vehicle_log", { p_from: period.from, p_to: period.to, p_vehicle_id: sqlNull(vehicleId) }).range(from, to));
}
