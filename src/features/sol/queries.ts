import "server-only";
import { z } from "zod";
import { can, type SessionContext } from "@/lib/auth/session";
import { firstRow, lastRow, type ListFilter } from "@/lib/list-params";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { listPage } from "@/lib/supabase/list-page";
import { sqlNull } from "@/lib/supabase/rpc";
import { createClient } from "@/lib/supabase/server";
import { sumPaisa, toDbAmount, toPaisa } from "@/lib/utils/money";
import { OPEN_JOB_STATUSES, type JobStatus } from "./status";

const decimal = z.string();
const summarySchema = z.object({
  total_jobs: z.number(), completed_jobs: z.number(), pending_jobs: z.number(), cancelled_jobs: z.number(), draft_jobs: z.number(), overdue_jobs: z.number(), contract_value: decimal,
  received: decimal.optional(), advances: decimal.optional(), pending_payments: decimal.optional(), due_now: decimal.optional(), direct_costs: decimal.optional(),
  vehicle_expenses: decimal.optional(), profit: decimal.optional(),
});
export type SolSummary = z.infer<typeof summarySchema>;

/** Figures of jobs dated in the period; parts the user may not see are absent. */
export async function loadSolSummary(from: string, to: string): Promise<SolSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sol_summary", { p_from: from, p_to: to });
  if (error) throw error;
  return summarySchema.parse(data);
}

export interface JobReportFilter { from?: string; to?: string; status?: string; customerId?: string | null; typeId?: string | null; jobId?: string }
export async function reportSolJobs(filter: JobReportFilter) {
  const supabase = await createClient();
  return fetchAll((start, end) => supabase.rpc("report_sol_jobs", {
    p_from: sqlNull(filter.from ?? null), p_to: sqlNull(filter.to ?? null), p_status: sqlNull(filter.status || null),
    p_customer_id: sqlNull(filter.customerId ?? null), p_type_id: sqlNull(filter.typeId ?? null), p_job_id: sqlNull(filter.jobId ?? null),
  }).range(start, end));
}

export async function loadJobTypes() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sol_job_types").select("id, name_en, name_ur, uses_services, uses_products, uses_deliveries, is_active").order("name_en");
  if (error) throw error;
  return data.map((x) => ({ id: x.id, nameEn: x.name_en, nameUr: x.name_ur, usesServices: x.uses_services, usesProducts: x.uses_products, usesDeliveries: x.uses_deliveries, isActive: x.is_active }));
}
export type JobType = Awaited<ReturnType<typeof loadJobTypes>>[number];

export async function loadServices() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sol_services").select("id, name_en, name_ur, unit_label, unit_label_ur, default_price, is_active").order("name_en");
  if (error) throw error;
  return data.map((x) => ({
    id: x.id, nameEn: x.name_en, nameUr: x.name_ur, unitLabel: x.unit_label, unitLabelUr: x.unit_label_ur, price: x.default_price === null ? null : toDbAmount(toPaisa(x.default_price)), isActive: x.is_active,
  }));
}
export type Service = Awaited<ReturnType<typeof loadServices>>[number];

/** Names of employees by id, without their records. */
export async function loadStaff() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_staff");
  if (error) throw error;
  return data.map((x) => ({ id: x.employee_id, code: x.code, nameEn: x.full_name, nameUr: x.full_name_ur as string | null, isActive: x.is_active }));
}
export type Staff = Awaited<ReturnType<typeof loadStaff>>[number];

export async function loadJobs(filter: ListFilter & { typeId?: string | null; responsibleId?: string | null; overdueBefore?: string }) {
  const supabase = await createClient();
  let query = supabase.from("sol_jobs").select(
    "id, doc_no, job_date, due_date, status, contract_value, description, responsible_employee_id, customer:customers!sol_jobs_customer_id_fkey(name, name_ur), type:sol_job_types!sol_jobs_job_type_id_fkey(name_en, name_ur)", { count: "exact" });
  if (filter.status === "pending") query = query.in("status", OPEN_JOB_STATUSES);
  else if (filter.status) query = query.eq("status", filter.status as JobStatus);
  if (filter.typeId) query = query.eq("job_type_id", filter.typeId);
  if (filter.responsibleId) query = query.eq("responsible_employee_id", filter.responsibleId);
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,description.ilike.%${filter.q}%`);
  return listPage(query.order("job_date", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

export async function loadJob(id: string) {
  const supabase = await createClient();
  const [job, deliveries, report] = await Promise.all([
    supabase.from("sol_jobs").select(
      "id, doc_no, job_date, start_date, due_date, completion_date, status, contract_value, contact_name, contact_phone, address, description, notes, customer_id, job_type_id, responsible_employee_id, cancel_reason, reopen_reason, created_by, customer:customers!sol_jobs_customer_id_fkey(id, code, name, name_ur, phone, whatsapp, city, order_taker_id), type:sol_job_types!sol_jobs_job_type_id_fkey(name_en, name_ur, uses_services, uses_products, uses_deliveries), journal:journal_entries!sol_jobs_journal_entry_id_fkey(doc_no), sol_job_items(id, line_no, kind, service_id, product_id, unit_id, factor, description, quantity, unit_price, line_total, delivered_quantity, service:sol_services!sol_job_items_service_id_fkey(name_en, name_ur, unit_label, unit_label_ur), product:products!sol_job_items_product_id_fkey(sku, name_en, name_ur), unit:units!sol_job_items_unit_id_fkey(name_en, name_ur))"
    ).eq("id", id).maybeSingle(),
    supabase.from("sol_deliveries").select("id, doc_no, delivery_date, status, destination, delivered_at, vehicle:vehicles!sol_deliveries_vehicle_id_fkey(registration_no), driver_id").eq("sol_job_id", id).order("created_at"),
    reportSolJobs({ jobId: id }),
  ]);
  for (const r of [job, deliveries]) if (r.error) throw r.error;
  if (!job.data) return null;
  return { ...job.data, items: [...job.data.sol_job_items].sort((a, b) => a.line_no - b.line_no), deliveries: deliveries.data ?? [], figures: report[0] ?? null };
}
export type SolJob = NonNullable<Awaited<ReturnType<typeof loadJob>>>;

type Named = { name_en: string; name_ur: string | null } | null;
/** What a job line is called. */
export function itemName(local: (en: string, ur: string | null | undefined) => string, item: { description: string | null; service: Named; product: Named }): string {
  const named = item.service ?? item.product;
  return named ? local(named.name_en, named.name_ur) : item.description ?? "";
}

/** Expected unit costs by line, for holders of costs.view. */
export async function loadItemCosts(ctx: SessionContext, jobId: string): Promise<Map<string, string>> {
  if (!can(ctx, "costs.view")) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from("secure_sol_item_costs").select("sol_job_item_id, unit_cost").eq("sol_job_id", jobId);
  if (error) throw error;
  return new Map(data.filter((r) => r.unit_cost !== null).map((r) => [r.sol_job_item_id ?? "", toDbAmount(toPaisa(r.unit_cost ?? 0))]));
}

export async function loadSolDeliveries(filter: ListFilter & { vehicleId?: string | null }) {
  const supabase = await createClient();
  let query = supabase.from("sol_deliveries").select(
    "id, doc_no, delivery_date, status, destination, driver_id, vehicle:vehicles!sol_deliveries_vehicle_id_fkey(registration_no), job:sol_jobs!sol_deliveries_sol_job_id_fkey(id, doc_no, customer:customers!sol_jobs_customer_id_fkey(name, name_ur))", { count: "exact" });
  if (filter.status) query = query.eq("status", filter.status as "draft");
  if (filter.vehicleId) query = query.eq("vehicle_id", filter.vehicleId);
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,destination.ilike.%${filter.q}%`);
  return listPage(query.order("created_at", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

export async function loadSolDelivery(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sol_deliveries").select(
    "id, doc_no, sol_job_id, delivery_date, status, destination, dispatched_at, delivered_at, received_by, delivery_note, odometer_start, odometer_end, notes, vehicle_id, driver_id, warehouse_id, client_request_id, vehicle:vehicles!sol_deliveries_vehicle_id_fkey(id, registration_no, name), warehouse:warehouses!sol_deliveries_warehouse_id_fkey(name_en, name_ur), journal:journal_entries!sol_deliveries_journal_entry_id_fkey(doc_no), job:sol_jobs!sol_deliveries_sol_job_id_fkey(id, doc_no, status, contact_name, contact_phone, customer:customers!sol_jobs_customer_id_fkey(id, name, name_ur, phone, whatsapp)), sol_delivery_items(id, sol_job_item_id, quantity, returned_quantity, item:sol_job_items!sol_delivery_items_sol_job_item_id_fkey(kind, line_no, description, service:sol_services!sol_job_items_service_id_fkey(name_en, name_ur, unit_label, unit_label_ur), product:products!sol_job_items_product_id_fkey(sku, name_en, name_ur), unit:units!sol_job_items_unit_id_fkey(name_en, name_ur))), sol_returns(id, doc_no, return_date, reason, warehouse:warehouses!sol_returns_warehouse_id_fkey(name_en, name_ur), sol_return_items(quantity))"
  ).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? { ...data, items: [...data.sol_delivery_items].sort((a, b) => a.item.line_no - b.item.line_no) } : null;
}

const PAYMENT_COLUMNS =
  "id, doc_no, payment_date, amount, method, reference, payer_account, status, sol_job_id, account:financial_accounts!customer_payments_financial_account_id_fkey(name), job:sol_jobs!customer_payments_sol_job_id_fkey(id, doc_no, completion_date, status), customer:customers!customer_payments_customer_id_fkey(name, name_ur), customer_payment_allocations(amount, sol_job_id)";

export async function loadSolPayments(filter: ListFilter & { method?: string }) {
  const supabase = await createClient();
  let query = supabase.from("customer_payments").select(PAYMENT_COLUMNS, { count: "exact" }).not("sol_job_id", "is", null);
  if (filter.status) query = query.eq("status", filter.status as "draft");
  if (filter.method) query = query.eq("method", filter.method as "cash");
  if (filter.q) query = query.or(`doc_no.ilike.%${filter.q}%,reference.ilike.%${filter.q}%`);
  return listPage(query.order("created_at", { ascending: false }).order("doc_no", { ascending: false }).range(firstRow(filter.page), lastRow(filter.page)));
}

/** Payments received for a job, and the client's money that is not used yet. */
export async function loadJobPayments(job: { id: string; customer_id: string }) {
  const supabase = await createClient();
  const [own, allocated, client] = await Promise.all([
    supabase.from("customer_payments").select(PAYMENT_COLUMNS).eq("sol_job_id", job.id).order("created_at"),
    supabase.from("customer_payment_allocations").select(`amount, payment:customer_payments!customer_payment_allocations_customer_payment_id_fkey(${PAYMENT_COLUMNS})`).eq("sol_job_id", job.id),
    supabase.from("customer_payments").select("id, doc_no, payment_date, amount, customer_payment_allocations(amount)").eq("customer_id", job.customer_id).eq("status", "posted").order("created_at"),
  ]);
  for (const r of [own, allocated, client]) if (r.error) throw r.error;
  const rows = new Map((own.data ?? []).map((p) => [p.id, p]));
  for (const a of allocated.data ?? []) if (a.payment) rows.set(a.payment.id, a.payment);
  const unused = (client.data ?? []).map((p) => ({ id: p.id, number: p.doc_no, date: p.payment_date, left: toPaisa(p.amount) - sumPaisa(p.customer_payment_allocations.map((a) => toPaisa(a.amount))) }))
    .filter((p) => p.left > BigInt(0));
  return { rows: [...rows.values()], unused };
}

/** How much of a payment counts for a job. */
export const settledFor = (payment: { customer_payment_allocations: { amount: number; sol_job_id: string | null }[] }, jobId: string) =>
  sumPaisa(payment.customer_payment_allocations.filter((a) => a.sol_job_id === jobId).map((a) => toPaisa(a.amount)));

/** Jobs money or costs can still be recorded for. */
export async function loadJobChoices(statuses: JobStatus[]) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sol_jobs").select("id, doc_no, customer:customers!sol_jobs_customer_id_fkey(name, name_ur)").in("status", statuses).order("doc_no", { ascending: false }).limit(300);
  if (error) throw error;
  return data.map((j) => ({ id: j.id, number: j.doc_no, nameEn: j.customer?.name ?? "", nameUr: j.customer?.name_ur ?? null }));
}
