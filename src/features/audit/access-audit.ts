import "server-only";
import type { Dictionary } from "@/i18n";
import type { Locale } from "@/types";
import { can, type SessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type Data = Record<string, unknown> | null;

export interface AccessAuditRow {
  id: string;
  occurredAt: string;
  actor: string;
  action: string;
  subject: string;
  changes: { field: string; before?: string; after?: string }[];
}

/** Access history prepared for display: ids become names, field codes become labels. */
export async function loadAccessAudit(ctx: SessionContext, t: Dictionary, locale: Locale, limit: number): Promise<AccessAuditRow[]> {
  const supabase = await createClient();
  const [{ data: rows, error }, { data: roles }, { data: users }] = await Promise.all([
    supabase.from("v_access_audit").select("id, occurred_at, actor_name, table_name, record_id, action, old_data, new_data")
      .order("occurred_at", { ascending: false }).limit(limit),
    supabase.from("roles").select("id, name_en, name_ur"),
    can(ctx, "users.view") ? supabase.from("profiles").select("id, full_name") : Promise.resolve({ data: [] }),
  ]);
  if (error) throw error;

  const roleName = new Map((roles ?? []).map((r) => [r.id, locale === "ur" ? r.name_ur : r.name_en]));
  const userName = new Map((users ?? []).map((u) => [u.id, u.full_name]));
  const tables = t.audit.tables as Record<string, string>;
  const actions = t.audit.actions as Record<string, string>;
  const fields = Object.entries(t.audit.fields);

  const show = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return undefined;
    if (typeof value === "boolean") return value ? t.audit.yes : t.audit.no;
    if (key === "role_id") return roleName.get(String(value)) ?? String(value);
    return String(value);
  };

  return (rows ?? []).map((row) => {
    const before = (row.old_data ?? null) as Data;
    const after = (row.new_data ?? null) as Data;
    const record = after ?? before;
    const subject =
      row.table_name === "profiles" ? userName.get(row.record_id ?? "") ?? row.record_id ?? ""
      : row.table_name === "role_permissions" ? roleName.get(String(record?.role_id)) ?? ""
      : String((locale === "ur" ? record?.name_ur : record?.name_en) ?? record?.name_en ?? "");
    const changes = fields.flatMap(([key, label]) => {
      if (before && after && (!(key in after) || JSON.stringify(before[key]) === JSON.stringify(after[key]))) return [];
      const from = show(key, before?.[key]);
      const to = show(key, after?.[key]);
      return from === undefined && to === undefined ? [] : [{ field: label, before: from, after: to }];
    });
    return {
      id: String(row.id),
      occurredAt: row.occurred_at ?? "",
      actor: row.actor_name ?? t.audit.system,
      action: `${tables[row.table_name ?? ""] ?? row.table_name ?? ""} · ${actions[row.action ?? ""] ?? row.action ?? ""}`,
      subject,
      changes,
    };
  });
}
