import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Banknote, HandCoins, Wallet } from "lucide-react";
import { loadAdvances, loadPayrollEmployees, reportPayroll } from "@/features/payroll/queries";
import { documentOptions } from "@/features/sales/status";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { formatBucket } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { StatCard } from "@/components/shared/stat-card";
import { SpecTable } from "@/components/tables/spec-table";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).payroll.history };
}

export default async function PayrollEmployeePage({ params }: PageProps<"/payroll/employees/[id]">) {
  const { id, ctx, t, locale, local } = await pageContext(params);
  if (!can(ctx, "payroll.view")) return <Forbidden />;
  const p = t.payroll;
  const [employees, history, advances] = await Promise.all([loadPayrollEmployees(), reportPayroll("2000-01-01", "2100-01-01", id), loadAdvances({ q: "", status: "", page: 1, supplierId: null, employeeId: id })]);
  const e = employees.find((x) => x.employee_id === id);
  if (!e) notFound();
  const money = (n: number) => <Ltr>{formatPaisa(toPaisa(n), locale)}</Ltr>;
  return (
    <>
      <PageHeader
        title={local(e.full_name, e.full_name_ur)} breadcrumbs={[{ label: p.tabs.employees, href: "/payroll/employees" }]} description={<Ltr>{e.code}</Ltr>}
        actions={<>{can(ctx, "employees.view") && <LinkButton variant="outline" href={`/employees/${id}`}>{t.nav.employees}</LinkButton>}{(can(ctx, "payroll.manage") || can(ctx, "payroll.pay")) && e.is_active && <LinkButton href={`/payroll/advances/new?employee=${id}`}><HandCoins aria-hidden />{p.newAdvance}</LinkButton>}</>}
      />
      <div className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label={p.salary} value={money(e.base_salary)} icon={Banknote} />
          <StatCard label={p.payable} value={money(e.payable)} icon={Wallet} tone={e.payable > 0 ? "attention" : "default"} />
          <StatCard label={p.advances} value={money(e.advances)} icon={HandCoins} />
        </div>
        <section className="grid gap-3">
          <h2 className="text-base font-semibold text-navy">{p.history}</h2>
          <SpecTable
            caption={p.history}
            rows={history.map((r) => ({ id: r.payroll_item_id, month: formatBucket(r.period_month, "month", locale), monthHref: `/payroll/${r.payroll_run_id}`, basic: r.basic_salary, allowances: r.allowances, bonus: r.bonus, deductions: r.deductions, recovery: r.advance_recovery, net: r.net_pay, paid: r.paid, pending: r.pending, status: r.status }))}
            columns={[
              { key: "month", label: p.month, kind: "link", primary: true }, { key: "basic", label: p.basic, kind: "money", hideBelow: "lg" }, { key: "allowances", label: p.allowances, kind: "money", hideBelow: "2xl" }, { key: "bonus", label: p.bonus, kind: "money", hideBelow: "lg" },
              { key: "deductions", label: p.deductions, kind: "money", hideBelow: "lg" }, { key: "recovery", label: p.recovery, kind: "money", hideBelow: "2xl" }, { key: "net", label: p.net, kind: "money" }, { key: "paid", label: p.paid, kind: "money" }, { key: "pending", label: p.pending, kind: "money" },
              { key: "status", label: t.common.status, kind: "status", options: documentOptions(t) },
            ]}
            empty={{ title: p.historyEmpty }}
          />
        </section>
        <section className="grid gap-3">
          <h2 className="text-base font-semibold text-navy">{p.tabs.advances}</h2>
          <SpecTable
            caption={p.tabs.advances}
            rows={advances.rows.map((a) => ({ id: a.id, no: a.doc_no, date: a.advance_date, reason: a.reason, amount: a.amount, status: a.status }))}
            columns={[{ key: "no", label: t.documents.number, kind: "text", primary: true }, { key: "date", label: t.documents.date, kind: "date" }, { key: "reason", label: p.reason, kind: "text" }, { key: "amount", label: t.expenses.amount, kind: "money" }, { key: "status", label: t.common.status, kind: "status", options: documentOptions(t) }]}
            empty={{ title: p.advanceEmpty }}
          />
        </section>
      </div>
    </>
  );
}
