import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { loadAllCategories, loadExpenses } from "@/features/expenses/queries";
import { loadVehicles } from "@/features/fleet/queries";
import { EXPENSE_STATUSES, expenseStatus } from "@/features/expenses/schema";
import { expenseOptions } from "@/features/expenses/status";
import { peopleNames } from "@/features/payments/contributors";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { pageContext, uuidParam } from "@/lib/page-context";
import { Forbidden } from "@/components/layout/forbidden";
import { DocumentLink } from "@/components/documents/document-link";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/shared/link-button";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSearch, UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).expenses.title };
}

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const { ctx, t, local } = await pageContext();
  if (!can(ctx, "expenses.view") && !can(ctx, "expenses.create") && !can(ctx, "expenses.post")) return <Forbidden />;
  const x = t.expenses;
  const query = await searchParams;
  const filter = { ...listParams(query, EXPENSE_STATUSES), vehicleId: uuidParam(query.vehicle), jobId: uuidParam(query.job), categoryId: uuidParam(query.category) };
  const [{ rows, total }, categories, vehicles] = await Promise.all([loadExpenses(filter), loadAllCategories(), can(ctx, "vehicles.view") ? loadVehicles() : []]);
  const poster = can(ctx, "expenses.post");
  // Drafts by whoever recorded them or may approve them; approved vouchers by those who may approve.
  const editable = (e: (typeof rows)[number]) => {
    const status = expenseStatus(e);
    return (status === "draft" && (poster || (e.created_by === ctx.userId && can(ctx, "expenses.create")))) || (status === "posted" && poster);
  };
  const add = can(ctx, "expenses.create") && <LinkButton href="/expenses/new"><Plus aria-hidden />{x.add}</LinkButton>;
  return (
    <>
      <PageHeader title={x.title} description={x.subtitle} actions={<>{can(ctx, "reports.export") && <DocumentLink kind="report" params={{ report: "expenses", table: "vouchers", status: filter.status || null, category: filter.categoryId }} label={t.docs.pdf} />}{add}</>} />
      <SpecTable
        caption={x.title}
        rows={rows.map((e) => ({
          id: e.id, no: e.doc_no, noHref: `/expenses/${e.id}`, description: e.description, receipt: e.receipt_path ? null : x.noReceipt, date: e.expense_date, category: e.category && local(e.category.name_en, e.category.name_ur), payee: e.payee, vehicle: e.vehicle?.registration_no, job: e.job?.doc_no,
          jobHref: e.job && can(ctx, "sol.view") ? `/sol/jobs/${e.job.id}` : undefined, account: peopleNames(e.contributors) ?? e.account?.name, accountSub: peopleNames(e.contributors) ? e.account?.name : null, amount: e.amount, status: expenseStatus(e),
          ...(editable(e) ? { edit: x.edit, editHref: `/expenses/${e.id}/edit` } : {}),
        }))}
        columns={[
          { key: "no", sub: "receipt", label: x.voucherNo, kind: "link", primary: true }, { key: "date", label: x.date, kind: "date" }, { key: "category", sub: "description", label: x.category, kind: "text" }, { key: "payee", label: x.payee, kind: "text", hideBelow: "lg" },
          { key: "vehicle", label: x.vehicle, kind: "code", hideBelow: "2xl" }, { key: "job", label: x.job, kind: "link", hideBelow: "2xl" }, { key: "account", sub: "accountSub", label: x.paidFrom, kind: "text", hideBelow: "xl" }, { key: "amount", label: x.amount, kind: "money" },
          { key: "status", label: t.common.status, kind: "status", options: expenseOptions(t) },
          ...(rows.some(editable) ? [{ key: "edit", label: "", kind: "action" as const }] : []),
        ]}
        server={{ page: filter.page, pageSize: LIST_PAGE, total }}
        toolbar={
          <>
            <UrlSearch placeholder={x.search} />
            <UrlSelect param="status" label={t.documents.allStatuses} options={EXPENSE_STATUSES.map((s) => ({ value: s, label: x.statuses[s] }))} />
            <UrlSelect param="category" label={x.allCategories} options={categories.filter((c) => !c.is_payroll).map((c) => ({ value: c.id, label: local(c.name_en, c.name_ur) }))} />
            {vehicles.length > 0 && <UrlSelect param="vehicle" label={x.allVehicles} options={vehicles.map((v) => ({ value: v.id, label: `${v.registration_no} · ${v.name}` }))} />}
          </>
        }
        empty={{ title: x.empty, description: x.emptyHint, action: add }}
      />
    </>
  );
}
