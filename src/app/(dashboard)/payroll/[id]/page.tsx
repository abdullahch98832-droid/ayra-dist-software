import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Ban, CheckCheck, Pencil, Printer, Trash2 } from "lucide-react";
import { accountLabel, loadPaymentAccounts } from "@/features/cash-bank/queries";
import { businessToday } from "@/features/dashboard/period";
import { deletePayrollDraftAction, postPayrollAction, voidPayrollAction, voidSalaryPaymentAction } from "@/features/payroll/actions";
import { loadPayrollEmployees, loadRun } from "@/features/payroll/queries";
import { DOCUMENT_TONE, documentOptions } from "@/features/sales/status";
import { fill } from "@/i18n/format";
import { getT } from "@/i18n/server";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { sumPaisa, toDbAmount, toPaisa } from "@/lib/utils/money";
import { ActionButton } from "@/components/documents/action-button";
import { PrintButton } from "@/components/documents/print-button";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr } from "@/components/shared/bidi";
import { formatBucket } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { SpecTable } from "@/components/tables/spec-table";
import { PayForm } from "./pay-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).payroll.run };
}

export default async function PayrollRunPage({ params }: PageProps<"/payroll/[id]">) {
  const { id, ctx, t, locale, local } = await pageContext(params);
  if (!can(ctx, "payroll.view")) return <Forbidden />;
  const run = await loadRun(id);
  if (!run) notFound();
  const payer = run.status === "posted" && can(ctx, "payroll.pay");
  const [employees, accounts] = await Promise.all([loadPayrollEmployees(), payer ? loadPaymentAccounts() : []]);
  const names = new Map(employees.map((e) => [e.employee_id, e]));
  const p = t.payroll;
  const d = t.documents;
  const draft = run.status === "draft";
  const name = (eid: string) => { const e = names.get(eid); return e ? local(e.full_name, e.full_name_ur) : "—"; };
  const lines = run.payroll_items.map((i) => {
    const paid = sumPaisa(i.salary_payments.filter((x) => x.status === "posted").map((x) => toPaisa(x.amount)));
    return { ...i, name: name(i.employee_id), code: names.get(i.employee_id)?.code ?? "", paid, pending: toPaisa(i.net_pay ?? 0) - paid };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const open = lines.filter((l) => l.pending > BigInt(0));
  const payments = lines.flatMap((l) => l.salary_payments.map((x) => ({ ...x, name: l.name }))).sort((a, b) => (a.doc_no < b.doc_no ? 1 : -1));
  const month = formatBucket(run.period_month, "month", locale);
  return (
    <>
      <PageHeader
        title={`${p.run} ${month}`}
        breadcrumbs={[{ label: p.title, href: "/payroll" }]}
        description={<span className="flex flex-wrap items-center gap-3"><StatusBadge tone={DOCUMENT_TONE[run.status] ?? "gray"}>{t.purchasing.statuses[run.status]}</StatusBadge><Ltr>{run.doc_no}</Ltr>{run.journal && <Ltr>{run.journal.doc_no}</Ltr>}</span>}
        actions={
          <>
            {!draft && <PrintButton label={t.sales.print} icon={<Printer aria-hidden />} />}
            {draft && can(ctx, "payroll.manage") && (
              <>
                <ActionButton label={d.deleteDraft} icon={<Trash2 aria-hidden />} variant="outline" action={deletePayrollDraftAction.bind(null, "payroll_runs", id)} success={d.deleted} redirectTo="/payroll" confirm={{ title: d.confirmDeleteTitle, description: d.confirmDelete, tone: "danger" }} />
                <LinkButton variant="outline" href={`/payroll/${id}/edit`}><Pencil aria-hidden />{p.edit}</LinkButton>
              </>
            )}
            {run.status === "posted" && can(ctx, "payroll.post") && <ActionButton label={p.void} icon={<Ban aria-hidden />} variant="outline" action={voidPayrollAction.bind(null, id)} reasonLabel={d.reason} success={p.voided} confirm={{ title: p.voidTitle, description: p.voidHint, tone: "danger" }} />}
            {draft && can(ctx, "payroll.post") && lines.length > 0 && <ActionButton label={p.post} icon={<CheckCheck aria-hidden />} action={postPayrollAction.bind(null, id)} success={p.posted} confirm={{ title: p.postTitle, description: p.postHint }} />}
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {run.void_reason && <FormAlert tone="info">{fill(p.voidNote, { reason: run.void_reason })}</FormAlert>}
        {run.notes && <p className="text-sm text-muted-foreground">{run.notes}</p>}
        <SpecTable
          caption={p.employees}
          exportName={`payroll-${run.period_month.slice(0, 7)}`}
          rows={lines.map((l) => ({
            id: l.id, name: l.name, nameHref: `/payroll/employees/${l.employee_id}`, code: l.code, basic: l.basic_salary, allowances: l.allowances, bonus: l.bonus, deductions: l.deductions, recovery: l.advance_recovery, net: l.net_pay,
            paid: toDbAmount(l.paid), pending: toDbAmount(l.pending),
          }))}
          columns={[
            { key: "name", sub: "code", label: p.employee, kind: "link", primary: true }, { key: "basic", label: p.basic, kind: "money", total: true }, { key: "allowances", label: p.allowances, kind: "money", hideBelow: "2xl", total: true },
            { key: "bonus", label: p.bonus, kind: "money", hideBelow: "lg", total: true }, { key: "deductions", label: p.deductions, kind: "money", hideBelow: "lg", total: true }, { key: "recovery", label: p.recovery, kind: "money", hideBelow: "xl", total: true },
            { key: "net", label: p.net, kind: "money", total: true }, ...(run.status === "posted" ? [{ key: "paid", label: p.paid, kind: "money" as const, hideBelow: "xl" as const, total: true }, { key: "pending", label: p.pending, kind: "money" as const, total: true }] : []),
          ]}
          empty={{ title: p.none }}
        />
        {payer && open.length > 0 && (
          <div className="print:hidden">
            <PayForm key={open.map((l) => `${l.id}${l.pending}`).join()} runId={id} today={businessToday()} lines={open.map((l) => ({ itemId: l.id, name: l.name, pending: toDbAmount(l.pending) }))} accounts={accounts.filter((a) => a.isActive).map((a) => ({ id: a.id, label: accountLabel(a) }))} />
          </div>
        )}
        {payments.length > 0 && (
          <section className="grid gap-3 print:hidden">
            <h2 className="text-base font-semibold text-navy">{p.payments}</h2>
            <SpecTable
              caption={p.payments}
              rows={payments.map((x) => ({ id: x.id, no: x.doc_no, reference: x.reference, name: x.name, date: x.payment_date, method: t.purchasing.methods[x.method], account: x.account?.name, amount: x.amount, status: x.status }))}
              columns={[
                { key: "no", sub: "reference", label: d.number, kind: "text", primary: true }, { key: "name", label: p.employee, kind: "text" }, { key: "date", label: d.date, kind: "date" }, { key: "method", sub: "account", label: t.sol.method, kind: "text", hideBelow: "lg" },
                { key: "amount", label: p.paid, kind: "money" }, { key: "status", label: t.common.status, kind: "status", options: documentOptions(t) },
              ]}
              empty={{ title: p.payments }}
            />
            {payer && payments.some((x) => x.status === "posted") && (
              <div className="flex flex-wrap gap-2">
                {payments.filter((x) => x.status === "posted").map((x) => (
                  <ActionButton key={x.id} label={`${p.voidPayment}: ${x.doc_no}`} variant="outline" action={voidSalaryPaymentAction.bind(null, x.id)} reasonLabel={d.reason} success={p.paymentVoided} confirm={{ title: p.voidPaymentTitle, description: p.voidPaymentHint, tone: "danger" }} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}
