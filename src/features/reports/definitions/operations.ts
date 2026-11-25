import "server-only";
import { Banknote, Route, Truck, Wallet } from "lucide-react";
import { expenseRegister, loadAllCategories, reportExpenses } from "@/features/expenses/queries";
import { EXPENSE_STATUSES } from "@/features/expenses/schema";
import { expenseOptions } from "@/features/expenses/status";
import { loadVehicles, reportVehicleLog, reportVehicles } from "@/features/fleet/queries";
import { reportPayroll } from "@/features/payroll/queries";
import { documentOptions } from "@/features/sales/status";
import { solDeliveryOptions, vehicleOptions } from "@/features/sol/status";
import { ledgerChecks } from "../checks";
import type { ReportDefinition, ReportRow } from "../model";
import { bucketBi, statusOptions } from "../values";
import { bi, biKey, can, col, lg, name, optional, sumOf, total, when, xl, xxl } from "./shared";

export const operationsReports: ReportDefinition[] = [
  {
    slug: "expenses", group: "operations", title: bi((t) => t.reports.expenses), hint: bi((t) => t.reports.expensesHint), icon: Wallet, permissions: ["expenses.view"], dates: "period",
    filters: async () => {
      const list = await loadAllCategories();
      return [
        { param: "category", label: bi((t) => t.expenses.category), all: bi((t) => t.expenses.allCategories), options: list.filter((c) => !c.is_payroll).map((c) => ({ value: c.id, label: name(c.name_en, c.name_ur) })) },
        { param: "status", label: bi((t) => t.common.status), all: bi((t) => t.documents.allStatuses), options: EXPENSE_STATUSES.map((s) => ({ value: s as string, label: biKey((t) => t.expenses.statuses, s) })) },
      ];
    },
    async load(input) {
      const { period, filter } = input;
      const [categories, rows] = await Promise.all([reportExpenses(period.from, period.to), expenseRegister(period.from, period.to, filter("category"), filter("status"))]);
      const used = categories.filter((c) => (c.amount ?? 0) !== 0);
      const payroll = can(input.ctx, "payroll.view");
      return {
        figures: [{ key: "total", label: bi((t) => t.vehicles.total), value: { money: sumOf(used.map((c) => c.amount)) }, icon: Wallet }],
        tables: [
          {
            key: "categories", title: bi((t) => t.expenses.category), sort: { id: "amount", descending: true },
            rows: used.map((c): ReportRow => ({ id: c.category_id, name: name(c.name_en, c.name_ur), note: c.is_payroll ? bi((t) => t.expenses.payrollCategory) : null, n: c.vouchers, amount: c.amount })),
            columns: [col("name", (t) => t.expenses.category, "text", { sub: "note", subLabel: bi((t) => t.documents.notes), primary: true }), col("n", (t) => t.expenses.tabs.vouchers, "quantity"), col("amount", (t) => t.expenses.amount, "money", total)],
          },
          {
            key: "vouchers", title: bi((t) => t.expenses.tabs.vouchers), search: ["no", "category", "description", "payee", "recorded", "decided"],
            rows: rows.map((r): ReportRow => ({
              id: r.expense_id, no: r.doc_no, noHref: `/expenses/${r.expense_id}`, receipt: r.has_receipt ? null : bi((t) => t.expenses.noReceipt), date: r.expense_date, category: name(r.category_en, r.category_ur), description: r.description, payee: r.payee, method: r.method ? biKey((t) => t.purchasing.methods, r.method) : null, account: r.account,
              recorded: r.recorded_by, decided: r.decided_by, amount: r.amount, status: r.status,
            })),
            columns: [
              col("no", (t) => t.expenses.voucherNo, "link", { sub: "receipt", subLabel: bi((t) => t.expenses.receipt), primary: true }), col("date", (t) => t.expenses.date, "date"), col("category", (t) => t.expenses.category, "text", { sub: "description", subLabel: bi((t) => t.expenses.description) }), col("payee", (t) => t.expenses.payee, "text", lg),
              col("method", (t) => t.expenses.method, "text", { sub: "account", subLabel: bi((t) => t.expenses.paidFrom), hideBelow: "2xl" }), col("recorded", (t) => t.expenses.recordedBy, "text", { ...xxl, screenOnly: true }), col("decided", (t) => t.expenses.approvedBy, "text", { ...xxl, screenOnly: true }), col("amount", (t) => t.expenses.amount, "money"),
              col("status", (t) => t.common.status, "status", { options: statusOptions(expenseOptions) }),
            ],
          },
        ],
        checks: await ledgerChecks(input, [payroll && { label: bi((t) => t.analytics.checks.expenseVouchers), report: sumOf(categories.map((c) => c.amount)), keys: ["type:expense"], sources: ["expense", "payroll_run"], from: period.from, to: period.to, debit: true }]),
        notes: [bi((t) => t.analytics.notes.expenseVouchers)],
      };
    },
  },
  {
    slug: "payroll", group: "operations", title: bi((t) => t.reports.payroll), hint: bi((t) => t.reports.payrollHint), icon: Banknote, permissions: ["payroll.view"], dates: "period",
    async load({ period }) {
      const rows = await reportPayroll(period.from, period.to);
      return {
        tables: [{
          key: "payroll", title: bi((t) => t.reports.payroll), search: ["name", "month"],
          rows: rows.map((r): ReportRow => ({
            id: r.payroll_item_id, name: name(r.full_name, r.full_name_ur), nameHref: `/payroll/employees/${r.employee_id}`, month: bucketBi(r.period_month, "month"), basic: r.basic_salary, allowances: r.allowances, bonus: r.bonus, deductions: r.deductions, recovery: r.advance_recovery, net: r.net_pay, paid: r.paid, pending: r.pending, status: r.status,
          })),
          columns: [
            col("name", (t) => t.payroll.employee, "link", { sub: "month", subLabel: bi((t) => t.payroll.month), primary: true }), col("basic", (t) => t.payroll.basic, "money", { ...lg, total: true }), col("allowances", (t) => t.payroll.allowances, "money", { ...xxl, total: true }), col("bonus", (t) => t.payroll.bonus, "money", { ...xl, total: true }),
            col("deductions", (t) => t.payroll.deductions, "money", { ...xl, total: true }), col("recovery", (t) => t.payroll.recovery, "money", { ...xxl, total: true }), col("net", (t) => t.payroll.net, "money", total), col("paid", (t) => t.payroll.paid, "money", total), col("pending", (t) => t.payroll.pending, "money", total),
            col("status", (t) => t.common.status, "status", { options: statusOptions(documentOptions) }),
          ],
        }],
      };
    },
  },
  {
    slug: "vehicles", group: "operations", title: bi((t) => t.reports.vehicles), hint: bi((t) => t.reports.vehiclesHint), icon: Truck, permissions: ["vehicles.view"], dates: "period",
    async load({ ctx, period }) {
      const rows = await reportVehicles(period);
      const costs = can(ctx, "expenses.view");
      return {
        tables: [{
          key: "vehicles", title: bi((t) => t.reports.vehicles), search: ["no", "name", "driver"], empty: bi((t) => t.vehicles.empty),
          rows: rows.map((x): ReportRow => ({
            id: x.vehicle_id, no: x.registration_no, noHref: `/vehicles/${x.vehicle_id}`, name: x.name, driver: optional(x.driver_en, x.driver_ur), status: x.status, jobs: x.jobs, sol: x.sol_deliveries, sales: x.sales_deliveries, distance: x.distance, fuel: x.fuel, litres: x.litres, maintenance: x.maintenance,
            repairs: x.repairs, other: x.other, total: x.total, forJobs: x.for_jobs,
          })),
          columns: [
            col("no", (t) => t.vehicles.registration, "link", { sub: "name", subLabel: bi((t) => t.vehicles.name), primary: true }), col("driver", (t) => t.vehicles.driver, "text", { ...xxl, screenOnly: true }), col("status", (t) => t.vehicles.status, "status", { options: statusOptions(vehicleOptions), screenOnly: costs }),
            col("jobs", (t) => t.vehicles.jobs, "quantity", { ...xxl, screenOnly: costs }), col("sol", (t) => t.vehicles.solTrips, "quantity", total), col("sales", (t) => t.vehicles.salesTrips, "quantity", total), col("distance", (t) => t.vehicles.distance, "quantity", { ...lg, total: true }),
            ...when(costs, col("fuel", (t) => t.vehicles.fuel, "money", { ...xl, total: true }), col("litres", (t) => t.vehicles.litres, "decimal", { ...xxl, screenOnly: true }), col("maintenance", (t) => t.vehicles.maintenance, "money", { ...xxl, total: true }), col("repairs", (t) => t.vehicles.repairs, "money", { ...xxl, total: true }),
              col("other", (t) => t.vehicles.other, "money", { ...xxl, total: true }), col("total", (t) => t.vehicles.total, "money", total), col("forJobs", (t) => t.vehicles.forJobs, "money", { ...xl, total: true })),
          ],
        }],
        notes: [bi((t) => t.vehicles.useHint)],
      };
    },
  },
  {
    slug: "vehicle-trips", group: "operations", title: bi((t) => t.reports.vehicleTrips), hint: bi((t) => t.reports.vehicleTripsHint), icon: Route, permissions: ["vehicles.view"], dates: "period",
    filters: async () => [{ param: "vehicle", label: bi((t) => t.sol.vehicle), all: bi((t) => t.vehicles.allVehicles), options: (await loadVehicles()).map((x) => ({ value: x.id, label: `${x.registration_no} · ${x.name}` })) }],
    async load({ ctx, period, filter }) {
      const rows = await reportVehicleLog(period, filter("vehicle"));
      const open = { sol: can(ctx, "sol.view"), sales: can(ctx, "sales.view") || can(ctx, "sales.view_all") };
      return {
        tables: [{
          key: "trips", title: bi((t) => t.reports.vehicleTrips), search: ["no", "vehicle", "source", "client", "destination", "driver"], empty: bi((t) => t.vehicles.tripEmpty),
          rows: rows.map((x): ReportRow => {
            const sol = x.kind === "sol";
            const link = sol ? open.sol : open.sales;
            return {
              id: x.delivery_id, no: x.doc_no, noHref: link ? (sol ? `/sol/deliveries/${x.delivery_id}` : `/sales/deliveries/${x.delivery_id}`) : null, kind: bi((t) => (sol ? t.vehicles.tripKinds.sol : t.vehicles.tripKinds.sales)), date: x.delivery_date, vehicle: x.registration_no, driver: optional(x.driver_en, x.driver_ur), source: x.source_no,
              sourceHref: link ? (sol ? `/sol/jobs/${x.source_id}` : `/sales/orders/${x.source_id}`) : null, client: name(x.client, x.client_ur), destination: x.destination, status: x.status, dispatched: x.dispatched_at, delivered: x.delivered_at,
              distance: x.odometer_end !== null && x.odometer_start !== null ? x.odometer_end - x.odometer_start : null,
            };
          }),
          columns: [
            col("no", (t) => t.documents.number, "link", { sub: "kind", subLabel: bi((t) => t.stock.kind), primary: true }), col("date", (t) => t.documents.date, "date"), col("vehicle", (t) => t.sol.vehicle, "code"), col("source", (t) => t.vehicles.source, "link"), col("client", (t) => t.vehicles.client, "text", { sub: "destination", subLabel: bi((t) => t.vehicles.destination) }),
            col("driver", (t) => t.vehicles.driver, "text", lg), col("dispatched", (t) => t.sol.dispatchedAt, "datetime", { ...xxl, screenOnly: true }), col("delivered", (t) => t.sol.deliveredAt, "datetime", xl), col("distance", (t) => t.vehicles.distance, "quantity", { ...lg, total: true }),
            col("status", (t) => t.common.status, "status", { options: statusOptions(solDeliveryOptions) }),
          ],
        }],
      };
    },
  },
];
