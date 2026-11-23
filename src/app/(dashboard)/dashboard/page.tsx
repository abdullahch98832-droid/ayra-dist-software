import { getLocale, getT } from "@/i18n/server";
import { requireActiveSession } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";

export default async function DashboardPage() {
  const [ctx, t, locale] = await Promise.all([requireActiveSession(), getT(), getLocale()]);
  const roleName = ctx.role ? (locale === "ur" ? ctx.role.nameUr : ctx.role.nameEn) : "";

  return (
    <>
      <PageHeader title={`${t.dashboard.welcome}, ${ctx.fullName || ctx.email}`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{t.dashboard.yourRole}</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{roleName}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{t.dashboard.yourPermissions}</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{ctx.permissions.size}</CardContent>
        </Card>
      </div>
      <p className="mt-8 text-sm text-muted-foreground">{t.dashboard.comingSoon}</p>
    </>
  );
}
