import type { Metadata } from "next";
import { Plus, SearchX } from "lucide-react";
import { fill } from "@/i18n/format";
import { getLocale, getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { likeTerm } from "@/lib/supabase/like-term";
import { createClient } from "@/lib/supabase/server";
import { EMPLOYMENT_STATUSES, type EmploymentStatus } from "@/lib/validation/employees";
import { EMPLOYEE_COLUMNS, signedPhotoUrls, type EmployeeRecord } from "@/features/employees/queries";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { formatNumber } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { UrlSearch, UrlSelect } from "@/components/tables/url-filters";
import { EmployeesTable } from "./employees-table";

const LIMIT = 500;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).employees.title };
}

export default async function EmployeesPage({ searchParams }: PageProps<"/employees">) {
  const ctx = await requireActiveSession();
  if (!can(ctx, "employees.view")) return <Forbidden />;
  const [t, locale, params] = await Promise.all([getT(), getLocale(), searchParams]);
  const term = typeof params.q === "string" ? likeTerm(params.q) : "";
  const status = EMPLOYMENT_STATUSES.find((s) => s === params.status) as EmploymentStatus | undefined;

  const supabase = await createClient();
  let query = supabase.from("employees").select(EMPLOYEE_COLUMNS).order("full_name").limit(LIMIT);
  if (term) query = query.or(`full_name.ilike.%${term}%,full_name_ur.ilike.%${term}%,employee_code.ilike.%${term}%,phone.ilike.%${term}%`);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.returns<EmployeeRecord[]>();
  if (error) throw error;
  const photos = await signedPhotoUrls(data.map((e) => e.photo_path));
  const canManage = can(ctx, "employees.manage");
  const filtered = !!term || !!status;
  const addButton = canManage && <LinkButton href="/employees/new"><Plus aria-hidden />{t.employees.add}</LinkButton>;

  return (
    <>
      <PageHeader title={t.employees.title} description={t.employees.subtitle} actions={addButton} />
      <div className="grid gap-4">
        {data.length === LIMIT && <FormAlert tone="info">{fill(t.table.truncated, { count: formatNumber(LIMIT, locale) })}</FormAlert>}
        <EmployeesTable
          rows={data.map((e) => ({
            id: e.id, code: e.employee_code, name: e.full_name, nameUr: e.full_name_ur, jobTitle: e.job_title,
            department: e.department, phone: e.phone, status: e.status, photoUrl: e.photo_path ? photos.get(e.photo_path) : undefined,
          }))}
          toolbar={
            <>
              <UrlSearch placeholder={t.employees.searchPlaceholder} />
              <UrlSelect param="status" label={t.employees.allStatuses} options={EMPLOYMENT_STATUSES.map((s) => ({ value: s, label: t.employees.statusLabels[s] }))} />
            </>
          }
          empty={filtered
            ? { title: t.table.noMatches, description: t.table.noMatchesHint, action: <LinkButton variant="outline" href="/employees"><SearchX aria-hidden />{t.common.clear}</LinkButton> }
            : { title: t.states.emptyTitle, description: canManage ? t.employees.emptyHint : undefined, action: addButton }}
        />
      </div>
    </>
  );
}
