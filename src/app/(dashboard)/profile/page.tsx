import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { getLocale, getT } from "@/i18n/server";
import { requireActiveSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { LanguageMenu } from "@/components/layout/language-menu";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).profile.title };
}

export default async function ProfilePage() {
  const [ctx, t, locale] = await Promise.all([requireActiveSession(), getT(), getLocale()]);
  const supabase = await createClient();
  const { data: employee } = ctx.employeeId
    ? await supabase.from("employees").select("employee_code, full_name, full_name_ur").eq("id", ctx.employeeId).maybeSingle()
    : { data: null };
  const employeeName = employee && (locale === "ur" && employee.full_name_ur ? employee.full_name_ur : employee.full_name);

  return (
    <>
      <PageHeader title={t.profile.title} description={t.profile.subtitle} />
      <div className="grid max-w-4xl gap-6">
        <SectionCard title={t.profile.account}>
          <DescriptionList
            items={[
              { label: t.common.name, value: ctx.fullName },
              { label: t.common.email, value: <Ltr>{ctx.email}</Ltr> },
              { label: t.profile.role, value: ctx.role ? (locale === "ur" ? ctx.role.nameUr : ctx.role.nameEn) : null },
              { label: t.profile.linkedEmployee, value: employee ? <>{employeeName} · <Ltr>{employee.employee_code}</Ltr></> : t.users.noEmployee },
            ]}
          />
        </SectionCard>
        <SectionCard title={t.profile.preferences}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-lg">
              <p className="text-sm font-medium">{t.common.language}</p>
              <p className="text-sm text-muted-foreground">{t.profile.languageHint}</p>
            </div>
            <LanguageMenu />
          </div>
        </SectionCard>
        <SectionCard title={t.profile.security}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-lg">
              <p className="text-sm font-medium">{t.auth.password}</p>
              <p className="text-sm text-muted-foreground">{t.profile.changePasswordHint}</p>
            </div>
            <LinkButton variant="outline" href="/reset-password"><KeyRound aria-hidden />{t.profile.changePassword}</LinkButton>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
