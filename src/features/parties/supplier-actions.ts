"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/server-action";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";
import { orNull } from "@/lib/validation/common";
import { supplierSchema } from "./supplier-schema";

export async function saveSupplierAction(id: string | null, values: unknown): Promise<ActionResult<string>> {
  return runAction("suppliers.manage", supplierSchema, values, async (v) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_supplier", {
      p_id: sqlNull(id === null ? null : z.uuid().parse(id)),
      p_doc: {
        code: v.code, name: v.name, name_ur: orNull(v.nameUr), phone: orNull(v.phone), email: orNull(v.email), address: orNull(v.address),
        ntn: orNull(v.ntn), payment_terms_days: orNull(v.terms), is_active: v.isActive, notes: orNull(v.notes),
      },
      p_contacts: v.contacts.map((c) => ({ name: c.name, designation: orNull(c.designation), phone: orNull(c.phone), email: orNull(c.email), is_primary: c.isPrimary })),
    });
    if (error) throw error;
    return data;
  });
}
