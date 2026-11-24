"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/server-action";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { warehouseSchema } from "./schema";

export async function saveWarehouseAction(id: string | null, values: unknown): Promise<ActionResult<null>> {
  return runAction("warehouses.manage", warehouseSchema, values, async (v) => {
    const supabase = await createClient();
    const record = { name_en: v.nameEn, name_ur: orNull(v.nameUr), address: orNull(v.address), is_active: v.isActive };
    // Type and vehicle are fixed once created: stock and postings depend on them.
    const { error } = id
      ? await supabase.from("warehouses").update(record).eq("id", z.uuid().parse(id))
      : await supabase.from("warehouses").insert({ ...record, code: v.code, warehouse_type: v.type, vehicle_id: v.type === "vehicle" ? orNull(v.vehicleId) : null });
    if (error) throw error;
    return null;
  });
}
