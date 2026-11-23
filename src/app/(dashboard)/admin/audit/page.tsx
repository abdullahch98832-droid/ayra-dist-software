import type { Metadata } from "next";
import { loadAccessAudit } from "@/features/audit/access-audit";
import { getLocale, getT } from "@/i18n/server";
import { fill } from "@/i18n/format";
import { can, requireActiveSession } from "@/lib/auth/session";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { AuditTable } from "./audit-table";

const LIMIT = 300;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).audit.title };
}

export default async function AccessHistoryPage() {
  const ctx = await requireActiveSession();
  if (!can(ctx, "audit.view")) return <Forbidden />;
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const rows = await loadAccessAudit(ctx, t, locale, LIMIT);
  return (
    <>
      <PageHeader title={t.audit.title} description={t.audit.subtitle} />
      <div className="grid gap-4">
        {rows.length === LIMIT && <FormAlert tone="info">{fill(t.table.latest, { count: LIMIT })}</FormAlert>}
        <AuditTable rows={rows} />
      </div>
    </>
  );
}
