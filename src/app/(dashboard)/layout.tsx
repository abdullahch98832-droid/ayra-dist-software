import { getLocale } from "@/i18n/server";
import { requireActiveSession } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [ctx, locale] = await Promise.all([requireActiveSession(), getLocale()]);
  return (
    <AppShell
      user={{
        fullName: ctx.fullName,
        email: ctx.email,
        roleName: ctx.role ? (locale === "ur" ? ctx.role.nameUr : ctx.role.nameEn) : "",
      }}
      permissions={[...ctx.permissions]}
    >
      {children}
    </AppShell>
  );
}
