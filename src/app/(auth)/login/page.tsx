import Link from "next/link";
import { getT } from "@/i18n/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormAlert } from "@/components/forms/field";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const t = await getT();
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : undefined;
  const next = typeof params.next === "string" ? params.next : undefined;
  const linkError = params.error === "link";
  const configured = !!getSupabasePublicEnv();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.auth.loginTitle}</CardTitle>
        <CardDescription>{t.auth.loginSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!configured && <FormAlert>{t.auth.notConfigured}</FormAlert>}
        {reason === "idle" && <FormAlert tone="info">{t.auth.sessionIdle}</FormAlert>}
        {reason === "expired" && <FormAlert tone="info">{t.auth.sessionExpired}</FormAlert>}
        {linkError && <FormAlert>{t.auth.linkInvalid}</FormAlert>}
        <LoginForm next={next} disabled={!configured} />
        <Link href="/forgot-password" className="text-center text-sm text-primary hover:underline">
          {t.auth.forgotPassword}
        </Link>
      </CardContent>
    </Card>
  );
}
