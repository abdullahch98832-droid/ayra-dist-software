import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sqlNull } from "@/lib/supabase/rpc";
import { fetchAll } from "@/lib/supabase/fetch-all";

/** Staff who take goods to the shops, with the contact details other users may see. Loaded once per request. */
export const loadSupplyStaff = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_supply_staff");
  if (error) throw error;
  return data.map((r) => ({
    id: r.employee_id, code: r.code, nameEn: r.full_name, nameUr: r.full_name_ur as string | null, phone: r.phone as string | null, whatsapp: r.whatsapp as string | null, photoPath: r.photo_path as string | null, status: r.employment_status,
    isActive: r.is_active, notes: r.notes as string | null, open: Number(r.open_deliveries),
  }));
});
export type SupplyPerson = Awaited<ReturnType<typeof loadSupplyStaff>>[number];

export async function loadSupplyWork(from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_suppliers_work", { p_from: from, p_to: to });
  if (error) throw error;
  return data;
}

export async function reportSupply(from: string, to: string, supplierId: string | null) {
  const supabase = await createClient();
  return fetchAll((a, b) => supabase.rpc("report_supply", { p_from: from, p_to: to, p_supplier_id: sqlNull(supplierId) }).range(a, b));
}

const amount = z.string();
const moneySchema = z.object({
  total: amount, outstanding: amount, received: amount, waiting: amount,
  payments: z.array(z.object({ id: z.string(), number: z.string(), date: z.string(), amount, method: z.enum(["cash", "bank_transfer", "cheque", "online", "other"]), status: z.enum(["draft", "posted", "void"]), held: z.boolean() })),
});
export type DeliveryMoney = z.infer<typeof moneySchema>;

/** What a shop pays for a delivery, for its supplier and for those who see payments. Null for everyone else. */
export async function loadDeliveryMoney(id: string): Promise<DeliveryMoney | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delivery_money", { p_id: id });
  if (error) {
    if (error.code === "42501") return null;
    throw error;
  }
  return data === null ? null : moneySchema.parse(data);
}
