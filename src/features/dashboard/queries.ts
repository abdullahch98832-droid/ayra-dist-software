import "server-only";
import { createClient } from "@/lib/supabase/server";
import { lowStockSchema, overdueSchema, performanceSchema, positionSchema, type LowStock, type Overdue, type Performance, type Position } from "./schema";
import type { Period } from "./period";

// One database call each, run in parallel by the page. Permissions are enforced inside
// the functions (totals) or by row level security (lists).

export async function loadPosition(): Promise<Position> {
  const { data, error } = await (await createClient()).rpc("dashboard_position");
  if (error) throw error;
  return positionSchema.parse(data);
}

export async function loadPerformance({ from, to }: Pick<Period, "from" | "to">): Promise<Performance> {
  const { data, error } = await (await createClient()).rpc("dashboard_performance", { p_from: from, p_to: to });
  if (error) throw error;
  return performanceSchema.parse(data);
}

export async function loadOverdue(): Promise<Overdue> {
  const { data, error } = await (await createClient()).rpc("dashboard_overdue", { p_limit: 5 });
  if (error) throw error;
  return overdueSchema.parse(data);
}

export async function loadLowStock(): Promise<LowStock> {
  const { data, error } = await (await createClient()).rpc("dashboard_low_stock", { p_limit: 6 });
  if (error) throw error;
  return lowStockSchema.parse(data);
}

export async function loadPendingDeliveries() {
  const { data, error } = await (await createClient()).rpc("dashboard_pending_deliveries", { p_limit: 6 });
  if (error) throw error;
  return data;
}

export async function loadRecentOrders() {
  const { data, error } = await (await createClient()).rpc("dashboard_recent_orders", { p_limit: 6 });
  if (error) throw error;
  return data;
}

export async function loadRecentTransactions() {
  const { data, error } = await (await createClient()).rpc("dashboard_recent_transactions", { p_limit: 8 });
  if (error) throw error;
  return data;
}

export async function loadMyRecords() {
  const { data, error } = await (await createClient()).rpc("dashboard_my_records", { p_limit: 8 });
  if (error) throw error;
  return data;
}

export async function loadOpenWork() {
  const { data, error } = await (await createClient()).rpc("dashboard_open_work");
  if (error) throw error;
  return data;
}
