import "server-only";
import { Banknote, CalendarDays, CalendarRange, HandCoins, MapPinned, Package, ReceiptText, Store, TriangleAlert, Truck, UserCheck } from "lucide-react";
import { loadReceivables, seesAllCollections } from "@/features/receivables/queries";
import { deliveryOptions } from "@/features/sales/status";
import { loadSupplyStaff, loadSupplyWork, reportSupply } from "@/features/supply/queries";
import { loadTakerReport } from "@/features/takers/queries";
import { PAYMENT_METHODS } from "@/features/receivables/schema";
import { toPaisa } from "@/lib/utils/money";
import { ledgerChecks } from "../checks";
import type { ReportDefinition, ReportRow } from "../model";
import { loadCustomerNames, loadUnpaidInvoices, reportCollections, reportDeliveries, reportSales, reportSalesByCustomer, reportSalesByProduct, reportTerritories } from "../queries";
import { bucketBi, statusOptions } from "../values";
import { bi, biKey, can, categoryFilter, col, daysFrom, hint, lg, name, optional, reversal, seesAllSales, sumOf, takerFilter, title, total, when, xl, xxl, type ReportFilter, type ReportInput } from "./shared";

const SALES = ["SALES", "SALES_RETURNS"];
const SALES_VIEW = ["sales.view", "sales.view_all"] as const;
const salesCheck = (input: ReportInput, report: bigint, sources?: string[]) =>
  seesAllSales(input.ctx) && { label: bi((t) => t.analytics.checks.sales), report, keys: SALES, sources, from: input.period.from, to: input.period.to };
const methodFilter = (): ReportFilter => ({ param: "method", label: bi((t) => t.receivables.method), all: bi((t) => t.receivables.allMethods), options: PAYMENT_METHODS.map((m) => ({ value: m, label: biKey((t) => t.purchasing.methods, m) })) });
const takerChoice = async (all: boolean) => (all ? takerFilter() : []);

const salesOver = (bucket: "day" | "month"): ReportDefinition => ({
  slug: bucket === "day" ? "daily-sales" : "monthly-sales", group: "sales", icon: bucket === "day" ? CalendarDays : CalendarRange, permissions: SALES_VIEW, dates: "period",
  title: bi((t) => (bucket === "day" ? t.reports.dailySales : t.reports.monthlySales)), hint: bi((t) => (bucket === "day" ? t.reports.dailySalesHint : t.reports.monthlySalesHint)),
  async load(input) {
    const rows = await reportSales(input.period, bucket);
    const collects = rows.some((x) => x.collected !== null);
    const net = sumOf(rows.map((x) => x.net_sales));
    const collected = sumOf(rows.map((x) => x.collected));
    return {
      figures: [
        { key: "sales", label: bi((t) => t.reports.netSales), value: { money: net }, icon: ReceiptText }, { key: "invoices", label: bi((t) => t.reports.invoices), value: { count: rows.reduce((n, x) => n + x.invoices, 0) }, icon: CalendarDays },
        ...when(collects, { key: "collected", label: bi((t) => t.reports.collected), value: { money: collected }, icon: Banknote }),
      ],
      charts: rows.length > 1 ? [{
        key: "sales", type: "columns", title: bi((t) => t.reports.netSales), hint: bi((t) => t.reports.salesNote), category: bi((t) => (bucket === "day" ? t.documents.date : t.reports.salesPeriod)),
        series: [{ key: "sales", label: bi((t) => t.reports.netSales) }, ...when(collects, { key: "collected", label: bi((t) => t.reports.collected) })],
        points: rows.toReversed().map((x) => ({ label: bucketBi(x.period, bucket), values: [toPaisa(x.net_sales), ...when(collects, toPaisa(x.collected ?? 0))] })),
      }] : [],
      tables: [{
        key: "sales", title: bi((t) => (bucket === "day" ? t.reports.dailySales : t.reports.monthlySales)),
        rows: rows.map((x): ReportRow => ({
          id: x.period, date: x.period, period: bucketBi(x.period, "month"), invoices: x.invoices, gross: x.gross, discounts: x.discounts, tax: x.tax, returns: x.returns, credit: x.credit_notes, debit: x.debit_notes, sales: x.net_sales, collected: x.collected,
        })),
        columns: [
          bucket === "day" ? col("date", (t) => t.documents.date, "date", { primary: true }) : col("period", (t) => t.reports.salesPeriod, "text", { primary: true }),
          col("invoices", (t) => t.reports.invoices, "quantity", total), col("gross", (t) => t.reports.gross, "money", { ...xl, total: true }), col("discounts", (t) => t.reports.discounts, "money", { ...xl, total: true }),
          col("tax", (t) => t.reports.tax, "money", { ...xxl, total: true }), col("returns", (t) => t.reports.returns, "money", { ...lg, total: true }), col("credit", (t) => t.reports.creditNotes, "money", { ...xxl, total: true }),
          col("debit", (t) => t.reports.debitNotes, "money", { ...xxl, total: true }), col("sales", (t) => t.reports.netSales, "money", total), ...when(collects, col("collected", (t) => t.reports.collected, "money", total)),
        ],
      }],
      checks: await ledgerChecks(input, [
        salesCheck(input, net),
        collects && seesAllSales(input.ctx) && { label: bi((t) => t.analytics.checks.collections), report: collected, keys: ["AR"], sources: ["customer_payment"], from: input.period.from, to: input.period.to },
      ]),
      notes: [bi((t) => t.reports.salesNote)],
    };
  },
});

export const salesReports: ReportDefinition[] = [
  salesOver("day"),
  salesOver("month"),
  {
    slug: "customer-sales", group: "sales", title: bi((t) => t.reports.customerSales), hint: bi((t) => t.reports.customerSalesHint), icon: Store, permissions: SALES_VIEW, dates: "period",
    filters: (ctx) => takerChoice(seesAllSales(ctx)),
    async load(input) {
      const { ctx } = input;
      const rows = await reportSalesByCustomer(input.period, input.filter("taker"));
      const all = seesAllSales(ctx);
      const receivables = can(ctx, "receivables.view");
      const net = sumOf(rows.map((x) => x.net_sales));
      const top = rows.filter((x) => x.net_sales > 0).toSorted((a, b) => b.net_sales - a.net_sales).slice(0, 10);
      return {
        figures: [{ key: "sales", label: bi((t) => t.reports.netSales), value: { money: net }, icon: ReceiptText }, { key: "customers", label: bi((t) => t.analytics.buyers), value: { count: rows.filter((x) => x.invoices > 0).length }, icon: Store }],
        charts: top.length > 1 ? [{
          key: "top", type: "bars", title: bi((t) => t.analytics.charts.topCustomers), hint: bi((t) => t.reports.salesNote), category: bi((t) => t.customers.name), series: [{ key: "sales", label: bi((t) => t.reports.netSales) }],
          points: top.map((x) => ({ label: { en: x.name, ur: x.name_ur ?? x.name }, values: [toPaisa(x.net_sales)] })),
        }] : [],
        tables: [{
          key: "customers", title: bi((t) => t.reports.customerSales), search: ["name", "code", "city", "taker"],
          rows: rows.map((x): ReportRow => ({
            id: x.customer_id, name: name(x.name, x.name_ur), nameHref: `/customers/${x.customer_id}`, code: x.code, city: x.city, taker: optional(x.taker_en, x.taker_ur), orders: x.orders, invoices: x.invoices, net: x.net, tax: x.tax, returns: x.returns,
            notes: x.notes, sales: x.net_sales, collected: x.collected, balance: x.balance,
          })),
          columns: [
            col("name", (t) => t.customers.name, "link", { sub: "code", subLabel: bi((t) => t.customers.code), primary: true }), col("city", (t) => t.customers.city, "text", { ...xxl, screenOnly: true }), ...when(all, col("taker", (t) => t.customers.orderTaker, "text", xl)),
            col("orders", (t) => t.takers.orders, "quantity", { ...lg, total: true }), col("invoices", (t) => t.reports.invoices, "quantity", { ...xxl, total: true }), col("net", (t) => t.reports.net, "money", { ...xl, total: true }), col("tax", (t) => t.reports.tax, "money", { ...xxl, total: true, screenOnly: true }),
            col("returns", (t) => t.reports.returns, "money", { ...xl, total: true }), col("notes", (t) => t.reports.notes, "money", { ...xxl, total: true }), col("sales", (t) => t.reports.netSales, "money", total),
            ...when(receivables, col("collected", (t) => t.reports.collected, "money", { ...lg, total: true }), col("balance", (t) => t.customers.balance, "money", total)),
          ],
        }],
        checks: await ledgerChecks(input, [salesCheck(input, net)]),
        notes: [bi((t) => t.reports.salesNote)],
      };
    },
  },
  {
    slug: "product-sales", group: "sales", title: bi((t) => t.reports.productSales), hint: bi((t) => t.reports.productSalesHint), icon: Package, permissions: SALES_VIEW, dates: "period",
    filters: categoryFilter,
    async load(input) {
      const rows = await reportSalesByProduct(input.period, input.filter("category"));
      const net = sumOf(rows.map((x) => x.net_sales));
      const top = rows.filter((x) => x.net_sales > 0).toSorted((a, b) => b.net_sales - a.net_sales).slice(0, 10);
      return {
        figures: [{ key: "sales", label: bi((t) => t.reports.netSales), value: { money: net }, icon: ReceiptText }, { key: "products", label: bi((t) => t.analytics.productsSold), value: { count: rows.filter((x) => x.quantity > 0).length }, icon: Package }],
        charts: top.length > 1 ? [{
          key: "top", type: "bars", title: bi((t) => t.analytics.charts.topProducts), hint: bi((t) => t.reports.productSalesHint), category: bi((t) => t.documents.product), series: [{ key: "sales", label: bi((t) => t.reports.netSales) }],
          points: top.map((x) => ({ label: { en: x.name_en, ur: x.name_ur ?? x.name_en }, values: [toPaisa(x.net_sales)] })),
        }] : [],
        tables: [{
          key: "products", title: bi((t) => t.reports.productSales), search: ["name", "sku", "category"],
          rows: rows.map((x): ReportRow => ({
            id: x.product_id, name: name(x.name_en, x.name_ur), sku: x.sku, category: optional(x.category_en, x.category_ur), unit: name(x.unit_en, x.unit_ur), quantity: x.quantity, returned: x.returned_quantity, netQuantity: x.net_quantity, gross: x.gross, discounts: x.discounts,
            returns: x.returns, sales: x.net_sales,
          })),
          columns: [
            col("name", (t) => t.documents.product, "text", { sub: "sku", subLabel: bi((t) => t.catalog.sku), primary: true }), col("category", (t) => t.catalog.category, "text", { ...xxl, screenOnly: true }), col("unit", (t) => t.documents.unit, "text", lg), col("quantity", (t) => t.reports.soldQuantity, "quantity"),
            col("returned", (t) => t.reports.returnedQuantity, "quantity", lg), col("netQuantity", (t) => t.reports.netQuantity, "quantity", xl), col("gross", (t) => t.reports.gross, "money", { ...xl, total: true }), col("discounts", (t) => t.reports.discounts, "money", { ...xl, total: true }),
            col("returns", (t) => t.reports.returns, "money", { ...lg, total: true }), col("sales", (t) => t.reports.netSales, "money", total),
          ],
        }],
        checks: await ledgerChecks(input, [salesCheck(input, net, ["sales_invoice", "customer_return"])]),
        notes: [bi((t) => t.analytics.notes.productSales)],
      };
    },
  },
  {
    slug: "order-takers", group: "sales", title: bi((t) => t.reports.orderTakers), hint: bi((t) => t.reports.orderTakersHint), icon: UserCheck, permissions: SALES_VIEW, dates: "period",
    async load({ period }) {
      const rows = await loadTakerReport(period.from, period.to);
      const active = rows.filter((x) => x.total_sales > 0 || (x.collected ?? 0) > 0).toSorted((a, b) => b.total_sales - a.total_sales).slice(0, 12);
      return {
        charts: active.length > 1 ? [{
          key: "takers", type: "columns", title: bi((t) => t.analytics.charts.takers), hint: bi((t) => t.takers.performanceHint), category: bi((t) => t.sales.orderTaker),
          series: [{ key: "sales", label: bi((t) => t.takers.totalSales) }, { key: "collected", label: bi((t) => t.takers.collected) }],
          points: active.map((x) => ({ label: { en: x.full_name, ur: x.full_name_ur ?? x.full_name }, values: [toPaisa(x.total_sales), toPaisa(x.collected ?? 0)] })),
        }] : [],
        tables: [{
          key: "takers", title: bi((t) => t.reports.orderTakers), search: ["name", "territory"],
          rows: rows.map((x): ReportRow => ({
            id: x.employee_id, name: name(x.full_name, x.full_name_ur), nameHref: `/order-takers/${x.employee_id}`, territory: x.territory, customers: x.customers, orders: x.orders, value: x.order_value, delivered: x.delivered_orders, cancelled: x.cancelled_orders,
            open: x.open_orders, sales: x.total_sales, collected: x.collected, pending: x.pending_collections, held: x.cash_held,
          })),
          columns: [
            col("name", (t) => t.sales.orderTaker, "link", { sub: "territory", subLabel: bi((t) => t.takers.territory), primary: true }), col("customers", (t) => t.takers.customers, "quantity", { ...xxl, total: true }), col("orders", (t) => t.takers.orders, "quantity", total),
            col("value", (t) => t.takers.orderValue, "money", { ...xxl, total: true }), col("delivered", (t) => t.takers.delivered, "quantity", { ...lg, total: true }), col("cancelled", (t) => t.takers.cancelled, "quantity", { ...xl, total: true }),
            col("open", (t) => t.takers.open, "quantity", { ...xxl, total: true }), col("sales", (t) => t.takers.totalSales, "money", total), col("collected", (t) => t.takers.collected, "money", { ...lg, total: true }),
            col("pending", (t) => t.takers.pending, "money", { ...xl, total: true }), col("held", (t) => t.takers.cashHeld, "money", { ...lg, total: true }),
          ],
        }],
        notes: [bi((t) => t.takers.performanceHint)],
      };
    },
  },
  {
    slug: "supply-work", group: "sales", title: bi((t) => t.supply.workTitle), hint: bi((t) => t.supply.workHint), icon: Truck, permissions: ["sales.view_all", "sales.team"], dates: "period",
    async load({ period }) {
      const rows = await loadSupplyWork(period.from, period.to);
      const drawn = rows.filter((x) => x.delivered > 0).toSorted((a, b) => b.delivered - a.delivered).slice(0, 10);
      const paid = rows.some((x) => x.money_received !== null);
      return {
        charts: drawn.length > 1 ? [{
          key: "work", type: "bars", counts: true, title: bi((t) => t.supply.delivered), hint: bi((t) => t.supply.workHint), category: bi((t) => t.supply.supplier), series: [{ key: "n", label: bi((t) => t.supply.deliveries) }],
          points: drawn.map((x) => ({ label: { en: x.full_name, ur: x.full_name_ur ?? x.full_name }, values: [BigInt(x.delivered)] })),
        }] : [],
        tables: [{
          key: "suppliers", title: bi((t) => t.supply.workTitle), search: ["name", "code"], empty: bi((t) => t.supply.empty),
          rows: rows.map((x): ReportRow => ({ id: x.employee_id, name: name(x.full_name, x.full_name_ur), nameHref: `/supply-team/${x.employee_id}`, code: x.code, deliveries: x.deliveries, delivered: x.delivered, way: x.on_the_way, shops: x.shops, amount: x.amount, money: x.money_received, held: x.cash_held })),
          columns: [
            col("name", (t) => t.supply.supplier, "link", { sub: "code", subLabel: bi((t) => t.employees.code), primary: true }), col("deliveries", (t) => t.supply.deliveries, "quantity", total), col("delivered", (t) => t.supply.delivered, "quantity", total), col("way", (t) => t.supply.onTheWay, "quantity", { ...lg, total: true }),
            col("shops", (t) => t.supply.shops, "quantity", lg), col("amount", (t) => t.supply.amount, "money", total), ...when(paid, col("money", (t) => t.supply.moneyReceived, "money", total), col("held", (t) => t.supply.cashHeld, "money", { ...lg, total: true })),
          ],
        }],
        notes: [bi((t) => t.supply.performanceHint)],
      };
    },
  },
  {
    slug: "supply", group: "sales", title: bi((t) => t.supply.reportTitle), hint: bi((t) => t.supply.reportHint), icon: Truck, permissions: SALES_VIEW, dates: "period",
    filters: async () => { const staff = await loadSupplyStaff(); return staff.length ? [{ param: "supplier", label: bi((t) => t.supply.supplier), all: bi((t) => t.supply.all), options: staff.map((x) => ({ value: x.id, label: name(x.nameEn, x.nameUr) })) }] : []; },
    async load({ period, filter }) {
      const rows = await reportSupply(period.from, period.to, filter("supplier"));
      const paid = rows.some((x) => x.money_received !== null);
      return {
        figures: [
          { key: "n", label: bi((t) => t.supply.delivered), value: { count: rows.filter((x) => x.status === "delivered").length }, icon: Truck }, { key: "amount", label: bi((t) => t.supply.amount), value: { money: sumOf(rows.map((x) => x.amount)) }, icon: ReceiptText },
          ...when(paid, { key: "money", label: bi((t) => t.supply.moneyReceived), value: { money: sumOf(rows.map((x) => x.money_received)) }, icon: Banknote }),
        ],
        tables: [{
          key: "deliveries", title: bi((t) => t.supply.reportTitle), search: ["no", "shop", "city", "taker", "supplier", "received", "invoice"],
          rows: rows.map((x): ReportRow => ({
            id: x.delivery_id, no: x.doc_no, noHref: `/sales/deliveries/${x.delivery_id}`, date: x.delivery_date, shop: name(x.customer, x.customer_ur), city: x.city, taker: optional(x.taker_en, x.taker_ur), supplier: optional(x.supplier_en, x.supplier_ur), received: x.received_by, at: x.delivered_at,
            invoice: x.invoice_no, amount: x.amount, money: x.money_received, left: x.outstanding, status: x.status,
          })),
          columns: [
            col("no", (t) => t.sales.delivery, "link", { sub: "invoice", subLabel: bi((t) => t.supply.invoice), primary: true }), col("date", (t) => t.documents.date, "date"), col("shop", (t) => t.supply.shop, "text", { sub: "city", subLabel: bi((t) => t.customers.city) }),
            col("taker", (t) => t.supply.orderTaker, "text", xl), col("supplier", (t) => t.supply.suppliedBy, "text"), col("received", (t) => t.supply.receivedBy, "text", { ...xxl, screenOnly: true }), col("at", (t) => t.supply.deliveredAt, "datetime", { ...xxl, screenOnly: true }),
            col("amount", (t) => t.supply.amount, "money", total), ...when(paid, col("money", (t) => t.supply.moneyReceived, "money", total), col("left", (t) => t.supply.outstanding, "money", { ...xl, total: true })),
            col("status", (t) => t.common.status, "status", { options: statusOptions(deliveryOptions), hideBelow: "lg" }),
          ],
        }],
        notes: [bi((t) => t.supply.reportNote)],
      };
    },
  },
  {
    slug: "territories", group: "sales", title: title("territories"), hint: hint("territories"), icon: MapPinned, permissions: SALES_VIEW, dates: "period",
    filters: () => [{ param: "by", label: bi((t) => t.analytics.groupBy), all: bi((t) => t.analytics.byTerritory), keeps: true, options: [{ value: "city", label: bi((t) => t.analytics.byCity) }, { value: "area", label: bi((t) => t.analytics.byArea) }] }],
    async load(input) {
      const by = input.filter("by") === "city" ? "city" : input.filter("by") === "area" ? "area" : "territory";
      const rows = await reportTerritories(input.period, by);
      const receivables = can(input.ctx, "receivables.view");
      const net = sumOf(rows.map((x) => x.net_sales));
      const none = bi((t) => t.analytics.withoutTerritory);
      const label = bi((t) => (by === "city" ? t.customers.city : by === "area" ? t.customers.area : t.takers.territory));
      const drawn = rows.filter((x) => x.net_sales > 0).slice(0, 10);
      return {
        charts: drawn.length > 1 ? [{
          key: "territories", type: "bars", title: bi((t) => t.reports.netSales), hint: bi((t) => t.reports.salesNote), category: label, series: [{ key: "sales", label: bi((t) => t.reports.netSales) }],
          points: drawn.map((x) => ({ label: x.territory ? { en: x.territory, ur: x.territory } : none, values: [toPaisa(x.net_sales)] })),
        }] : [],
        tables: [{
          key: "territories", title: title("territories"), search: ["name"],
          rows: rows.map((x, i): ReportRow => ({ id: String(i), name: x.territory ?? none, customers: x.customers, buyers: x.buyers, orders: x.orders, invoices: x.invoices, sales: x.net_sales, collected: x.collected, balance: x.balance })),
          columns: [
            { key: "name", label, kind: "text", primary: true }, col("customers", (t) => t.takers.customers, "quantity", total), col("buyers", (t) => t.analytics.buyers, "quantity", { ...lg, total: true }), col("orders", (t) => t.takers.orders, "quantity", { ...xl, total: true }),
            col("invoices", (t) => t.reports.invoices, "quantity", { ...lg, total: true }), col("sales", (t) => t.reports.netSales, "money", total),
            ...when(receivables, col("collected", (t) => t.reports.collected, "money", { ...lg, total: true }), col("balance", (t) => t.customers.balance, "money", total)),
          ],
        }],
        checks: await ledgerChecks(input, [salesCheck(input, net)]),
        notes: [bi((t) => t.analytics.notes.territories), bi((t) => t.reports.salesNote)],
      };
    },
  },
  {
    slug: "pending-collections", group: "sales", title: title("pendingCollections"), hint: hint("pendingCollections"), icon: TriangleAlert, permissions: ["receivables.view"], dates: "now",
    filters: (ctx) => takerChoice(seesAllSales(ctx) || can(ctx, "customers.manage")),
    async load(input) {
      const taker = input.filter("taker");
      const [customers, invoices, names] = await Promise.all([loadReceivables(input.today, taker), loadUnpaidInvoices(taker), loadCustomerNames()]);
      const balance = sumOf(customers.map((x) => x.balance));
      const overdue = invoices.filter((x) => x.due_date && x.due_date < input.today);
      const owing = customers.filter((x) => x.balance > 0);
      return {
        figures: [
          { key: "owed", label: bi((t) => t.receivables.total), value: { money: sumOf(owing.map((x) => x.balance)) }, icon: HandCoins }, { key: "overdue", label: bi((t) => t.receivables.overdue), value: { money: sumOf(overdue.map((x) => x.outstanding)) }, icon: TriangleAlert, attention: overdue.length > 0 },
          { key: "invoices", label: bi((t) => t.analytics.unpaidInvoices), value: { count: invoices.length }, icon: ReceiptText }, { key: "advances", label: bi((t) => t.receivables.advances), value: { money: sumOf(customers.map((x) => x.advance)) }, icon: Banknote },
        ],
        tables: [
          {
            key: "customers", title: bi((t) => t.analytics.byCustomer), search: ["name", "code", "taker", "phone"], empty: bi((t) => t.receivables.outstandingEmpty), sort: { id: "balance", descending: true },
            rows: customers.map((x): ReportRow => ({ id: x.customer_id, name: name(x.name, x.name_ur), nameHref: `/customers/${x.customer_id}`, code: x.code, phone: x.phone, taker: optional(x.taker_en, x.taker_ur), balance: x.balance, overdue: x.overdue, last: x.last_payment })),
            columns: [
              col("name", (t) => t.customers.name, "link", { sub: "code", subLabel: bi((t) => t.customers.code), primary: true }), col("phone", (t) => t.customers.phone, "code", xl), col("taker", (t) => t.customers.orderTaker, "text", lg),
              col("balance", (t) => t.customers.balance, "money", total), col("overdue", (t) => t.receivables.overdue, "money", total), col("last", (t) => t.customers.lastPayment, "date", lg),
            ],
          },
          {
            key: "invoices", title: bi((t) => t.analytics.unpaidInvoices), search: ["no", "customer"], empty: bi((t) => t.receivables.outstandingEmpty),
            rows: invoices.map((x): ReportRow => {
              const c = names.get(x.customer_id ?? "");
              const late = x.due_date ? daysFrom(x.due_date, input.today) : 0;
              return {
                id: x.sales_invoice_id ?? "", no: x.doc_no, noHref: `/sales/invoices/${x.sales_invoice_id}`, customer: c ? name(c.en, c.ur) : null, date: x.invoice_date, due: x.due_date, late: late > 0 ? late : null, amount: x.total_amount, paid: x.paid_amount,
                returned: (x.returned_amount ?? 0) + (x.credited_amount ?? 0), left: x.outstanding,
              };
            }),
            columns: [
              col("no", (t) => t.sales.invoice, "link", { primary: true }), col("customer", (t) => t.sales.customer, "text"), col("date", (t) => t.documents.date, "date", lg), col("due", (t) => t.analytics.dueDate, "date", xl), col("late", (t) => t.analytics.daysLate, "quantity"),
              col("amount", (t) => t.analytics.invoiceTotal, "money", { ...lg, total: true }), col("paid", (t) => t.payroll.paid, "money", { ...xl, total: true }), col("returned", (t) => t.analytics.returnsAndCredits, "money", { ...xxl, total: true }), col("left", (t) => t.customers.balance, "money", total),
            ],
          },
        ],
        checks: await ledgerChecks(input, [{ label: bi((t) => t.analytics.checks.receivables), report: balance, keys: ["AR"], from: null, to: input.today, debit: true }]),
        notes: [bi((t) => t.analytics.notes.pendingCollections)],
      };
    },
  },
  {
    slug: "receivables", group: "finance", title: bi((t) => t.reports.receivables), hint: bi((t) => t.reports.receivablesHint), icon: HandCoins, permissions: ["receivables.view"], dates: "day",
    filters: (ctx) => takerChoice(seesAllSales(ctx) || can(ctx, "customers.manage")),
    async load(input) {
      const rows = await loadReceivables(input.day, input.filter("taker"));
      const all = seesAllSales(input.ctx) || can(input.ctx, "customers.manage");
      const ages = ["days_30", "days_60", "days_90", "older"] as const;
      const balance = sumOf(rows.map((x) => x.balance));
      return {
        figures: [{ key: "balance", label: bi((t) => t.customers.balance), value: { money: balance }, icon: HandCoins }, { key: "overdue", label: bi((t) => t.receivables.overdue), value: { money: sumOf(rows.map((x) => x.overdue)) }, icon: TriangleAlert }],
        charts: rows.length ? [{
          key: "ages", type: "columns", title: bi((t) => t.analytics.charts.ages), hint: bi((t) => t.reports.receivablesHint), category: bi((t) => t.analytics.age), series: [{ key: "amount", label: bi((t) => t.customers.balance) }],
          points: ages.map((k) => ({ label: bi((t) => t.receivables.ages[k]), values: [sumOf(rows.map((x) => x[k]))] })),
        }] : [],
        tables: [{
          key: "receivables", title: bi((t) => t.reports.receivables), search: ["name", "code", "city", "taker", "phone"], empty: bi((t) => t.receivables.outstandingEmpty),
          rows: rows.map((x): ReportRow => ({
            id: x.customer_id, name: name(x.name, x.name_ur), nameHref: `/customers/${x.customer_id}`, code: x.code, phone: x.phone, city: [x.area, x.city].filter(Boolean).join(", "), taker: optional(x.taker_en, x.taker_ur), limit: x.credit_limit, a: x.days_30, b: x.days_60, c: x.days_90,
            o: x.older, advance: x.advance, balance: x.balance, overdue: x.overdue, last: x.last_payment,
          })),
          columns: [
            col("name", (t) => t.customers.name, "link", { sub: "code", subLabel: bi((t) => t.customers.code), primary: true }), col("phone", (t) => t.customers.phone, "code", xxl), col("city", (t) => t.customers.city, "text", { ...xxl, screenOnly: true }),
            ...when(all, col("taker", (t) => t.customers.orderTaker, "text", { ...xxl, screenOnly: true })), col("a", (t) => t.receivables.ages.days_30, "money", { ...lg, total: true }), col("b", (t) => t.receivables.ages.days_60, "money", { ...lg, total: true }),
            col("c", (t) => t.receivables.ages.days_90, "money", { ...xl, total: true }), col("o", (t) => t.receivables.ages.older, "money", { ...xl, total: true }), col("advance", (t) => t.receivables.advances, "money", { ...xxl, total: true }), col("balance", (t) => t.customers.balance, "money", total),
            col("overdue", (t) => t.receivables.overdue, "money", { ...xl, total: true }), col("limit", (t) => t.customers.creditLimit, "money", { ...xxl, screenOnly: true }), col("last", (t) => t.customers.lastPayment, "date", { ...xxl, screenOnly: true }),
          ],
        }],
        checks: await ledgerChecks(input, [{ label: bi((t) => t.analytics.checks.receivables), report: balance, keys: ["AR"], from: null, to: input.day, debit: true }]),
        notes: [bi((t) => t.analytics.notes.aging)],
      };
    },
  },
  {
    slug: "collections", group: "sales", title: bi((t) => t.reports.collections), hint: bi((t) => t.reports.collectionsHint), icon: Banknote, permissions: ["receivables.view", "receivables.collect", "receivables.post"], dates: "period",
    allowed: (ctx) => seesAllCollections(ctx) || can(ctx, "receivables.collect"),
    filters: async (ctx) => [methodFilter(), ...(await takerChoice(seesAllCollections(ctx)))],
    async load(input) {
      const rows = await reportCollections(input.period, input.filter("taker"), input.filter("method"));
      const amount = sumOf(rows.map((x) => x.amount));
      return {
        figures: [{ key: "collected", label: bi((t) => t.reports.collected), value: { money: amount }, icon: Banknote }, { key: "payments", label: bi((t) => t.analytics.paymentCount), value: { count: rows.filter((x) => !x.is_reversal).length }, icon: ReceiptText }],
        tables: [{
          key: "collections", title: bi((t) => t.reports.collections), search: ["no", "reference", "customer", "collector", "invoices"],
          rows: rows.map((x): ReportRow => ({
            id: x.entry_id, no: x.doc_no, noHref: `/receivables/payments/${x.payment_id}`, date: x.payment_date, reference: x.reference, reversal: reversal(x.is_reversal), customer: name(x.customer, x.customer_ur), method: biKey((t) => t.purchasing.methods, x.method),
            collector: optional(x.collector_en, x.collector_ur), destination: x.held ? bi((t) => t.receivables.heldByTaker) : x.destination, invoices: x.invoices, amount: x.amount, settled: x.settled, onAccount: x.on_account,
          })),
          columns: [
            col("no", (t) => t.documents.number, "link", { sub: "reversal", subLabel: bi((t) => t.accounting.reversal), primary: true }), col("date", (t) => t.documents.date, "date"), col("customer", (t) => t.sales.customer, "text"), col("method", (t) => t.receivables.method, "text", { sub: "reference", subLabel: bi((t) => t.receivables.reference), hideBelow: "lg" }),
            col("collector", (t) => t.receivables.collectedBy, "text", xl), col("destination", (t) => t.receivables.destination, "text", { ...xxl, screenOnly: true }), col("invoices", (t) => t.reports.invoices, "code", { ...xxl, screenOnly: true }), col("amount", (t) => t.receivables.amount, "money", total),
            col("settled", (t) => t.receivables.settled, "money", { ...lg, total: true }), col("onAccount", (t) => t.receivables.onAccount, "money", { ...xl, total: true }),
          ],
        }],
        checks: await ledgerChecks(input, [seesAllCollections(input.ctx) && { label: bi((t) => t.analytics.checks.collections), report: amount, keys: ["AR"], sources: ["customer_payment"], from: input.period.from, to: input.period.to }]),
        notes: [bi((t) => t.analytics.notes.reversals)],
      };
    },
  },
  {
    slug: "deliveries", group: "operations", title: bi((t) => t.reports.deliveries), hint: bi((t) => t.reports.deliveriesHint), icon: Truck, permissions: SALES_VIEW, dates: "period",
    filters: () => [{ param: "status", label: bi((t) => t.common.status), all: bi((t) => t.documents.allStatuses), options: ["dispatched", "delivered"].map((s) => ({ value: s, label: biKey((t) => t.sales.deliveryStatuses, s) })) }],
    async load({ period, filter }) {
      const rows = await reportDeliveries(period, filter("status"));
      return {
        tables: [{
          key: "deliveries", title: bi((t) => t.reports.deliveries), search: ["no", "order", "customer", "city", "vehicle", "driver"],
          rows: rows.map((x): ReportRow => ({
            id: x.delivery_id, no: x.doc_no, noHref: `/sales/deliveries/${x.delivery_id}`, order: x.order_no, date: x.delivery_date, customer: name(x.customer, x.customer_ur), city: x.city, taker: optional(x.taker_en, x.taker_ur), vehicle: x.vehicle, driver: optional(x.driver_en, x.driver_ur),
            delivered: x.delivered_at, received: x.received_by, out: x.dispatched_quantity, back: x.returned_quantity, amount: x.amount, returned: x.returned_amount, status: x.status,
          })),
          columns: [
            col("no", (t) => t.sales.delivery, "link", { sub: "order", subLabel: bi((t) => t.sales.order), primary: true }), col("date", (t) => t.documents.date, "date"), col("customer", (t) => t.sales.customer, "text", { sub: "city", subLabel: bi((t) => t.customers.city) }), col("taker", (t) => t.sales.orderTaker, "text", { ...xxl, screenOnly: true }),
            col("vehicle", (t) => t.sales.vehicle, "text", { sub: "driver", subLabel: bi((t) => t.sales.driver), hideBelow: "xl" }), col("delivered", (t) => t.sales.deliveredAt, "datetime", { ...xxl, screenOnly: true }), col("received", (t) => t.sales.receivedBy, "text", { ...xxl, screenOnly: true }),
            col("out", (t) => t.sales.dispatched, "quantity", { ...lg, total: true }), col("back", (t) => t.sales.returned, "quantity", { ...lg, total: true }), col("amount", (t) => t.sales.invoice, "money", total), col("returned", (t) => t.reports.returns, "money", { ...xl, total: true }),
            col("status", (t) => t.common.status, "status", { options: statusOptions(deliveryOptions) }),
          ],
        }],
      };
    },
  },
];
