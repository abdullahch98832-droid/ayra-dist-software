import type { Metadata } from "next";
import { HandCoins } from "lucide-react";
import { deletePayrollDraftAction, postAdvanceAction, voidAdvanceAction } from "@/features/payroll/actions";
import { loadAdvances, loadPayrollEmployees } from "@/features/payroll/queries";
import { DOCUMENT_TONE } from "@/features/sales/status";
import { fill } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { pageContext, uuidParam } from "@/lib/page-context";
import { toPaisa } from "@/lib/utils/money";
import { ActionButton } from "@/components/documents/action-button";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { formatDate } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { UrlPagination, UrlSearch, UrlSelect } from "@/components/tables/url-filters";

const STATUSES = ["draft", "posted", "void"] as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).payroll.tabs.advances };
}

export default async function AdvancesPage({ searchParams }: PageProps<"/payroll/advances">) {
  const { ctx, t, locale, local } = await pageContext();
  if (!can(ctx, "payroll.view")) return <Forbidden />;
  const p = t.payroll;
  const d = t.documents;
  const query = await searchParams;
  const filter = { ...listParams(query, STATUSES), employeeId: uuidParam(query.employee) };
  const [{ rows, total }, employees] = await Promise.all([loadAdvances(filter), loadPayrollEmployees()]);
  const names = new Map(employees.map((e) => [e.employee_id, e]));
  const payer = can(ctx, "payroll.pay");
  const add = (payer || can(ctx, "payroll.manage")) && <LinkButton href="/payroll/advances/new"><HandCoins aria-hidden />{p.newAdvance}</LinkButton>;
  return (
    <>
      <PageHeader title={p.tabs.advances} actions={add} />
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <UrlSearch placeholder={d.searchNumber} />
          <UrlSelect param="status" label={d.allStatuses} options={STATUSES.map((s) => ({ value: s, label: t.purchasing.statuses[s] }))} />
          <UrlSelect param="employee" label={p.employee} options={employees.map((e) => ({ value: e.employee_id, label: local(e.full_name, e.full_name_ur) }))} />
        </div>
        {rows.length === 0 ? <EmptyState title={p.advanceEmpty} actions={add} /> : (
          <ul className="divide-y rounded-2xl border bg-card shadow-card">
            {rows.map((a) => {
              const e = names.get(a.employee_id);
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium"><Ltr>{a.doc_no}</Ltr> · {e && local(e.full_name, e.full_name_ur)}</p>
                    <p className="text-xs text-muted-foreground"><bdi>{formatDate(a.advance_date, locale)}</bdi> · <bdi>{a.account?.name}</bdi>{a.reason && <> · <bdi>{a.reason}</bdi></>}{a.void_reason && <> · {fill(p.voidNote, { reason: a.void_reason })}</>}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Money amount={toPaisa(a.amount)} locale={locale} className="text-sm font-semibold" />
                    <StatusBadge tone={DOCUMENT_TONE[a.status] ?? "gray"}>{t.purchasing.statuses[a.status]}</StatusBadge>
                    {a.status === "draft" && can(ctx, "payroll.manage") && <ActionButton label={d.deleteDraft} variant="outline" action={deletePayrollDraftAction.bind(null, "employee_advances", a.id)} success={d.deleted} confirm={{ title: d.confirmDeleteTitle, description: d.confirmDelete, tone: "danger" }} />}
                    {a.status === "draft" && payer && <ActionButton label={p.postAdvance} action={postAdvanceAction.bind(null, a.id)} success={p.advancePosted} confirm={{ title: p.advanceTitle, description: p.advancePosts }} />}
                    {a.status === "posted" && payer && <ActionButton label={p.voidAdvance} variant="outline" action={voidAdvanceAction.bind(null, a.id)} reasonLabel={d.reason} success={p.advanceVoided} confirm={{ title: p.voidAdvanceTitle, description: p.voidAdvanceHint, tone: "danger" }} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <UrlPagination page={filter.page} pageSize={LIST_PAGE} total={total} />
      </div>
    </>
  );
}
