import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { FormAlert } from "@/components/forms/field";
import { AuthPanel } from "@/components/layout/auth-panel";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).auth.signIn };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const t = await getT();
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : undefined;
  const next = typeof params.next === "string" ? params.next : undefined;
  const linkError = params.error === "link";
  const configured = !!getSupabasePublicEnv();

  return (
    <AuthPanel title={t.auth.loginTitle} description={t.auth.loginSubtitle}>
      {!configured && <FormAlert>{t.auth.notConfigured}</FormAlert>}
      {reason === "idle" && <FormAlert tone="info">{t.auth.sessionIdle}</FormAlert>}
      {reason === "expired" && <FormAlert tone="info">{t.auth.sessionExpired}</FormAlert>}
      {linkError && <FormAlert>{t.auth.linkInvalid}</FormAlert>}
      <LoginForm next={next} disabled={!configured} />
    </AuthPanel>
  );
}
