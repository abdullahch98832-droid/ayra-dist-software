import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { getLocale, getT } from "@/i18n/server";
import { can, requireActiveSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { EMPLOYEE_COLUMNS, signedPhotoUrls, type EmployeeRecord } from "@/features/employees/queries";
import { EmployeeAvatar } from "@/features/employees/employee-avatar";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, type BadgeTone } from "@/components/shared/status-badge";

const TONE: Record<EmployeeRecord["status"], BadgeTone> = { active: "green", on_leave: "amber", terminated: "gray" };

export default async function EmployeesPage({ searchParams }: PageProps<"/employees">) {
  const ctx = await requireActiveSession();
  if (!can(ctx, "employees.view")) return <Forbidden />;
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const q = typeof (await searchParams).q === "string" ? String((await searchParams).q).trim() : "";

  const supabase = await createClient();
  let query = supabase.from("employees").select(EMPLOYEE_COLUMNS).order("full_name").limit(500);
  if (q) {
    // Escape characters that are meaningful inside a PostgREST or() filter.
    const term = q.replace(/[,()%_\\]/g, " ").trim();
    if (term) query = query.or(`full_name.ilike.%${term}%,full_name_ur.ilike.%${term}%,employee_code.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  const { data, error } = await query.returns<EmployeeRecord[]>();
  if (error) throw error;
  const photos = await signedPhotoUrls(data.map((e) => e.photo_path));
  const statusLabels = t.employees.statusLabels;

  return (
    <>
      <PageHeader
        title={t.employees.title}
        description={t.employees.subtitle}
        actions={can(ctx, "employees.manage") && (
          <Button render={<Link href="/employees/new" />} className="gap-2"><Plus className="h-4 w-4" />{t.employees.add}</Button>
        )}
      />
      <form className="mb-4 flex max-w-sm items-center gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder={t.common.search} aria-label={t.common.search} />
        <Button type="submit" variant="outline" size="icon" aria-label={t.common.search}><Search className="h-4 w-4" /></Button>
      </form>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">{t.employees.fullName}</TableHead>
              <TableHead className="text-start">{t.employees.code}</TableHead>
              <TableHead className="text-start">{t.employees.jobTitle}</TableHead>
              <TableHead className="text-start">{t.employees.department}</TableHead>
              <TableHead className="text-start">{t.employees.phone}</TableHead>
              <TableHead className="text-start">{t.common.status}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{t.common.noResults}</TableCell></TableRow>
            )}
            {data.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <Link href={`/employees/${e.id}`} className="flex items-center gap-3 hover:underline">
                    <EmployeeAvatar name={e.full_name} url={e.photo_path ? photos.get(e.photo_path) : undefined} />
                    <span>
                      <span className="block font-medium">{locale === "ur" && e.full_name_ur ? e.full_name_ur : e.full_name}</span>
                      {locale === "ur" && e.full_name_ur && <span className="block text-xs text-muted-foreground">{e.full_name}</span>}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs" dir="ltr">{e.employee_code}</TableCell>
                <TableCell>{e.job_title ?? "—"}</TableCell>
                <TableCell>{e.department ?? "—"}</TableCell>
                <TableCell dir="ltr" className="text-start">{e.phone ?? "—"}</TableCell>
                <TableCell><StatusBadge tone={TONE[e.status]}>{statusLabels[e.status]}</StatusBadge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
