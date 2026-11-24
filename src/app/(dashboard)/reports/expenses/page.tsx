import type { Metadata } from "next";
import { expenseRegister, reportExpenses } from "@/features/expenses/queries";
import { EXPENSE_STATUSES, type ExpenseStatus } from "@/features/expenses/schema";
import { expenseOptions } from "@/features/expenses/status";
import { REPORTS } from "@/features/reports/catalog";
import { reportPage } from "@/features/reports/page-context";
import { getT } from "@/i18n/server";
import { uuidParam } from "@/lib/page-context";
import { PeriodFrame } from "@/components/dashboard/period-frame";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { SpecTable } from "@/components/tables/spec-table";
import { UrlSelect } from "@/components/tables/url-filters";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).reports.expenses };
}

export default async function ExpenseReport({ searchParams }: PageProps<"/reports/expenses">) {
  const { t, query, today, period, allowed, local } = await reportPage(REPORTS.expenses, searchParams);
  if (!allowed) return <Forbidden />;
  const x = t.expenses;
  const status = EXPENSE_STATUSES.find((s) => s === query.status) ?? null;
  const [categories, rows] = await Promise.all([reportExpenses(period.from, period.to), expenseRegister(period.from, period.to, uuidParam(query.category), status)]);
  return (
    <>
      <PageHeader title={t.reports.expenses} breadcrumbs={[{ label: t.reports.title, href: "/reports" }]} />
      <PeriodFrame key={`${period.preset}-${period.from}-${period.to}`} period={period} today={today} title={t.reports.expenses} description={t.reports.expensesHint}>
        <SpecTable
          caption={x.category}
          rows={categories.filter((c) => c.amount !== 0).map((c) => ({ id: c.category_id, name: local(c.name_en, c.name_ur), note: c.is_payroll ? x.payrollCategory : null, n: c.vouchers, amount: c.amount }))}
          columns={[{ key: "name", sub: "note", label: x.category, kind: "text", primary: true }, { key: "n", label: x.tabs.vouchers, kind: "quantity" }, { key: "amount", label: x.amount, kind: "money", total: true }]}
          initialSort={{ id: "amount", descending: true }}
          empty={{ title: t.reports.empty }}
        />
        <SpecTable
          caption={x.tabs.vouchers}
          exportName={`expenses-${period.from}-${period.to}`}
          rows={rows.map((r) => ({
            id: r.expense_id, no: r.doc_no, noHref: `/expenses/${r.expense_id}`, date: r.expense_date, category: local(r.category_en, r.category_ur), description: r.description, payee: r.payee, method: r.method ? t.purchasing.methods[r.method] : null, account: r.account,
            receipt: r.has_receipt ? null : x.noReceipt, recorded: r.recorded_by, decided: r.decided_by, amount: r.amount, status: r.status as ExpenseStatus,
          }))}
          columns={[
            { key: "no", sub: "receipt", label: x.voucherNo, kind: "link", primary: true }, { key: "date", label: x.date, kind: "date" }, { key: "category", sub: "description", label: x.category, kind: "text" }, { key: "payee", label: x.payee, kind: "text", hideBelow: "lg" },
            { key: "method", sub: "account", label: x.method, kind: "text", hideBelow: "2xl" }, { key: "recorded", label: x.recordedBy, kind: "text", hideBelow: "2xl" }, { key: "decided", label: x.approvedBy, kind: "text", hideBelow: "2xl" },
            { key: "amount", label: x.amount, kind: "money" }, { key: "status", label: t.common.status, kind: "status", options: expenseOptions(t) },
          ]}
          searchKeys={["no", "category", "description", "payee", "recorded", "decided"]}
          toolbar={<><UrlSelect param="category" label={x.allCategories} options={categories.filter((c) => !c.is_payroll).map((c) => ({ value: c.category_id, label: local(c.name_en, c.name_ur) }))} /><UrlSelect param="status" label={t.documents.allStatuses} options={EXPENSE_STATUSES.map((s) => ({ value: s, label: x.statuses[s] }))} /></>}
          empty={{ title: t.reports.empty, description: t.reports.emptyHint }}
        />
      </PeriodFrame>
    </>
  );
}
