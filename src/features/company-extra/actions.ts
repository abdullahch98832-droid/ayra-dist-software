"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/server-action";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { extraSchema } from "./schema";

export async function saveExtraAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction("company.pay", extraSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_company_extra_payment", {
      p_id: sqlNull(id === null ? null : z.uuid().parse(id)),
      // Times are entered as they read in Pakistan.
      p_doc: { name: v.name, paid_at: `${v.date}T${v.time}:00+05:00`, amount: v.amount, kind: v.kind, financial_account_id: v.accountId, method: v.method, reference: orNull(v.reference), notes: orNull(v.notes), client_request_id: v.requestId },
    });
    if (error) throw error;
    return data;
  });
}

export async function voidExtraAction(id: string, reason: string): Promise<ActionResult<null>> {
  return runAction("company.pay", z.object({ id: z.uuid(), reason: z.string().trim().min(1, "required").max(300, "tooLong") }), { id, reason }, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("void_company_extra_payment", { p_id: v.id, p_reason: v.reason });
    if (error) throw error;
    return null;
  });
}
