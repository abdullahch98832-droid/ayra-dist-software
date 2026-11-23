import { getLocale, getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/components/shared/format";

type Data = Record<string, unknown> | null;
const TRACKED = ["full_name", "role_id", "employee_id", "is_active", "removed_at", "name_en", "name_ur", "description", "permission_code"];

export default async function AccessHistoryPage() {
  const ctx = await requireActiveSession();
  if (!can(ctx, "audit.view")) return <Forbidden />;
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const supabase = await createClient();

  const [{ data: rows, error }, { data: roles }, { data: users }] = await Promise.all([
    supabase.from("v_access_audit").select("id, occurred_at, actor_name, table_name, record_id, action, old_data, new_data")
      .order("occurred_at", { ascending: false }).limit(300),
    supabase.from("roles").select("id, name_en, name_ur"),
    can(ctx, "users.view") ? supabase.from("profiles").select("id, full_name") : Promise.resolve({ data: [] }),
  ]);
  if (error) throw error;

  const roleName = new Map((roles ?? []).map((r) => [r.id, locale === "ur" ? r.name_ur : r.name_en]));
  const userName = new Map((users ?? []).map((u) => [u.id, u.full_name]));
  const tables = t.audit.tables as Record<string, string>;
  const actions = t.audit.actions as Record<string, string>;

  const show = (key: string, value: unknown) => {
    if (value === null || value === undefined) return "—";
    if (key === "role_id") return roleName.get(String(value)) ?? String(value);
    return String(value);
  };
  const describe = (row: { table_name: string | null; old_data: unknown; new_data: unknown; record_id: string | null }) => {
    const before = (row.old_data ?? null) as Data;
    const after = (row.new_data ?? null) as Data;
    const subject = row.table_name === "profiles" ? userName.get(row.record_id ?? "") ?? row.record_id
      : row.table_name === "role_permissions" ? `${roleName.get(String((after ?? before)?.role_id)) ?? ""}`
      : String((after ?? before)?.name_en ?? "");
    const changes = TRACKED.flatMap((key) => {
      const a = before?.[key];
      const b = after?.[key];
      if (JSON.stringify(a) === JSON.stringify(b) || (before && after && !(key in after))) return [];
      if (!before) return b === undefined || b === null ? [] : [`${key}: ${show(key, b)}`];
      if (!after) return a === undefined || a === null ? [] : [`${key}: ${show(key, a)}`];
      return [`${key}: ${show(key, a)} → ${show(key, b)}`];
    });
    return { subject, changes };
  };

  return (
    <>
      <PageHeader title={t.audit.title} description={t.audit.subtitle} />
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">{t.audit.when}</TableHead>
              <TableHead className="text-start">{t.audit.who}</TableHead>
              <TableHead className="text-start">{t.audit.what}</TableHead>
              <TableHead className="text-start">{t.audit.record}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rows ?? []).length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">{t.common.noResults}</TableCell></TableRow>
            )}
            {(rows ?? []).map((row) => {
              const { subject, changes } = describe(row);
              return (
                <TableRow key={row.id} className="align-top">
                  <TableCell className="whitespace-nowrap text-sm">{formatDateTime(row.occurred_at, locale)}</TableCell>
                  <TableCell className="text-sm">{row.actor_name ?? t.audit.system}</TableCell>
                  <TableCell className="text-sm">
                    {actions[row.action ?? ""] ?? row.action} · {tables[row.table_name ?? ""] ?? row.table_name}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{subject}</div>
                    <ul className="mt-1 grid gap-0.5 font-mono text-xs text-muted-foreground" dir="ltr">
                      {changes.map((c) => <li key={c} className="break-all">{c}</li>)}
                    </ul>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
