"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/server-action";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { driverSchema, vehicleSchema } from "./schema";

const missing = () => Object.assign(new Error("Record not found"), { code: "P0002" });

export async function saveVehicleAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction("vehicles.manage", vehicleSchema, values, async (v) => {
    const supabase = await createClient();
    const record = {
      registration_no: v.registration.toUpperCase(), name: v.name, vehicle_type: orNull(v.type), make: orNull(v.make), model: orNull(v.model), capacity: orNull(v.capacity),
      driver_id: orNull(v.driverId), fuel_type: orNull(v.fuelType), ownership: v.ownership, status: v.status, notes: orNull(v.notes),
    };
    const { data, error } = id
      ? await supabase.from("vehicles").update(record).eq("id", z.uuid().parse(id)).select("id").maybeSingle()
      : await supabase.from("vehicles").insert(record).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw missing();
    return data.id;
  });
}

export async function saveDriverAction(id: string | null, values: unknown): Promise<ActionResult<null>> {
  return runAction("vehicles.manage", driverSchema, values, async (v) => {
    const supabase = await createClient();
    const record = { license_number: orNull(v.license), license_expiry: orNull(v.licenseExpiry), is_active: v.isActive };
    // The employee of a driver is fixed: trips refer to it.
    const { data, error } = id
      ? await supabase.from("drivers").update(record).eq("id", z.uuid().parse(id)).select("id").maybeSingle()
      : await supabase.from("drivers").insert({ ...record, employee_id: v.employeeId }).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw missing();
    return null;
  });
}
