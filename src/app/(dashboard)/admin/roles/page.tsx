import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { RoleEditor } from "./role-editor";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).roles.title };
}

export default async function RolesPage({ searchParams }: PageProps<"/admin/roles">) {
  const ctx = await requireActiveSession();
  if (!can(ctx, "users.view")) return <Forbidden />;
  const t = await getT();
  const supabase = await createClient();
  const params = await searchParams;

  const [roles, permissions, grants, profiles] = await Promise.all([
    supabase.from("roles").select("id, code, name_en, name_ur, description, is_system").order("is_system", { ascending: false }).order("name_en"),
    supabase.from("permissions").select("code, module, description_en, description_ur").order("code"),
    supabase.from("role_permissions").select("role_id, permission_code"),
    supabase.from("profiles").select("role_id").eq("is_active", true),
  ]);
  for (const r of [roles, permissions, grants, profiles]) if (r.error) throw r.error;

  const userCounts: Record<string, number> = {};
  for (const p of profiles.data ?? []) if (p.role_id) userCounts[p.role_id] = (userCounts[p.role_id] ?? 0) + 1;

  return (
    <>
      <PageHeader title={t.roles.title} description={t.roles.subtitle} />
      <RoleEditor
        roles={roles.data ?? []}
        permissions={permissions.data ?? []}
        grants={grants.data ?? []}
        userCounts={userCounts}
        canManage={can(ctx, "users.manage")}
        initialRoleId={typeof params.role === "string" ? params.role : undefined}
      />
    </>
  );
}
