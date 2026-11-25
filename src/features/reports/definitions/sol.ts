import "server-only";
import { Banknote, BadgePercent, ClipboardList, FileSignature, Hourglass, Phone, Truck, Waypoints } from "lucide-react";
import { seesSettlements } from "@/features/sales/access";
import { loadJobTypes, loadSolSummary, reportSolJobs, reportSolOrders } from "@/features/sol/queries";
import { JOB_STATUSES, jobOptions, ORDER_STEPS, stepOptions } from "@/features/sol/status";
import { toDbAmount, toPaisa } from "@/lib/utils/money";
import { ledgerChecks } from "../checks";
import type { ReportDefinition, ReportFigure, ReportRow } from "../model";
import { reportSolCosts, reportSolPayments } from "../queries";
import { statusOptions } from "../values";
import { bi, biKey, can, col, daysFrom, hint, lg, name, optional, reversal, sumOf, title, total, when, xl, xxl, ZERO, type ReportFilter, type ReportInput } from "./shared";

type Job = Awaited<ReturnType<typeof reportSolJobs>>[number];
/** Drafts and cancelled jobs have no contract in force. */
const contractOf = (j: Job) => (j.status === "draft" || j.status === "cancelled" ? 0 : j.contract_value);
const inForce = (j: Job) => j.status !== "draft" && j.status !== "cancelled";
const money = (key: string, label: ReportFigure["label"], amount: bigint, icon: ReportFigure["icon"], extra: Partial<ReportFigure> = {}): ReportFigure => ({ key, label, value: { money: amount }, icon, ...extra });
const jobCell = (j: Job): ReportRow => ({ id: j.job_id, no: j.doc_no, noHref: `/sol/jobs/${j.job_id}`, date: j.job_date, client: name(j.customer, j.customer_ur), type: optional(j.type_en, j.type_ur), responsible: optional(j.responsible_en, j.responsible_ur), status: j.status });
const jobColumns = [col("no", (t) => t.sol.jobNo, "link", { primary: true }), col("date", (t) => t.sol.jobDate, "date"), col("client", (t) => t.sol.client, "text", { sub: "type", subLabel: bi((t) => t.sol.type) })];
const statusColumn = col("status", (t) => t.common.status, "status", { options: statusOptions(jobOptions) });
const seesAllJobs = (input: ReportInput) => can(input.ctx, "sol.view_all");

/** Income of all completed jobs beside the SOL income account. */
async function revenueCheck(input: ReportInput) {
  if (!seesAllJobs(input) || !can(input.ctx, "reports.financial") || !input.whole) return [];
  const completed = (await reportSolJobs({})).filter((j) => j.status === "completed");
  return ledgerChecks(input, [{ label: bi((t) => t.analytics.checks.solRevenue), report: sumOf(completed.map((j) => j.contract_value)), keys: ["SOL_REVENUE"], sources: ["sol_job"], from: null, to: input.today }]);
}

const filters = async (): Promise<ReportFilter[]> => {
  const types = await loadJobTypes();
  return [
    { param: "status", label: bi((t) => t.common.status), all: bi((t) => t.documents.allStatuses), options: [{ value: "pending", label: bi((t) => t.sol.pendingStatus) }, ...JOB_STATUSES.map((s) => ({ value: s as string, label: biKey((t) => t.sol.statuses, s) }))] },
    ...when(types.length > 1, { param: "type", label: bi((t) => t.sol.type), all: bi((t) => t.sol.allTypes), options: types.map((x) => ({ value: x.id, label: name(x.nameEn, x.nameUr) })) }),
  ];
};
const jobsOf = (input: ReportInput) => reportSolJobs({ from: input.period.from, to: input.period.to, status: input.filter("status") ?? "", typeId: input.filter("type") });

export const solReports: ReportDefinition[] = [
  {
    slug: "sol-orders", group: "sol", title: bi((t) => t.distributor.title), hint: bi((t) => t.distributor.reportHint), icon: Phone, permissions: ["sol.view"], dates: "period",
    filters: () => [{ param: "step", label: bi((t) => t.distributor.step), all: bi((t) => t.distributor.allSteps), options: ["draft", ...ORDER_STEPS, "cancelled"].map((x) => ({ value: x as string, label: biKey((t) => t.distributor.steps, x) })) }],
    async load(input) {
      const { ctx, period } = input;
      const step = input.filter("step");
      const rows = (await reportSolOrders({ from: period.from, to: period.to })).filter((x) => !step || x.step === step);
      const paid = seesSettlements(ctx);
      const costs = can(ctx, "costs.view");
      const done = rows.filter((x) => x.status === "completed");
      return {
        figures: [
          { key: "orders", label: bi((t) => t.distributor.title), value: { count: rows.length }, icon: Phone }, money("sale", bi((t) => t.distributor.sale), sumOf(rows.filter((x) => x.status !== "draft").map((x) => x.sale)), FileSignature),
          ...when(paid, money("paid", bi((t) => t.distributor.paid), sumOf(rows.map((x) => x.paid)), Banknote)), ...when(costs, money("profit", bi((t) => t.distributor.profit), sumOf(done.map((x) => x.profit)), BadgePercent)),
        ],
        tables: [{
          key: "orders", title: bi((t) => t.distributor.title), search: ["no", "distributor", "city", "caller", "phone"], empty: bi((t) => t.distributor.empty),
          rows: rows.map((x): ReportRow => ({
            id: x.job_id, no: x.doc_no, noHref: `/sol/orders/${x.job_id}`, date: x.job_date, distributor: name(x.customer, x.customer_ur), city: x.city, caller: x.contact_name, phone: x.contact_phone, step: x.step, needed: x.needed, received: x.received, supplied: x.supplied,
            sale: x.sale, paid: x.paid, pending: x.pending, goods: x.goods_cost, transport: x.vehicle_expenses, other: x.other_costs, profit: x.profit,
          })),
          columns: [
            col("no", (t) => t.distributor.number, "link", { primary: true }), col("date", (t) => t.distributor.callDate, "date"), col("distributor", (t) => t.distributor.distributor, "text", { sub: "city", subLabel: bi((t) => t.customers.city) }),
            col("caller", (t) => t.distributor.caller, "text", { sub: "phone", subLabel: bi((t) => t.distributor.callerPhone), hideBelow: "2xl", screenOnly: true }), col("step", (t) => t.distributor.step, "status", { options: statusOptions(stepOptions) }),
            col("needed", (t) => t.distributor.needed, "quantity", { ...xxl, total: true, screenOnly: true }), col("received", (t) => t.distributor.receivedQty, "quantity", { ...xxl, total: true, screenOnly: true }), col("supplied", (t) => t.distributor.suppliedQty, "quantity", { ...xxl, total: true }),
            col("sale", (t) => t.distributor.sale, "money", total), ...when(paid, col("paid", (t) => t.distributor.paid, "money", { ...xxl, total: true }), col("pending", (t) => t.distributor.pending, "money", { ...xxl, total: true })),
            ...when(costs, col("goods", (t) => t.distributor.goodsCost, "money", { ...lg, total: true }), col("transport", (t) => t.distributor.transport, "money", { ...xxl, total: true }), col("other", (t) => t.distributor.expenses, "money", { ...xxl, total: true }), col("profit", (t) => t.distributor.profit, "money", total)),
          ],
        }],
        checks: await revenueCheck(input), notes: [bi((t) => t.distributor.reportNote)],
      };
    },
  },
  {
    slug: "sol-jobs", group: "sol", title: bi((t) => t.reports.solJobs), hint: bi((t) => t.reports.solJobsHint), icon: Waypoints, permissions: ["sol.view"], dates: "period", filters,
    async load(input) {
      const { ctx, period } = input;
      const [rows, x] = await Promise.all([jobsOf(input), loadSolSummary(period.from, period.to)]);
      const paid = seesSettlements(ctx);
      const costs = can(ctx, "costs.view");
      const figure = (key: string, label: ReportFigure["label"], value: string | undefined): ReportFigure[] => (value === undefined ? [] : [{ key, label, value: { money: toPaisa(value) } }]);
      return {
        figures: [
          { key: "jobs", label: bi((t) => t.sol.totalJobs), value: { count: x.total_jobs } }, { key: "completed", label: bi((t) => t.sol.completedJobs), value: { count: x.completed_jobs } }, { key: "pending", label: bi((t) => t.sol.pendingJobs), value: { count: x.pending_jobs } },
          ...figure("contract", bi((t) => t.sol.totalContract), x.contract_value), ...figure("received", bi((t) => t.sol.receivedPayments), x.received), ...figure("due", bi((t) => t.sol.pendingPayments), x.pending_payments),
          ...figure("direct", bi((t) => t.sol.directCosts), x.direct_costs), ...figure("profit", bi((t) => t.sol.profit), x.profit),
        ],
        tables: [{
          key: "jobs", title: bi((t) => t.reports.solJobs), search: ["no", "client", "type", "responsible"],
          rows: rows.map((j): ReportRow => ({ ...jobCell(j), contract: contractOf(j), received: j.received, pending: j.pending, direct: j.direct_costs, vehicle: j.vehicle_expenses, profit: j.profit })),
          columns: [
            ...jobColumns, col("responsible", (t) => t.sol.responsible, "text", { ...xxl, screenOnly: true }), statusColumn, col("contract", (t) => t.sol.contract, "money", total),
            ...when(paid, col("received", (t) => t.sol.received, "money", { ...xxl, total: true }), col("pending", (t) => t.sol.outstanding, "money", { ...lg, total: true })),
            ...when(costs, col("direct", (t) => t.sol.directCosts, "money", { ...xl, total: true }), col("vehicle", (t) => t.sol.vehicleExpenses, "money", { ...xxl, total: true }), col("profit", (t) => t.sol.profit, "money", total)),
          ],
        }],
        checks: await revenueCheck(input),
      };
    },
  },
  {
    slug: "sol-contracts", group: "sol", title: title("solContracts"), hint: hint("solContracts"), icon: FileSignature, permissions: ["sol.view"], dates: "period", filters,
    async load(input) {
      const jobs = (await jobsOf(input)).filter(inForce);
      const paid = seesSettlements(input.ctx);
      const clients = [...Map.groupBy(jobs, (j) => j.customer_id).values()].map((list) => ({ id: list[0]?.customer_id ?? "", en: list[0]?.customer ?? "", ur: list[0]?.customer_ur ?? null, jobs: list, contract: sumOf(list.map((j) => j.contract_value)) })).toSorted((a, b) => (a.contract < b.contract ? 1 : -1));
      const sum = (list: Job[], key: "received" | "pending") => toDbAmount(sumOf(list.map((j) => j[key])));
      return {
        figures: [money("contract", bi((t) => t.sol.totalContract), sumOf(jobs.map((j) => j.contract_value)), FileSignature), { key: "jobs", label: bi((t) => t.sol.totalJobs), value: { count: jobs.length }, icon: Waypoints }],
        charts: clients.length > 1 ? [{
          key: "clients", type: "bars", title: bi((t) => t.analytics.charts.contractsByClient), hint: hint("solContracts"), category: bi((t) => t.sol.client), series: [{ key: "contract", label: bi((t) => t.sol.contract) }],
          points: clients.slice(0, 10).map((c) => ({ label: { en: c.en, ur: c.ur ?? c.en }, values: [c.contract] })),
        }] : [],
        tables: [{
          key: "clients", title: title("solContracts"), search: ["client"],
          rows: clients.map((c): ReportRow => ({
            id: c.id, client: name(c.en, c.ur), jobs: c.jobs.length, completed: c.jobs.filter((j) => j.status === "completed").length, contract: toDbAmount(c.contract), done: toDbAmount(sumOf(c.jobs.filter((j) => j.status === "completed").map((j) => j.contract_value))),
            received: paid ? sum(c.jobs, "received") : null, pending: paid ? sum(c.jobs, "pending") : null,
          })),
          columns: [
            col("client", (t) => t.sol.client, "text", { primary: true }), col("jobs", (t) => t.sol.totalJobs, "quantity", total), col("completed", (t) => t.sol.completedJobs, "quantity", { ...lg, total: true }), col("contract", (t) => t.sol.contract, "money", total),
            col("done", (t) => t.analytics.completedValue, "money", { ...lg, total: true }), ...when(paid, col("received", (t) => t.sol.received, "money", total), col("pending", (t) => t.sol.outstanding, "money", total)),
          ],
        }],
        checks: await revenueCheck(input), notes: [bi((t) => t.analytics.notes.solContracts)],
      };
    },
  },
  {
    slug: "sol-payments", group: "sol", title: title("solPayments"), hint: hint("solPayments"), icon: Banknote, permissions: ["sol.view"], dates: "period",
    allowed: (ctx) => can(ctx, "receivables.view") || (can(ctx, "sol.view_all") && seesSettlements(ctx)),
    async load({ period }) {
      const rows = await reportSolPayments(period);
      return {
        figures: [money("received", bi((t) => t.sol.receivedPayments), sumOf(rows.map((x) => x.amount)), Banknote), { key: "count", label: bi((t) => t.analytics.paymentCount), value: { count: rows.filter((x) => !x.is_reversal).length }, icon: ClipboardList }],
        tables: [{
          key: "payments", title: title("solPayments"), search: ["no", "client", "jobs", "reference"],
          rows: rows.map((x): ReportRow => ({ id: x.entry_id, no: x.doc_no, noHref: `/receivables/payments/${x.payment_id}`, reversal: reversal(x.is_reversal), date: x.entry_date, client: name(x.customer, x.customer_ur), jobs: x.jobs, method: biKey((t) => t.purchasing.methods, x.method), reference: x.reference, amount: x.amount })),
          columns: [
            col("no", (t) => t.documents.number, "link", { sub: "reversal", subLabel: bi((t) => t.accounting.reversal), primary: true }), col("date", (t) => t.documents.date, "date"), col("client", (t) => t.sol.client, "text"), col("jobs", (t) => t.sol.tabs.jobs, "code", lg),
            col("method", (t) => t.receivables.method, "text", { sub: "reference", subLabel: bi((t) => t.receivables.reference), hideBelow: "lg" }), col("amount", (t) => t.receivables.amount, "money", total),
          ],
        }],
        notes: [bi((t) => t.analytics.notes.solPayments), bi((t) => t.analytics.notes.reversals)],
      };
    },
  },
  {
    slug: "sol-pending", group: "sol", title: title("solPending"), hint: hint("solPending"), icon: Hourglass, permissions: ["sol.view"], allowed: seesSettlements, dates: "now",
    async load(input) {
      const rows = (await reportSolJobs({})).filter((j) => inForce(j) && (j.pending ?? 0) > 0);
      const due = rows.filter((j) => j.status === "completed");
      return {
        figures: [
          money("due", bi((t) => t.analytics.dueForCompleted), sumOf(due.map((j) => j.pending)), Hourglass, { attention: due.length > 0 }), money("later", bi((t) => t.analytics.dueLater), sumOf(rows.filter((j) => j.status !== "completed").map((j) => j.pending)), FileSignature),
          { key: "jobs", label: bi((t) => t.sol.totalJobs), value: { count: rows.length }, icon: Waypoints },
        ],
        tables: [{
          key: "pending", title: title("solPending"), search: ["no", "client", "type"], empty: bi((t) => t.analytics.nothingPending),
          rows: rows.map((j): ReportRow => { const age = j.completion_date ? daysFrom(j.completion_date, input.today) : null; return { ...jobCell(j), completed: j.completion_date, age, contract: j.contract_value, received: j.received, pending: j.pending }; }),
          columns: [...jobColumns, statusColumn, col("completed", (t) => t.sol.completionDate, "date", xxl), col("age", (t) => t.analytics.daysSince, "quantity", xxl), col("contract", (t) => t.sol.contract, "money", { ...lg, total: true }), col("received", (t) => t.sol.received, "money", { ...lg, total: true }), col("pending", (t) => t.sol.outstanding, "money", total)],
        }],
        notes: [bi((t) => t.analytics.notes.solPending)],
      };
    },
  },
  {
    slug: "sol-expenses", group: "sol", title: title("solExpenses"), hint: hint("solExpenses"), icon: Truck, permissions: ["costs.view"], allowed: (ctx) => can(ctx, "sol.view"), dates: "period",
    async load(input) {
      const rows = await reportSolCosts(input.period);
      const goods = rows.filter((x) => x.kind === "goods" || x.kind === "returned");
      const of = (kind: string) => sumOf(rows.filter((x) => x.kind === kind).map((x) => x.amount));
      const parts = [
        { label: bi((t) => t.sol.productCosts), amount: sumOf(goods.map((x) => x.amount)) }, { label: bi((t) => t.sol.vehicleExpenses), amount: of("vehicle") }, { label: bi((t) => t.sol.otherCosts), amount: of("expense") },
      ];
      return {
        figures: [money("total", bi((t) => t.analytics.totalCosts), sumOf(rows.map((x) => x.amount)), Truck), ...parts.map((p, i) => money(String(i), p.label, p.amount, undefined))],
        tables: [{
          key: "costs", title: title("solExpenses"), search: ["no", "job", "client", "category", "payee", "vehicle"],
          rows: rows.map((x): ReportRow => ({
            id: x.entry_id, no: x.doc_no, reversal: reversal(x.is_reversal), date: x.entry_date, job: x.job_no, jobHref: `/sol/jobs/${x.job_id}`, client: name(x.customer, x.customer_ur), kind: biKey((t) => t.analytics.costKinds, x.kind), category: optional(x.category_en, x.category_ur), payee: x.payee, vehicle: x.vehicle, amount: x.amount,
          })),
          columns: [
            col("no", (t) => t.documents.number, "text", { sub: "reversal", subLabel: bi((t) => t.accounting.reversal), primary: true }), col("date", (t) => t.documents.date, "date"), col("job", (t) => t.sol.jobNo, "link", { sub: "client", subLabel: bi((t) => t.sol.client) }),
            col("kind", (t) => t.sol.kind, "text", { sub: "category", subLabel: bi((t) => t.expenses.category) }), col("payee", (t) => t.expenses.payee, "text", lg), col("vehicle", (t) => t.sol.vehicle, "code", xl), col("amount", (t) => t.receivables.amount, "money", total),
          ],
        }],
        checks: await ledgerChecks(input, [{ label: bi((t) => t.analytics.checks.solGoods), report: parts[0]?.amount ?? ZERO, keys: ["SOL_COSTS"], sources: ["sol_delivery", "sol_return"], from: input.period.from, to: input.period.to, debit: true }]),
        notes: [bi((t) => t.analytics.notes.reversals)],
      };
    },
  },
  {
    slug: "sol-profit", group: "sol", title: title("solProfit"), hint: hint("solProfit"), icon: BadgePercent, permissions: ["costs.view"], allowed: (ctx) => can(ctx, "sol.view"), dates: "period", filters,
    async load(input) {
      const rows = (await jobsOf(input)).filter((j) => j.status !== "draft");
      const known = rows.filter((j) => j.profit !== null);
      const profit = sumOf(known.map((j) => j.profit));
      const margin = (j: Job) => (j.status === "completed" && j.contract_value > 0 && j.profit !== null ? Math.round((j.profit * 1000) / j.contract_value) / 10 : null);
      const best = known.filter((j) => j.profit > 0).toSorted((a, b) => b.profit - a.profit).slice(0, 10);
      return {
        figures: [money("profit", bi((t) => t.sol.profit), profit, BadgePercent, { hint: bi((t) => t.sol.profitHint) }), money("direct", bi((t) => t.sol.directCosts), sumOf(rows.map((j) => j.direct_costs)), ClipboardList), money("vehicle", bi((t) => t.sol.vehicleExpenses), sumOf(rows.map((j) => j.vehicle_expenses)), Truck)],
        charts: best.length > 1 ? [{
          key: "profit", type: "bars", title: bi((t) => t.analytics.charts.profitByJob), hint: bi((t) => t.sol.profitHint), category: bi((t) => t.sol.jobNo), series: [{ key: "profit", label: bi((t) => t.sol.profit) }],
          points: best.map((j) => ({ label: { en: `${j.doc_no} · ${j.customer}`, ur: `${j.doc_no} · ${j.customer_ur ?? j.customer}` }, values: [toPaisa(j.profit)] })),
        }] : [],
        tables: [{
          key: "profit", title: title("solProfit"), search: ["no", "client", "type"],
          rows: rows.map((j): ReportRow => ({ ...jobCell(j), contract: contractOf(j), products: j.product_costs, other: j.other_costs, vehicle: j.vehicle_expenses, profit: j.profit, margin: margin(j) })),
          columns: [
            ...jobColumns, statusColumn, col("contract", (t) => t.sol.contract, "money", total), col("products", (t) => t.sol.productCosts, "money", { ...xxl, total: true }), col("other", (t) => t.sol.otherCosts, "money", { ...xxl, total: true }), col("vehicle", (t) => t.sol.vehicleExpenses, "money", { ...lg, total: true }),
            col("profit", (t) => t.sol.profit, "money", total), col("margin", (t) => t.reports.margin, "percent", xl),
          ],
        }],
        checks: await revenueCheck(input), notes: [bi((t) => t.analytics.notes.solProfit)],
      };
    },
  },
];
