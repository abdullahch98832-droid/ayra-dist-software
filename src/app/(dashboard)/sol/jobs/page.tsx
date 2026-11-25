import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { businessToday } from "@/features/dashboard/period";
import { loadJobs, loadJobTypes, loadStaff } from "@/features/sol/queries";
import { isOpenJob, JOB_STATUSES, jobOptions } from "@/features/sol/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { pageContext, uuidParam } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSearch, UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).sol.tabs.jobs };
}

export default async function JobsPage({ searchParams }: PageProps<"/sol/jobs">) {
  const { ctx, t, local } = await pageContext();
  if (!can(ctx, "sol.view")) return <Forbidden />;
  const s = t.sol;
  const query = await searchParams;
  const filter = { ...listParams(query, ["pending", ...JOB_STATUSES]), typeId: uuidParam(query.type), responsibleId: uuidParam(query.responsible), orders: false };
  const [{ rows, total }, types, staff] = await Promise.all([loadJobs(filter), loadJobTypes(), loadStaff()]);
  const names = new Map(staff.map((x) => [x.id, x]));
  const today = businessToday();
  const add = can(ctx, "sol.manage") && <LinkButton href="/sol/jobs/new"><Plus aria-hidden />{s.newJob}</LinkButton>;
  return (
    <>
      <PageHeader title={s.tabs.jobs} actions={add} />
      <SpecTable
        caption={s.tabs.jobs}
        rows={rows.map((j) => {
          const who = names.get(j.responsible_employee_id ?? "");
          return {
            id: j.id, no: j.doc_no, noHref: `/sol/jobs/${j.id}`, description: j.description, client: j.customer ? local(j.customer.name, j.customer.name_ur) : null, type: j.type ? local(j.type.name_en, j.type.name_ur) : null,
            date: j.job_date, due: j.due_date, late: isOpenJob(j.status) && j.due_date !== null && j.due_date < today ? s.overdue : null, responsible: who ? local(who.nameEn, who.nameUr) : null, contract: j.contract_value, status: j.status,
          };
        })}
        columns={[
          { key: "no", label: s.jobNo, kind: "link", primary: true },
          { key: "client", sub: "description", label: s.client, kind: "text" },
          { key: "type", label: s.type, kind: "text", hideBelow: "xl" },
          { key: "responsible", label: s.responsible, kind: "text", hideBelow: "xl" },
          { key: "date", label: s.jobDate, kind: "date", hideBelow: "lg" },
          { key: "due", sub: "late", label: s.dueDate, kind: "date", hideBelow: "lg" },
          { key: "contract", label: s.contract, kind: "money" },
          { key: "status", label: t.common.status, kind: "status", options: jobOptions(t) },
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={
          <>
            <UrlSearch placeholder={s.searchJobs} />
            <UrlSelect param="status" label={t.documents.allStatuses} options={[{ value: "pending", label: s.pendingStatus }, ...JOB_STATUSES.map((x) => ({ value: x, label: s.statuses[x] }))]} />
            {types.length > 1 && <UrlSelect param="type" label={s.allTypes} options={types.map((x) => ({ value: x.id, label: local(x.nameEn, x.nameUr) }))} />}
          </>
        }
        empty={{ title: s.jobEmpty, description: s.jobEmptyHint, action: add }}
      />
    </>
  );
}
