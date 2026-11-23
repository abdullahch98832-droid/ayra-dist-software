import { cookies } from "next/headers";
import { getNotifications } from "@/features/notifications/queries";
import { getLocale } from "@/i18n/server";
import { requireActiveSession } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [ctx, locale, cookieStore] = await Promise.all([requireActiveSession(), getLocale(), cookies()]);
  return (
    <AppShell
      user={{
        fullName: ctx.fullName,
        email: ctx.email,
        roleName: ctx.role ? (locale === "ur" ? ctx.role.nameUr : ctx.role.nameEn) : "",
      }}
      permissions={[...ctx.permissions]}
      notifications={getNotifications(ctx)}
      sidebarOpen={cookieStore.get("ayra_sidebar")?.value !== "false"}
    >
      {children}
    </AppShell>
  );
}
