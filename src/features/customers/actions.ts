"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { authorizeAny, runAction } from "@/lib/server-action";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { findCustomers, loadCustomerSummary, type CustomerSummary } from "./queries";
import { customerSchema, type CustomerOption } from "./schema";

export async function saveCustomerAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction("customers.manage", customerSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_customer", {
      p_id: sqlNull(id === null ? null : z.uuid().parse(id)),
      p_doc: {
        code: v.code, name: v.name, name_ur: orNull(v.nameUr), owner_name: orNull(v.ownerName), phone: orNull(v.phone), alt_phone: orNull(v.altPhone),
        whatsapp: orNull(v.whatsapp), address: orNull(v.address), area: orNull(v.area), city: orNull(v.city), ntn: orNull(v.ntn), credit_limit: orNull(v.creditLimit),
        payment_terms_days: orNull(v.paymentTerms), order_taker_id: orNull(v.orderTakerId), is_active: v.isActive, notes: orNull(v.notes),
        ...(id === null && orNull(v.openingBalance) ? { opening_balance: v.openingBalance, opening_date: orNull(v.openingDate) } : {}),
      },
    });
    if (error) throw error;
    return data;
  });
}

export async function searchCustomersAction(query: unknown): Promise<CustomerOption[]> {
  await authorizeAny(["customers.view", "customers.manage"]);
  const parsed = z.string().max(80).safeParse(query);
  return parsed.success ? findCustomers(parsed.data) : [];
}

/** Balance and credit of the chosen customer; parts the user may not see are absent. */
export async function customerSummaryAction(id: unknown): Promise<CustomerSummary | null> {
  await authorizeAny(["customers.view", "receivables.view"]);
  const parsed = z.uuid().safeParse(id);
  return parsed.success ? loadCustomerSummary(parsed.data) : null;
}
