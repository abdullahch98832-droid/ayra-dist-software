import "server-only";
import { can, type SessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface EmployeeFigures {
  active: number;
  onLeave: number;
  /** Null when the list is longer than one API page, so a partial count is never shown. */
  byDepartment: { department: string | null; count: number }[] | null;
}

export async function loadEmployeeFigures(ctx: SessionContext): Promise<EmployeeFigures | null> {
  if (!can(ctx, "employees.view")) return null;
  const supabase = await createClient();
  const [active, onLeave, departments] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "on_leave"),
    supabase.from("employees").select("department").eq("status", "active"),
  ]);
  for (const r of [active, onLeave, departments]) if (r.error) throw r.error;

  const rows = departments.data ?? [];
  const counts = new Map<string | null, number>();
  for (const { department } of rows) {
    const key = department?.trim() || null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    active: active.count ?? 0,
    onLeave: onLeave.count ?? 0,
    byDepartment: rows.length === (active.count ?? 0)
      ? [...counts].map(([department, count]) => ({ department, count })).sort((a, b) => b.count - a.count)
      : null,
  };
}

export async function loadUserFigures(ctx: SessionContext): Promise<{ active: number; withoutRole: number } | null> {
  if (!can(ctx, "users.view")) return null;
  const supabase = await createClient();
  const base = () => supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true).is("removed_at", null);
  const [active, withoutRole] = await Promise.all([base().not("role_id", "is", null), base().is("role_id", null)]);
  for (const r of [active, withoutRole]) if (r.error) throw r.error;
  return { active: active.count ?? 0, withoutRole: withoutRole.count ?? 0 };
}
