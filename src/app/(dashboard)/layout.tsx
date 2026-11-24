import { cookies } from "next/headers";
import { getNotifications } from "@/features/notifications/queries";
import { getLocale } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { databaseUpdateNeeded } from "@/lib/supabase/schema-state";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [ctx, locale, cookieStore] = await Promise.all([requireActiveSession(), getLocale(), cookies()]);
  const updateNeeded = await databaseUpdateNeeded();
  return (
    <AppShell
      user={{
        fullName: ctx.fullName,
        email: ctx.email,
        roleName: ctx.role ? (locale === "ur" ? ctx.role.nameUr : ctx.role.nameEn) : "",
      }}
      permissions={[...ctx.permissions]}
      databaseUpdate={{ needed: updateNeeded, admin: can(ctx, "settings.manage") }}
      notifications={getNotifications(ctx)}
      sidebarOpen={cookieStore.get("ayra_sidebar")?.value !== "false"}
    >
      {children}
    </AppShell>
  );
}
