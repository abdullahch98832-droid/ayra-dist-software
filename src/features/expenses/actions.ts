"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/server-action";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { expenseSchema } from "./schema";

const uuid = z.uuid();

export async function recordExpenseAction(values: unknown): Promise<ActionResult<string>> {
  return runAction("expenses.create", expenseSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_expense", {
      p_doc: {
        date: v.date, category_id: v.categoryId, amount: v.amount, financial_account_id: v.accountId, method: v.method, reference: orNull(v.reference), payee: orNull(v.payee),
        description: orNull(v.description), vehicle_id: orNull(v.vehicleId), sol_job_id: orNull(v.jobId), litres: v.vehicleId === "" ? null : orNull(v.litres),
        odometer: v.vehicleId === "" ? null : orNull(v.odometer), client_request_id: v.requestId,
      },
    });
    if (error) throw error;
    return data;
  });
}

export async function postExpenseAction(id: string): Promise<ActionResult<null>> {
  return runAction("expenses.post", uuid, id, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("post_expense", { p_id: v });
    if (error) throw error;
    return null;
  });
}

export async function voidExpenseAction(id: string, reason: string): Promise<ActionResult<null>> {
  return runAction("expenses.post", z.object({ id: uuid, reason: z.string().trim().min(1, "required").max(300, "tooLong") }), { id, reason }, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("void_expense", { p_id: v.id, p_reason: v.reason });
    if (error) throw error;
    return null;
  });
}

export async function deleteExpenseAction(id: string): Promise<ActionResult<null>> {
  return runAction("expenses.create", uuid, id, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.from("expenses").delete().eq("id", v).eq("status", "draft").select("id");
    if (error) throw error;
    if (!data.length) throw Object.assign(new Error("The draft was not found or has already been processed"), { code: "P0002" });
    return null;
  });
}
