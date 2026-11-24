import "server-only";
import { z } from "zod";
import { can, type SessionContext } from "@/lib/auth/session";
import { firstRow, lastRow, type ListFilter } from "@/lib/list-params";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { likeTerm } from "@/lib/supabase/like-term";
import { listPage } from "@/lib/supabase/list-page";
import { createClient } from "@/lib/supabase/server";
import type { CustomerOption } from "./schema";

const OPTION = "id, code, name, name_ur, city, order_taker_id" as const;
const option = (c: { id: string; code: string; name: string; name_ur: string | null; city: string | null; order_taker_id: string | null }): CustomerOption =>
  ({ id: c.id, code: c.code, nameEn: c.name, nameUr: c.name_ur, city: c.city, orderTakerId: c.order_taker_id });

export async function loadCustomers(ctx: SessionContext, filter: ListFilter & { takerId: string | null; city: string }) {
  const supabase = await createClient();
  let query = supabase.from("customers").select("id, code, name, name_ur, owner_name, phone, city, area, credit_limit, order_taker_id, is_active", { count: "exact" });
  if (filter.status) query = query.eq("is_active", filter.status === "active");
  if (filter.takerId) query = query.eq("order_taker_id", filter.takerId);
  if (filter.city) query = query.eq("city", filter.city);
  if (filter.q) query = query.or(`name.ilike.%${filter.q}%,name_ur.ilike.%${filter.q}%,owner_name.ilike.%${filter.q}%,code.ilike.%${filter.q}%,phone.ilike.%${filter.q}%`);
  const { rows, total } = await listPage(query.order("name").order("id").range(firstRow(filter.page), lastRow(filter.page)));
  const balances = can(ctx, "receivables.view") && rows.length
    ? await supabase.from("v_customer_balances").select("customer_id, balance").in("customer_id", rows.map((c) => c.id))
    : { data: null, error: null };
  if (balances.error) throw balances.error;
  const balance = balances.data && new Map(balances.data.map((b) => [b.customer_id, b.balance]));
  return { total, rows: rows.map((c) => ({ ...c, balance: balance ? balance.get(c.id) ?? 0 : null })) };
}

export async function loadCities(): Promise<string[]> {
  const supabase = await createClient();
  const rows = await fetchAll((from, to) => supabase.from("customers").select("city").not("city", "is", null).order("city").order("id").range(from, to));
  return [...new Set(rows.map((r) => r.city ?? "").filter(Boolean))];
}

export async function loadCustomer(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").select(
    "id, code, name, name_ur, owner_name, phone, alt_phone, whatsapp, address, area, city, ntn, credit_limit, payment_terms_days, order_taker_id, is_active, notes"
  ).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

const decimal = z.string();
const summarySchema = z.object({
  open_orders: decimal, credit_limit: decimal.optional(), balance: decimal.optional(), credit_available: decimal.optional(), unallocated: decimal.optional(),
  overdue: decimal.optional(), last_payment: z.string().optional(), last_order: z.string().optional(),
});
export type CustomerSummary = z.infer<typeof summarySchema>;

export async function loadCustomerSummary(id: string): Promise<CustomerSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_summary", { p_customer_id: id });
  if (error) throw error;
  return summarySchema.parse(data);
}

export async function loadCustomerStatement(id: string, from: string, to: string) {
  const supabase = await createClient();
  return fetchAll((start, end) => supabase.rpc("customer_statement", { p_customer_id: id, p_from: from, p_to: to }).range(start, end));
}

/** Customers matching a name, owner, code or phone. */
export async function findCustomers(query: string): Promise<CustomerOption[]> {
  const term = likeTerm(query);
  const supabase = await createClient();
  let request = supabase.from("customers").select(OPTION).eq("is_active", true).order("name").limit(20);
  if (term) request = request.or(`name.ilike.%${term}%,name_ur.ilike.%${term}%,owner_name.ilike.%${term}%,code.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data, error } = await request;
  if (error) throw error;
  return data.map(option);
}

export async function loadCustomerOption(id: string | null): Promise<CustomerOption | null> {
  if (!id) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").select(OPTION).eq("id", id).maybeSingle();
  if (error) throw error;
  return data && option(data);
}
