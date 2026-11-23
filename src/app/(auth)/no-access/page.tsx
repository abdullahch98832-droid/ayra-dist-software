import { redirect } from "next/navigation";
import { AUTH_CONFIG } from "@/config/auth";
import { getT } from "@/i18n/server";
import { getSessionContext } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { AuthPanel } from "@/components/layout/auth-panel";
import { signOutAction } from "../actions";

export default async function NoAccessPage() {
  const t = await getT();
  const ctx = await getSessionContext();
  if (!ctx) redirect(AUTH_CONFIG.loginPath);
  if (ctx.isActive && ctx.role) redirect(AUTH_CONFIG.homePath);

  return (
    <AuthPanel title={t.auth.noAccessTitle} description={ctx.isActive ? t.auth.noAccessNoRole : t.auth.noAccessSuspended}>
      <form action={signOutAction}>
        <Button type="submit" variant="outline" className="w-full">{t.auth.signOut}</Button>
      </form>
    </AuthPanel>
  );
}
