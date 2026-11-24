"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/server-action";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { accountSchema } from "./schema";

export async function saveAccountAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction("cash_bank.manage", accountSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_financial_account", {
      p_id: sqlNull(id === null ? null : z.uuid().parse(id)),
      p_doc: {
        name: v.name, account_type: v.type, bank_name: orNull(v.bankName), account_title: orNull(v.accountTitle), account_number: orNull(v.accountNumber), iban: orNull(v.iban),
        branch: orNull(v.branch), notes: orNull(v.notes), is_active: v.isActive,
      },
    });
    if (error) throw error;
    return data;
  });
}
