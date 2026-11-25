import "server-only";
import { cache } from "react";
import { can, type SessionContext } from "@/lib/auth/session";
import { loadSupplyStaff } from "@/features/supply/queries";
import { signedPhotoUrls } from "@/features/employees/queries";
import { createClient } from "@/lib/supabase/server";

/** Everyone who takes orders, with the contact details other users may see. Loaded once per request. */
export const loadTakers = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_order_takers");
  if (error) throw error;
  return data.map((r) => ({
    id: r.employee_id, code: r.code, nameEn: r.full_name, nameUr: r.full_name_ur, phone: r.phone, whatsapp: r.whatsapp, photoPath: r.photo_path,
    territory: r.territory, status: r.employment_status, isActive: r.is_active, notes: r.notes, customers: Number(r.customers),
  }));
});
export type Taker = Awaited<ReturnType<typeof loadTakers>>[number];

/** Names by id, for lists that only hold the id. */
export async function takerNames(): Promise<Map<string, { nameEn: string; nameUr: string | null }>> {
  const [takers, staff] = await Promise.all([loadTakers(), loadSupplyStaff()]);
  return new Map([...staff, ...takers].map((x) => [x.id, x]));
}

/** Everyone who may hold cash: order takers and suppliers, once each. */
export async function loadCollectors() {
  const [takers, staff] = await Promise.all([loadTakers(), loadSupplyStaff()]);
  const byId = new Map<string, { id: string; nameEn: string; nameUr: string | null; isActive: boolean }>();
  for (const x of [...takers, ...staff]) byId.set(x.id, { id: x.id, nameEn: x.nameEn, nameUr: x.nameUr, isActive: x.isActive || (byId.get(x.id)?.isActive ?? false) });
  return [...byId.values()];
}

export const takerPhotos = (takers: { photoPath: string | null }[]) => signedPhotoUrls(takers.map((x) => x.photoPath));

export async function loadTakerReport(from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_order_takers", { p_from: from, p_to: to });
  if (error) throw error;
  return data;
}

/** Employees who are not order takers yet. */
export async function loadEmployeeChoices(ctx: SessionContext, takenIds: string[]) {
  if (!can(ctx, "employees.view")) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("employees").select("id, full_name, full_name_ur, employee_code").neq("status", "terminated").order("full_name").limit(1000);
  if (error) throw error;
  return data.filter((e) => !takenIds.includes(e.id)).map((e) => ({ id: e.id, nameEn: e.full_name, nameUr: e.full_name_ur, code: e.employee_code }));
}

export async function loadDrivers() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_drivers");
  if (error) throw error;
  return data.filter((d) => d.is_active).map((d) => ({ id: d.driver_id, nameEn: d.full_name, nameUr: d.full_name_ur }));
}

