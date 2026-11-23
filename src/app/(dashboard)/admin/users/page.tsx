import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { UsersTable } from "./users-table";

export default async function UsersPage() {
  const ctx = await requireActiveSession();
  if (!can(ctx, "users.view")) return <Forbidden />;
  const t = await getT();
  const supabase = await createClient();

  const [users, roles, employees] = await Promise.all([
    supabase.rpc("admin_list_users"),
    supabase.from("roles").select("id, code, name_en, name_ur").order("name_en"),
    can(ctx, "employees.view")
      ? supabase.from("employees").select("id, employee_code, full_name").order("full_name")
      : Promise.resolve({ data: [] as { id: string; employee_code: string; full_name: string }[] }),
  ]);
  if (users.error) throw users.error;

  return (
    <>
      <PageHeader title={t.users.title} description={t.users.subtitle} />
      <UsersTable
        users={users.data ?? []}
        roles={roles.data ?? []}
        employees={employees.data ?? []}
        currentUserId={ctx.userId}
        canManage={can(ctx, "users.manage")}
      />
    </>
  );
}
