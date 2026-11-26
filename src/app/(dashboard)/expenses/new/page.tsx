import type { Metadata } from "next";
import { accountLabel, loadPaymentAccounts } from "@/features/cash-bank/queries";
import { recordExpenseAction } from "@/features/expenses/actions";
import { businessToday } from "@/features/dashboard/period";
import { loadExpenseCategories } from "@/features/expenses/queries";
import { loadVehicles } from "@/features/fleet/queries";
import { loadJobChoices } from "@/features/sol/queries";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext, uuidParam } from "@/lib/page-context";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { ExpenseForm } from "../expense-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).expenses.add };
}

export default async function NewExpensePage({ searchParams }: PageProps<"/expenses/new">) {
  const { ctx, t, local } = await pageContext();
  if (!can(ctx, "expenses.create")) return <Forbidden />;
  const query = await searchParams;
  const [vehicle, job] = [uuidParam(query.vehicle), uuidParam(query.job)];
  const seesJobs = can(ctx, "sol.view");
  const [accounts, categories, vehicles, jobs] = await Promise.all([
    loadPaymentAccounts(), loadExpenseCategories(), can(ctx, "vehicles.view") || seesJobs ? loadVehicles() : [], seesJobs ? loadJobChoices(["confirmed", "in_progress", "completed"]) : [],
  ]);
  const active = accounts.filter((a) => a.isActive);
  const cash = active.filter((a) => a.type === "cash");
  return (
    <>
      <PageHeader title={t.expenses.add} breadcrumbs={[{ label: t.expenses.title, href: "/expenses" }]} />
      {active.length === 0 ? <FormAlert tone="info">{t.cashBank.noAccounts}</FormAlert> : (
        <ExpenseForm
          accounts={active.map((a) => ({ id: a.id, label: accountLabel(a) }))} categories={categories} poster={can(ctx, "expenses.post")}
          vehicles={vehicles.filter((v) => v.status !== "retired" || v.id === vehicle).map((v) => ({ id: v.id, label: `${v.registration_no} · ${v.name}` }))} jobs={jobs.map((j) => ({ id: j.id, label: `${j.number} · ${local(j.nameEn, j.nameUr)}` }))}
          save={recordExpenseAction}
          cancelPath={job ? `/sol/jobs/${job}` : vehicle ? `/vehicles/${vehicle}` : "/expenses"}
          defaults={{
            date: businessToday(), categoryId: "", amount: "", accountId: cash.length === 1 ? cash[0]?.id ?? "" : "", method: "cash", reference: "", payee: "", description: "", vehicleId: vehicles.some((v) => v.id === vehicle) ? vehicle ?? "" : "",
            jobId: jobs.some((j) => j.id === job) ? job ?? "" : "", litres: "", odometer: "", receiptPath: "", noReceiptReason: "", requestId: crypto.randomUUID(), contributors: [],
          }}
        />
      )}
    </>
  );
}
