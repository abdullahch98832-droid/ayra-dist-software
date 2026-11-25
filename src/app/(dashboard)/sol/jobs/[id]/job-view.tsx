import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Ban, Banknote, CheckCheck, CircleCheck, Coins, MessageCircle, PackagePlus, Pencil, Phone, Play, RotateCcw, Trash2, Truck } from "lucide-react";
import { seesSettlements } from "@/features/sales/access";
import { documentOptions } from "@/features/sales/status";
import { businessToday } from "@/features/dashboard/period";
import { loadExpenses } from "@/features/expenses/queries";
import { applyPaymentAction, cancelJobAction, completeJobAction, confirmJobAction, deleteJobAction, releasePaymentAction, reopenJobAction, startJobAction } from "@/features/sol/actions";
import { isAdvance, itemName, loadItemCosts, loadJob, loadJobPayments, loadOrderPurchases, loadStaff, reportSolOrders, settledFor } from "@/features/sol/queries";
import { isOpenJob, JOB_TONE, purchaseOptions, solDeliveryOptions } from "@/features/sol/status";
import { DistributorSteps } from "@/components/sol/distributor-steps";
import { fill } from "@/i18n/format";
import { can } from "@/lib/auth/session";
import { pageContext } from "@/lib/page-context";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { phoneHref, whatsappHref } from "@/lib/utils/phone";
import { DocumentLink } from "@/components/documents/document-link";
import { ActionButton } from "@/components/documents/action-button";
import { FormAlert } from "@/components/forms/field";
import { Forbidden } from "@/components/layout/forbidden";
import { PageHeader } from "@/components/layout/page-header";
import { Ltr, Money } from "@/components/shared/bidi";
import { DescriptionList } from "@/components/shared/description-list";
import { formatDate } from "@/components/shared/format";
import { LinkButton } from "@/components/shared/link-button";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { SpecTable } from "@/components/tables/spec-table";

/** A job or a distributor order, each under its own address. */
export async function JobView({ params, area }: { params: Promise<{ id: string }>; area: "jobs" | "orders" }) {
  const { id, ctx, t, locale, local } = await pageContext(params);
  if (!can(ctx, "sol.view")) return <Forbidden />;
  const job = await loadJob(id);
  if (!job) notFound();
  const s = t.sol;
  const d = t.documents;
  const { status, figures } = job;
  const order = job.type?.is_order ?? false;
  const o = t.distributor;
  if (order !== (area === "orders")) redirect(`/sol/${order ? "orders" : "jobs"}/${id}`);
  const open = isOpenJob(status);
  const manage = can(ctx, "sol.manage");
  const poster = can(ctx, "receivables.post");
  const paid = seesSettlements(ctx);
  const costs = can(ctx, "costs.view");
  const expenses = can(ctx, "expenses.view");
  const [staff, itemCosts, payments, spent, progress, purchases] = await Promise.all([
    loadStaff(), loadItemCosts(ctx, id), paid && status !== "draft" ? loadJobPayments(job) : { rows: [], unused: [] },
    expenses && status !== "draft" ? loadExpenses({ q: "", status: "", page: 1, supplierId: null, jobId: id }) : { rows: [], total: 0 },
    order ? reportSolOrders({ jobId: id }).then((r) => r[0] ?? null) : null, order && status !== "draft" ? loadOrderPurchases(id) : [],
  ]);
  const responsible = staff.find((x) => x.id === job.responsible_employee_id);
  const outstanding = toPaisa(figures?.pending ?? 0);
  const useDeliveries = job.type?.uses_deliveries ?? true;
  const tel = phoneHref(job.contact_phone ?? job.customer?.phone ?? null);
  const chat = whatsappHref(job.customer?.whatsapp ?? null);
  const money = (v: number | null | undefined, strong = false) => (v === null || v === undefined ? null : <Money amount={toPaisa(v)} locale={locale} className={strong ? "font-semibold" : undefined} />);
  const late = open && job.due_date !== null && job.due_date < businessToday();
  const collect = (can(ctx, "receivables.collect") || poster) && (open || status === "completed") && outstanding > BigInt(0);
  return (
    <>
      <PageHeader
        title={job.doc_no}
        breadcrumbs={[order ? { label: o.tab, href: "/sol/orders" } : { label: s.tabs.jobs, href: "/sol/jobs" }]}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={JOB_TONE[status] ?? "gray"}>{s.statuses[status]}</StatusBadge>
            {late && <StatusBadge tone="red">{s.overdue}</StatusBadge>}
            <bdi>{job.customer && local(job.customer.name, job.customer.name_ur)}</bdi>
          </span>
        }
        actions={
          <>
            <DocumentLink kind="sol_invoice" params={{ id }} label={t.docs.pdf} />
            {status === "draft" && manage && <ActionButton label={d.deleteDraft} icon={<Trash2 aria-hidden />} variant="outline" action={deleteJobAction.bind(null, id)} success={order ? o.deleted : s.deleted} redirectTo={order ? "/sol/orders" : "/sol/jobs"} confirm={{ title: d.confirmDeleteTitle, description: d.confirmDelete, tone: "danger" }} />}
            {(status === "draft" || open) && manage && <LinkButton variant="outline" href={`/sol/${area}/${id}/edit`}><Pencil aria-hidden />{order ? o.edit : s.editJob}</LinkButton>}
            {open && manage && <ActionButton label={order ? o.cancel : s.cancelJob} icon={<Ban aria-hidden />} variant="outline" action={cancelJobAction.bind(null, id)} reasonLabel={d.reason} success={order ? o.cancelled : s.cancelled} confirm={{ title: order ? o.cancelTitle : s.cancelTitle, description: order ? o.cancelHint : s.cancelHint, tone: "danger" }} />}
            {status === "completed" && can(ctx, "sol.post") && <ActionButton label={order ? o.reopen : s.reopen} icon={<RotateCcw aria-hidden />} variant="outline" action={reopenJobAction.bind(null, id)} reasonLabel={d.reason} success={order ? o.reopened : s.reopened} confirm={{ title: order ? o.reopenTitle : s.reopenTitle, description: s.reopenHint, tone: "danger" }} />}
            {status === "draft" && manage && <ActionButton label={order ? o.confirm : s.confirm} icon={<CheckCheck aria-hidden />} action={confirmJobAction.bind(null, id)} success={order ? o.confirmed : s.confirmed} confirm={{ title: order ? o.confirmTitle : s.confirmTitle, description: order ? o.confirmHint : s.confirmHint }} />}
            {order && open && manage && can(ctx, "purchasing.create") && <LinkButton variant="outline" href={`/sol/orders/${id}/buy`}><PackagePlus aria-hidden />{o.orderFromAyra}</LinkButton>}
            {!order && status === "confirmed" && manage && <ActionButton label={s.start} icon={<Play aria-hidden />} variant="outline" action={startJobAction.bind(null, id)} success={s.started} />}
            {open && useDeliveries && (can(ctx, "sol.dispatch") || manage) && <LinkButton variant="outline" href={`/sol/jobs/${id}/deliver`}><Truck aria-hidden />{order ? o.supply : s.planDelivery}</LinkButton>}
            {(open || status === "completed") && can(ctx, "expenses.create") && <LinkButton variant="outline" href={`/expenses/new?job=${id}`}><Coins aria-hidden />{s.addCost}</LinkButton>}
            {collect && <LinkButton href={`/sol/payments/new?job=${id}`}><Banknote aria-hidden />{s.newPayment}</LinkButton>}
            {open && can(ctx, "sol.post") && <ActionButton label={order ? o.complete : s.complete} icon={<CircleCheck aria-hidden />} action={completeJobAction.bind(null, id)} success={order ? o.completed : s.completed} confirm={{ title: order ? o.completeTitle : s.completeTitle, description: order ? o.completeHint : s.completeHint }} />}
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {job.cancel_reason && <FormAlert tone="info">{fill(s.cancelledNote, { reason: job.cancel_reason })}</FormAlert>}
        {job.reopen_reason && <FormAlert tone="info">{fill(s.reopenedNote, { reason: job.reopen_reason })}</FormAlert>}
        {progress && <DistributorSteps step={progress.step} t={t} />}
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <SectionCard
            title={order ? o.order : s.job}
            action={(tel || chat) && (
              <span className="flex flex-wrap gap-3 print:hidden">
                {tel && <a href={tel} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><Phone className="size-4" aria-hidden />{t.customers.call}</a>}
                {chat && <a href={chat} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><MessageCircle className="size-4" aria-hidden />{t.customers.message}</a>}
              </span>
            )}
          >
            <DescriptionList items={[
              { label: order ? o.distributor : s.client, value: job.customer && (can(ctx, "customers.view") ? <Link href={`/customers/${job.customer.id}`} className="text-primary hover:underline">{local(job.customer.name, job.customer.name_ur)}</Link> : local(job.customer.name, job.customer.name_ur)) },
              ...(order ? [{ label: t.customers.city, value: job.customer?.city }] : [{ label: s.type, value: job.type && local(job.type.name_en, job.type.name_ur) }]),
              { label: order ? o.caller : s.contact, value: job.contact_name },
              { label: order ? o.callerPhone : s.contactPhone, value: job.contact_phone && <Ltr>{job.contact_phone}</Ltr> },
              { label: order ? o.destination : s.address, value: job.address },
              { label: s.responsible, value: responsible ? local(responsible.nameEn, responsible.nameUr) : s.nobody },
              { label: order ? o.callDate : s.jobDate, value: formatDate(job.job_date, locale) },
              { label: s.startDate, value: formatDate(job.start_date, locale) },
              { label: order ? o.wantedBy : s.dueDate, value: formatDate(job.due_date, locale) },
              { label: s.completionDate, value: formatDate(job.completion_date, locale) },
              { label: order ? o.callNote : s.description, value: job.description && <span className="whitespace-pre-line">{job.description}</span> },
              { label: d.notes, value: job.notes },
            ]} />
          </SectionCard>
          <SectionCard title={order ? o.money : s.money}>
            <dl className="grid gap-2.5 text-sm">
              {(order ? [
                [o.sale, money(job.contract_value, true)], [o.goodsCost, status === "draft" ? null : money(figures?.product_costs)], [o.transport, status === "draft" ? null : money(figures?.vehicle_expenses)], [o.expenses, status === "draft" ? null : money(figures?.other_costs)],
                [o.profit, costs && status !== "draft" ? money(figures?.profit, true) ?? <span className="text-muted-foreground">{o.profitPending}</span> : null],
                [o.paid, paid ? money(figures?.received) : null], [o.pending, paid && status !== "draft" && status !== "cancelled" ? money(figures?.pending, true) : null], [d.journal, job.journal && <Ltr key="j">{job.journal.doc_no}</Ltr>],
              ] as [string, React.ReactNode][] : [
                [s.contract, money(job.contract_value, true)], [s.received, paid ? money(figures?.received) : null], [s.outstanding, paid && status !== "draft" && status !== "cancelled" ? money(figures?.pending, true) : null],
                [s.expectedCost, money(figures?.estimated_cost)], [s.productCosts, status === "draft" ? null : money(figures?.product_costs)], [s.otherCosts, status === "draft" ? null : money(figures?.other_costs)],
                [s.directCosts, status === "draft" ? null : money(figures?.direct_costs, true)], [s.vehicleExpenses, status === "draft" ? null : money(figures?.vehicle_expenses)],
                [s.profit, costs && status !== "draft" ? money(figures?.profit, true) ?? <span className="text-muted-foreground">{s.profitPending}</span> : null],
                [d.journal, job.journal && <Ltr key="j">{job.journal.doc_no}</Ltr>],
              ] as [string, React.ReactNode][]).filter(([, v]) => v).map(([label, value]) => (
                <div key={label} className="flex flex-wrap justify-between gap-x-4"><dt className="text-muted-foreground">{label}</dt><dd className="text-end">{value}</dd></div>
              ))}
            </dl>
          </SectionCard>
        </div>
        <section className="grid gap-3">
          <h2 className="text-base font-semibold text-navy">{order ? o.products : s.items}</h2>
          <SpecTable
            caption={order ? o.products : s.items}
            rows={job.items.map((l) => ({
              id: l.id, name: itemName(local, l), detail: l.product?.sku ?? (l.kind === "other" ? null : l.description), kind: s.kinds[l.kind as "service"], quantity: l.quantity,
              unit: l.unit ? local(l.unit.name_en, l.unit.name_ur) : l.service?.unit_label ? local(l.service.unit_label, l.service.unit_label_ur) : null,
              price: l.unit_price, cost: itemCosts.get(l.id), total: l.line_total, delivered: l.delivered_quantity, remaining: status === "cancelled" ? 0 : l.quantity - l.delivered_quantity,
            }))}
            columns={[
              { key: "name", sub: "detail", label: s.itemDescription, kind: "text", primary: true },
              ...(order ? [] : [{ key: "kind", label: s.kind, kind: "text" as const, hideBelow: "lg" as const }]),
              { key: "quantity", sub: "unit", label: s.quantity, kind: "decimal" },
              ...(status !== "draft" && useDeliveries ? [{ key: "delivered", label: s.delivered, kind: "decimal" as const }, { key: "remaining", label: s.remaining, kind: "decimal" as const, hideBelow: "lg" as const }] : []),
              ...(costs ? [{ key: "cost", label: order ? o.ayraPrice : s.unitCost, kind: "money" as const, hideBelow: "xl" as const }] : []),
              { key: "price", label: order ? o.salePrice : s.unitPrice, kind: "money", hideBelow: "lg" },
              { key: "total", label: s.lineTotal, kind: "money", total: true },
            ]}
            empty={{ title: s.noItems }}
          />
        </section>
        {order && status !== "draft" && can(ctx, "purchasing.view") && (
          <section className="grid gap-3">
            <h2 className="text-base font-semibold text-navy">{o.fromAyra}</h2>
            <SpecTable
              caption={o.fromAyra}
              rows={purchases.map((x) => ({ id: x.id, no: x.doc_no, noHref: `/purchasing/company/orders/${x.id}`, date: x.order_date, expected: x.expected_date, amount: x.total_amount, status: x.status }))}
              columns={[
                { key: "no", label: d.number, kind: "link", primary: true }, { key: "date", label: d.date, kind: "date" }, { key: "expected", label: o.expected, kind: "date", hideBelow: "lg" }, { key: "amount", label: d.total, kind: "money", total: true },
                { key: "status", label: t.common.status, kind: "status", options: purchaseOptions(t) },
              ]}
              empty={{ title: o.notOrdered, description: o.notOrderedHint }}
            />
          </section>
        )}
        {job.deliveries.length > 0 && (
          <section className="grid gap-3">
            <h2 className="text-base font-semibold text-navy">{s.deliveries}</h2>
            <SpecTable
              caption={s.deliveries}
              rows={job.deliveries.map((x) => ({ id: x.id, no: x.doc_no, noHref: `/sol/deliveries/${x.id}`, date: x.delivery_date, destination: x.destination, vehicle: x.vehicle?.registration_no, status: x.status, delivered: x.delivered_at }))}
              columns={[
                { key: "no", label: d.number, kind: "link", primary: true }, { key: "date", label: d.date, kind: "date" }, { key: "destination", label: s.destination, kind: "text" }, { key: "vehicle", label: s.vehicle, kind: "code" },
                { key: "status", label: t.common.status, kind: "status", options: solDeliveryOptions(t) }, { key: "delivered", label: s.deliveredAt, kind: "datetime", hideBelow: "xl" },
              ]}
              empty={{ title: s.deliveryEmpty }}
            />
          </section>
        )}
        {paid && payments.rows.length > 0 && (
          <section className="grid gap-3">
            <h2 className="text-base font-semibold text-navy">{s.payments}</h2>
            <SpecTable
              caption={s.payments}
              rows={payments.rows.map((p) => ({
                id: p.id, no: p.doc_no, noHref: `/receivables/payments/${p.id}`, reference: p.reference, date: p.payment_date, method: t.purchasing.methods[p.method], account: p.account?.name, identifier: p.payer_account,
                amount: p.amount, settled: p.status === "posted" ? toDbAmount(settledFor(p, id)) : null, status: p.status,
                kind: isAdvance(p, job) ? s.advance : s.partial,
              }))}
              columns={[
                { key: "no", sub: "reference", label: d.number, kind: "link", primary: true }, { key: "date", sub: "kind", label: d.date, kind: "date" }, { key: "method", sub: "identifier", label: s.method, kind: "text" },
                { key: "account", label: s.account, kind: "text", hideBelow: "lg" }, { key: "amount", label: s.amount, kind: "money" }, { key: "settled", label: s.received, kind: "money", total: true },
                { key: "status", label: t.common.status, kind: "status", options: documentOptions(t) },
              ]}
              empty={{ title: s.paymentEmpty }}
            />
            {poster && payments.rows.some((p) => p.status === "posted" && settledFor(p, id) > BigInt(0)) && (
              <div className="flex flex-wrap gap-2 print:hidden">
                {payments.rows.filter((p) => p.status === "posted" && settledFor(p, id) > BigInt(0)).map((p) => (
                  <ActionButton key={p.id} label={`${order ? o.release : s.release}: ${p.doc_no}`} variant="outline" action={releasePaymentAction.bind(null, p.id, id)} success={s.released} confirm={{ title: s.releaseTitle, description: s.releaseHint }} />
                ))}
              </div>
            )}
          </section>
        )}
        {poster && outstanding > BigInt(0) && payments.unused.length > 0 && (
          <SectionCard title={s.onAccount} className="print:hidden">
            <ul className="divide-y">
              {payments.unused.map((p) => {
                const use = p.left < outstanding ? p.left : outstanding;
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 -mx-3 px-3 py-2.5 transition-colors hover:bg-accent/50">
                    <p className="text-sm"><Ltr className="font-medium">{p.number}</Ltr> <span className="text-muted-foreground">· <bdi>{formatDate(p.date, locale)}</bdi> · <Money amount={p.left} locale={locale} /></span></p>
                    <ActionButton label={s.applyToJob} variant="outline" action={applyPaymentAction.bind(null, p.id, id, toDbAmount(use))} success={s.applied} />
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        )}
        {expenses && spent.rows.length > 0 && (
          <section className="grid gap-3 print:hidden">
            <h2 className="text-base font-semibold text-navy">{s.costs}</h2>
            <SpecTable
              caption={s.costs}
              rows={spent.rows.map((x) => ({ id: x.id, no: x.doc_no, noHref: `/expenses/${x.id}`, date: x.expense_date, category: x.category && local(x.category.name_en, x.category.name_ur), payee: x.payee, vehicle: x.vehicle?.registration_no, amount: x.amount, status: x.status }))}
              columns={[
                { key: "no", label: d.number, kind: "link", primary: true }, { key: "date", label: d.date, kind: "date" }, { key: "category", sub: "payee", label: t.expenses.category, kind: "text" }, { key: "vehicle", label: s.vehicle, kind: "code", hideBelow: "lg" },
                { key: "amount", label: s.amount, kind: "money" }, { key: "status", label: t.common.status, kind: "status", options: documentOptions(t) },
              ]}
              empty={{ title: s.noCosts }}
            />
          </section>
        )}
      </div>
    </>
  );
}
