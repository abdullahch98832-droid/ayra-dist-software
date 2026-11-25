"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { can } from "@/lib/auth/session";
import { runAction } from "@/lib/server-action";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { supplyStaffSchema } from "./schema";

export async function saveSupplyStaffAction(values: unknown): Promise<ActionResult<string>> {
  return runAction("sales.team", supplyStaffSchema, values, async (v, ctx) => {
    const supabase = await createClient();
    const withEmployee = v.employeeId === "" || (v.editEmployee && can(ctx, "employees.manage"));
    const { data, error } = await supabase.rpc("save_supply_staff", {
      p_employee_id: sqlNull(orNull(v.employeeId)),
      p_doc: { is_active: v.isActive, notes: orNull(v.notes), ...(withEmployee ? { full_name: v.name, full_name_ur: orNull(v.nameUr), phone: orNull(v.phone), whatsapp: orNull(v.whatsapp), status: v.status } : {}) },
    });
    if (error) throw error;
    return data;
  });
}

export async function assignSupplierAction(deliveryId: string, employeeId: string): Promise<ActionResult<null>> {
  return runAction("sales.dispatch", z.object({ deliveryId: z.uuid(), employeeId: z.union([z.literal(""), z.uuid()]) }), { deliveryId, employeeId }, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("assign_supplier", { p_delivery_id: v.deliveryId, p_employee_id: sqlNull(orNull(v.employeeId)) });
    if (error) throw error;
    return null;
  });
}
