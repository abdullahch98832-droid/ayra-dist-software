"use server";

import { z } from "zod";
import { businessToday } from "@/features/dashboard/period";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/server-action";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { journalSchema, ledgerAccountSchema } from "./schema";

const uuid = z.uuid();
const reasoned = z.object({ id: uuid, reason: z.string().trim().min(1, "required").max(300, "tooLong") });

export async function saveLedgerAccountAction(id: string | null, values: unknown): Promise<ActionResult<null>> {
  return runAction("accounting.manage", ledgerAccountSchema, values, async (v) => {
    const supabase = await createClient();
    const record = { code: v.code, name_en: v.nameEn, name_ur: v.nameUr, account_type: v.type, parent_id: orNull(v.parentId), is_postable: !v.isGroup, cash_flow: orNull(v.cashFlow), is_active: v.isActive };
    const { error } = id ? await supabase.from("chart_of_accounts").update(record).eq("id", uuid.parse(id)) : await supabase.from("chart_of_accounts").insert(record);
    if (error) throw error;
    return null;
  });
}

export async function postJournalAction(values: unknown): Promise<ActionResult<string>> {
  return runAction("accounting.journal", journalSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_manual_journal", {
      p_date: v.date, p_description: v.description,
      p_lines: v.lines.map((l, i) => ({
        account_id: l.accountId, customer_id: orNull(l.customerId), supplier_id: orNull(l.supplierId), debit: orNull(l.debit) ?? "0", credit: orNull(l.credit) ?? "0",
        ...(i === 0 ? { client_request_id: v.requestId } : {}),
      })),
    });
    if (error) throw error;
    return data;
  });
}

export async function reverseJournalAction(id: string, reason: string): Promise<ActionResult<null>> {
  return runAction("accounting.journal", reasoned, { id, reason }, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("reverse_manual_journal", { p_entry_id: v.id, p_date: businessToday(), p_reason: v.reason });
    if (error) throw error;
    return null;
  });
}

export async function createPeriodAction(month: string): Promise<ActionResult<null>> {
  return runAction("accounting.close", z.string().regex(/^\d{4}-\d{2}$/, "invalidDate"), month, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("create_period", { p_month: `${v}-01` });
    if (error) throw error;
    return null;
  });
}

export async function closePeriodAction(id: string): Promise<ActionResult<null>> {
  return runAction("accounting.close", uuid, id, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("close_period", { p_id: v });
    if (error) throw error;
    return null;
  });
}

export async function reopenPeriodAction(id: string, reason: string): Promise<ActionResult<null>> {
  return runAction("accounting.close", reasoned, { id, reason }, async (v) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("reopen_period", { p_id: v.id, p_reason: v.reason });
    if (error) throw error;
    return null;
  });
}
