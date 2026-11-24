"use server";

import type { ActionResult } from "@/lib/action-result";
import { can } from "@/lib/auth/session";
import { runAction } from "@/lib/server-action";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { takerSchema } from "./schema";

export async function saveTakerAction(values: unknown): Promise<ActionResult<string>> {
  return runAction("sales.team", takerSchema, values, async (v, ctx) => {
    const supabase = await createClient();
    const withEmployee = v.employeeId === "" || (v.editEmployee && can(ctx, "employees.manage"));
    const { data, error } = await supabase.rpc("save_order_taker", {
      p_employee_id: sqlNull(orNull(v.employeeId)),
      p_doc: {
        territory: orNull(v.territory), is_active: v.isActive, notes: orNull(v.notes),
        ...(withEmployee ? { full_name: v.name, full_name_ur: orNull(v.nameUr), phone: orNull(v.phone), whatsapp: orNull(v.whatsapp), status: v.status } : {}),
      },
    });
    if (error) throw error;
    return data;
  });
}
