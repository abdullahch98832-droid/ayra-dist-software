import type { Metadata } from "next";
import { businessToday } from "@/features/dashboard/period";
import { loadPayrollEmployees, loadRuns } from "@/features/payroll/queries";
import { documentOptions } from "@/features/sales/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { LIST_PAGE, listParams } from "@/lib/list-params";
import { pageContext } from "@/lib/page-context";
import { formatPaisa, sumPaisa, toDbAmount, toPaisa } from "@/lib/utils/money";
import { Banknote, HandCoins, Users } from "lucide-react";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { formatBucket, formatNumber } from "@/components/shared/format";
import { StatCard } from "@/components/shared/stat-card";
import { SpecTable } from "@/components/tables/spec-table";
import { PreparePayroll } from "./prepare-payroll";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).payroll.title };
}

export default async function PayrollPage({ searchParams }: PageProps<"/payroll">) {
  const { ctx, t, locale } = await pageContext();
  if (!can(ctx, "payroll.view")) return <Forbidden />;
  const p = t.payroll;
  const filter = listParams(await searchParams, ["draft", "posted", "void"]);
  const [{ rows, total }, employees] = await Promise.all([loadRuns(filter), loadPayrollEmployees()]);
  const money = (list: number[]) => <Ltr>{formatPaisa(sumPaisa(list.map(toPaisa)), locale)}</Ltr>;
  const salaried = employees.filter((e) => e.is_active && e.base_salary > 0);
  return (
    <>
      <PageHeader title={p.title} description={p.subtitle} />
      <div className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={p.employees} value={formatNumber(salaried.length, locale)} icon={Users} href="/payroll/employees" />
          <StatCard label={p.salary} value={money(salaried.map((e) => e.base_salary))} icon={Banknote} />
          <StatCard label={p.payable} value={money(employees.map((e) => e.payable))} icon={Banknote} tone={employees.some((e) => e.payable > 0) ? "attention" : "default"} />
          <StatCard label={p.advances} value={money(employees.map((e) => e.advances))} icon={HandCoins} href="/payroll/advances" />
        </div>
        {can(ctx, "payroll.manage") && <PreparePayroll month={businessToday().slice(0, 7)} ready={salaried.length > 0} />}
        <SpecTable
          caption={p.tabs.runs}
          rows={rows.map((r) => {
            const net = sumPaisa(r.payroll_items.map((i) => toPaisa(i.net_pay ?? 0)));
            const paid = sumPaisa(r.payroll_items.flatMap((i) => i.salary_payments.filter((x) => x.status === "posted").map((x) => toPaisa(x.amount))));
            return { id: r.id, month: formatBucket(r.period_month, "month", locale), monthHref: `/payroll/${r.id}`, no: r.doc_no, employees: r.payroll_items.length, net: toDbAmount(net), paid: toDbAmount(paid), pending: r.status === "posted" ? toDbAmount(net - paid) : null, status: r.status };
          })}
          columns={[
            { key: "month", sub: "no", label: p.month, kind: "link", primary: true }, { key: "employees", label: p.employees, kind: "quantity" }, { key: "net", label: p.totalNet, kind: "money" }, { key: "paid", label: p.paid, kind: "money", hideBelow: "lg" },
            { key: "pending", label: p.pending, kind: "money" }, { key: "status", label: t.common.status, kind: "status", options: documentOptions(t) },
          ]}
          server={{ page: filter.page, pageSize: LIST_PAGE, total }}
          empty={{ title: p.runEmpty, description: p.runEmptyHint }}
        />
      </div>
    </>
  );
}
