import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { accountLabel, loadPaymentAccounts } from "@/features/cash-bank/queries";
import { businessToday } from "@/features/dashboard/period";
import { updateExpenseAction } from "@/features/expenses/actions";
import { loadExpense, loadExpenseCategories } from "@/features/expenses/queries";
import type { ExpenseValues } from "@/features/expenses/schema";
import { readContributors } from "@/features/payments/contributors";
import { loadVehicles } from "@/features/fleet/queries";
import { loadJobChoices } from "@/features/sol/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { PageHeader } from "@/components/layout/page-header";
import { ExpenseForm } from "../../expense-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).expenses.edit };
}

export default async function EditExpensePage({ params }: PageProps<"/expenses/[id]/edit">) {
  const { id, ctx, t, local } = await pageContext(params);
  const e = await loadExpense(id);
  const poster = can(ctx, "expenses.post");
  const posted = e?.status === "posted" && !!e.journal_entry_id;
  if (!e || !(e.status === "draft" || (posted && poster)) || (!poster && e.created_by !== ctx.userId)) notFound();
  const seesJobs = can(ctx, "sol.view");
  const [accounts, categories, vehicles, jobs] = await Promise.all([
    loadPaymentAccounts(), loadExpenseCategories(), can(ctx, "vehicles.view") || seesJobs ? loadVehicles() : [], seesJobs ? loadJobChoices(["confirmed", "in_progress", "completed"]) : [],
  ]);
  return (
    <>
      <PageHeader title={t.expenses.edit} breadcrumbs={[{ label: t.expenses.title, href: "/expenses" }, { label: e.doc_no, href: `/expenses/${id}` }]} />
      <ExpenseForm
        save={updateExpenseAction.bind(null, id)} openAfter={`/expenses/${id}`} cancelPath={`/expenses/${id}`} maxDate={businessToday()} poster={poster} confirm={false}
        accounts={accounts.filter((a) => a.isActive || a.id === e.financial_account_id).map((a) => ({ id: a.id, label: accountLabel(a) }))} categories={categories}
        vehicles={vehicles.map((v) => ({ id: v.id, label: `${v.registration_no} · ${v.name}` }))} jobs={jobs.map((j) => ({ id: j.id, label: `${j.number} · ${local(j.nameEn, j.nameUr)}` }))}
        defaults={{
          date: e.expense_date, categoryId: e.category_id, amount: toDbAmount(toPaisa(e.amount)), accountId: e.financial_account_id, method: (e.method ?? "cash") as ExpenseValues["method"], reference: e.reference ?? "", payee: e.payee ?? "",
          description: e.description ?? "", vehicleId: e.vehicle_id ?? "", jobId: e.sol_job_id ?? "", litres: e.litres === null ? "" : String(e.litres), odometer: e.odometer === null ? "" : String(e.odometer),
          receiptPath: e.receipt_path ?? "", noReceiptReason: e.no_receipt_reason ?? "", requestId: crypto.randomUUID(), contributors: readContributors(e.contributors),
        }}
      />
    </>
  );
}
