"use server";

import { z } from "zod";
import { can, getSessionContext } from "@/lib/auth/session";
import { likeTerm } from "@/lib/supabase/like-term";
import { createClient } from "@/lib/supabase/server";
import type { SearchHits, SearchResult } from "./types";

const querySchema = z.string().trim().min(2).max(80);

/**
 * Global record search. Several permissions are involved, so each source is checked
 * on its own and skipped when missing; RLS applies to every query as well.
 */
export async function searchRecordsAction(input: unknown): Promise<SearchResult> {
  const ctx = await getSessionContext();
  if (!ctx?.isActive) return { ok: false };
  const parsed = querySchema.safeParse(input);
  const term = parsed.success ? likeTerm(parsed.data) : "";
  const hits: SearchHits = { customers: [], orders: [], solJobs: [], vehicles: [], products: [], suppliers: [], employees: [] };
  if (!term) return { ok: true, hits };

  const supabase = await createClient();
  const none = Promise.resolve({ data: [], error: null });
  const [customers, orders, jobs, vehicles, products, suppliers, employees] = await Promise.all([
    can(ctx, "customers.view")
      ? supabase.from("customers").select("id, code, name, name_ur")
        .or(`name.ilike.%${term}%,name_ur.ilike.%${term}%,owner_name.ilike.%${term}%,code.ilike.%${term}%,phone.ilike.%${term}%`).order("name").limit(6)
      : none,
    can(ctx, "sales.view") || can(ctx, "sales.view_all")
      ? supabase.from("sales_orders").select("id, doc_no, customer:customers!sales_orders_customer_id_fkey(name, name_ur)").ilike("doc_no", `%${term}%`).order("doc_no", { ascending: false }).limit(6)
      : none,
    can(ctx, "sol.view")
      ? supabase.from("sol_jobs").select("id, doc_no, customer:customers!sol_jobs_customer_id_fkey(name, name_ur)").or(`doc_no.ilike.%${term}%,description.ilike.%${term}%`).order("doc_no", { ascending: false }).limit(6)
      : none,
    can(ctx, "vehicles.view")
      ? supabase.from("vehicles").select("id, registration_no, name").or(`registration_no.ilike.%${term}%,name.ilike.%${term}%`).order("registration_no").limit(6)
      : none,
    can(ctx, "products.view")
      ? supabase.from("products").select("id, sku, name_en, name_ur")
        .or(`name_en.ilike.%${term}%,name_ur.ilike.%${term}%,sku.ilike.%${term}%,barcode.eq.${term}`).order("name_en").limit(6)
      : none,
    can(ctx, "suppliers.view")
      ? supabase.from("suppliers").select("id, code, name, name_ur")
        .or(`name.ilike.%${term}%,name_ur.ilike.%${term}%,code.ilike.%${term}%,phone.ilike.%${term}%`).order("name").limit(6)
      : none,
    can(ctx, "employees.view")
      ? supabase.from("employees").select("id, employee_code, full_name, full_name_ur")
        .or(`full_name.ilike.%${term}%,full_name_ur.ilike.%${term}%,employee_code.ilike.%${term}%,phone.ilike.%${term}%`).order("full_name").limit(6)
      : none,
  ]);
  for (const { error } of [customers, orders, jobs, vehicles, products, suppliers, employees]) {
    if (error) {
      console.error(error);
      return { ok: false };
    }
  }
  hits.customers = (customers.data ?? []).map((c) => ({ id: c.id, title: c.name, titleUr: c.name_ur, detail: c.code, href: `/customers/${c.id}` }));
  hits.orders = (orders.data ?? []).map((o) => ({ id: o.id, title: o.customer?.name ?? o.doc_no, titleUr: o.customer?.name_ur ?? null, detail: o.doc_no, href: `/sales/orders/${o.id}` }));
  hits.solJobs = (jobs.data ?? []).map((j) => ({ id: j.id, title: j.customer?.name ?? j.doc_no, titleUr: j.customer?.name_ur ?? null, detail: j.doc_no, href: `/sol/jobs/${j.id}` }));
  hits.vehicles = (vehicles.data ?? []).map((v) => ({ id: v.id, title: v.name, titleUr: null, detail: v.registration_no, href: `/vehicles/${v.id}` }));
  hits.products = (products.data ?? []).map((p) => ({ id: p.id, title: p.name_en, titleUr: p.name_ur, detail: p.sku, href: `/products/${p.id}` }));
  hits.suppliers = (suppliers.data ?? []).map((s) => ({ id: s.id, title: s.name, titleUr: s.name_ur, detail: s.code, href: `/suppliers/${s.id}` }));
  hits.employees = (employees.data ?? []).map((e) => ({ id: e.id, title: e.full_name, titleUr: e.full_name_ur, detail: e.employee_code, href: `/employees/${e.id}` }));
  return { ok: true, hits };
}
