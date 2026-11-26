import "server-only";
import { ArrowLeftRight, Banknote, Building2, Clock3, HandCoins, History, PackageCheck, Receipt, ReceiptText, RotateCcw, Scale, Truck, Users, WalletCards } from "lucide-react";
import { reportCompanyExtra } from "@/features/company-extra/queries";
import { OTHER_VENDORS } from "@/config/vendors";
import { flowOf, flowPath } from "@/features/purchasing/flow";
import { readContributors } from "@/features/payments/contributors";
import { loadUnpaidBills } from "@/features/purchasing/queries";
import { formatPaisa, toDbAmount, toPaisa } from "@/lib/utils/money";
import { ledgerChecks } from "../checks";
import type { ReportDefinition, ReportRow, ReportTable } from "../model";
import { loadCompanyEntries, reportCompany, reportPayablesAging, reportPurchaseLines, reportPurchases, reportSupplierDelivery, reportSupplierPayments, reportSuppliers } from "../queries";
import { bucketBi } from "../values";
import { bi, biKey, can, col, daysFrom, hint, lg, name, payableKeys, principalOf, PURCHASE_GROUP, reversal, sourceFilters, sumOf, supplierFilter, title, total, when, xl, xxl, ZERO, type ReportInput } from "./shared";

const AP = ["AP_PRINCIPAL", "AP_SUPPLIERS"];
/** The ledger side of purchases and payments, for those who see every account. */
const apCheck = (input: ReportInput, key: "purchases" | "supplierPayments" | "supplierReturns", report: bigint, sources: string[], keys: string[], debit = false) =>
  ({ label: bi((t) => t.analytics.checks[key]), report, keys, sources, from: input.period.from, to: input.period.to, debit });

/** No link to a screen that is hidden. */
const receiptHref = (principal: boolean, id: string) => (principal || OTHER_VENDORS ? flowPath(flowOf(principal), "receipts", id) : null);
type Payments = Awaited<ReturnType<typeof reportSupplierPayments>>;
const paymentTable = (rows: Payments, oneSupplier: boolean): ReportTable => ({
  key: "payments", title: title(oneSupplier ? "companyPayments" : "supplierPayments"), search: ["no", "supplier", "reference"],
  rows: rows.map((x): ReportRow => ({
    id: x.entry_id, no: x.doc_no, reversal: reversal(x.is_reversal), date: x.entry_date, supplier: name(x.supplier, x.supplier_ur), method: biKey((t) => t.purchasing.methods, x.method), reference: x.reference, account: x.account, amount: x.amount, settled: x.settled, onAccount: x.on_account,
  })),
  columns: [
    col("no", (t) => t.documents.number, "link", { sub: "reversal", subLabel: bi((t) => t.accounting.reversal), primary: true }), col("date", (t) => t.documents.date, "date"), ...when(!oneSupplier, col("supplier", (t) => t.documents.supplier, "text")),
    col("method", (t) => t.receivables.method, "text", { sub: "reference", subLabel: bi((t) => t.receivables.reference), hideBelow: "lg" }), col("account", (t) => t.expenses.paidFrom, "text", xl), col("amount", (t) => t.receivables.amount, "money", total),
    col("settled", (t) => t.purchasing.allocated, "money", { ...lg, total: true }), col("onAccount", (t) => t.purchasing.onAccount, "money", { ...xl, total: true }),
  ],
});

type Lines = Awaited<ReturnType<typeof reportPurchaseLines>>;
const lineTable = (rows: Lines, oneSupplier: boolean, key: "goods" | "history" = "history"): ReportTable => ({
  key: "lines", title: title(oneSupplier && key === "goods" ? "companyGoods" : "purchaseHistory"), search: ["no", "order", "supplier", "name", "sku"],
  rows: rows.map((x): ReportRow => ({
    id: x.line_id, no: x.doc_no, noHref: receiptHref(x.is_principal, x.receipt_id), order: x.order_no, date: x.receipt_date, supplier: name(x.supplier, x.supplier_ur), name: name(x.name_en, x.name_ur), sku: x.sku, unit: name(x.unit_en, x.unit_ur),
    accepted: x.accepted, damaged: x.damaged, rejected: x.rejected, cost: x.unit_cost, total: x.total,
  })),
  columns: [
    col("no", (t) => t.purchasing.receipt, "link", { sub: "order", subLabel: bi((t) => t.purchasing.order), primary: true }), col("date", (t) => t.documents.date, "date"), ...when(!oneSupplier, col("supplier", (t) => t.documents.supplier, "text", lg)),
    col("name", (t) => t.documents.product, "text", { sub: "sku", subLabel: bi((t) => t.catalog.sku) }), col("accepted", (t) => t.purchasing.accepted, "quantity", { sub: "unit", subLabel: bi((t) => t.documents.unit) }), col("damaged", (t) => t.purchasing.damaged, "quantity", xl),
    col("rejected", (t) => t.purchasing.rejected, "quantity", xxl), col("cost", (t) => t.documents.unitCost, "money", lg), col("total", (t) => t.documents.lineTotal, "money", total),
  ],
});
const goodsFigures = (rows: Lines) => [
  { key: "value", label: bi((t) => t.analytics.purchaseValue), value: { money: sumOf(rows.map((x) => x.total)) }, icon: Receipt }, { key: "receipts", label: bi((t) => t.analytics.receipts), value: { count: new Set(rows.map((x) => x.receipt_id)).size }, icon: PackageCheck },
];

const aging = (scope: "all" | "company"): ReportDefinition => {
  const company = scope === "company";
  return {
    slug: company ? "company-dues" : "payables-aging", group: company ? "company" : "finance", title: title(company ? "companyDues" : "payablesAging"), hint: hint(company ? "companyDues" : "payablesAging"), icon: company ? WalletCards : Scale,
    permissions: company ? ["company.view"] : ["payables.view", "company.view"], dates: "day",
    filters: (ctx) => (company || payableKeys(ctx).length < 2 ? [] : sourceFilters()),
    async load(input) {
      const { ctx, day } = input;
      const principal = company ? true : principalOf(input.filter("source"));
      const [rows, unpaid] = await Promise.all([reportPayablesAging(day, principal), company && day === input.today ? loadUnpaidBills("company") : []]);
      const ages = ["days_30", "days_60", "days_90", "older"] as const;
      const balance = sumOf(rows.map((x) => x.balance));
      return {
        figures: [
          { key: "balance", label: bi((t) => (company ? t.analytics.owedToCompany : t.analytics.owedToSuppliers)), value: { money: balance }, icon: WalletCards }, { key: "overdue", label: bi((t) => t.receivables.overdue), value: { money: sumOf(rows.map((x) => x.overdue)) }, icon: Clock3 },
          ...when(company && unpaid.length > 0, { key: "bills", label: bi((t) => t.purchasing.unpaidBills), value: { count: unpaid.length }, icon: ReceiptText }),
        ],
        charts: rows.length ? [{
          key: "ages", type: "columns", title: bi((t) => t.analytics.charts.ages), hint: bi((t) => t.analytics.notes.payablesAging), category: bi((t) => t.analytics.age), series: [{ key: "amount", label: bi((t) => t.payables.closing) }],
          points: ages.map((k) => ({ label: bi((t) => t.receivables.ages[k]), values: [sumOf(rows.map((x) => x[k]))] })),
        }] : [],
        tables: [
          {
            key: "aging", title: title(company ? "companyDues" : "payablesAging"), search: ["name", "code", "phone"], empty: bi((t) => t.analytics.nothingOwed),
            rows: rows.map((x): ReportRow => ({
              id: x.supplier_id, name: name(x.name, x.name_ur), nameHref: x.is_principal ? flowPath("company", "account") : OTHER_VENDORS ? `${flowPath("suppliers", "account")}?supplier=${x.supplier_id}` : null, code: x.code, phone: x.phone, a: x.days_30, b: x.days_60, c: x.days_90, o: x.older, advance: x.advance,
              balance: x.balance, overdue: x.overdue, last: x.last_payment,
            })),
            columns: [
              col("name", (t) => t.documents.supplier, "link", { sub: "code", subLabel: bi((t) => t.suppliers.code), primary: true }), col("phone", (t) => t.suppliers.phone, "code", { ...xxl, screenOnly: true }), col("a", (t) => t.receivables.ages.days_30, "money", { ...lg, total: true }),
              col("b", (t) => t.receivables.ages.days_60, "money", { ...lg, total: true }), col("c", (t) => t.receivables.ages.days_90, "money", { ...xl, total: true }), col("o", (t) => t.receivables.ages.older, "money", { ...xl, total: true }),
              col("advance", (t) => t.analytics.paidInAdvance, "money", { ...xxl, total: true }), col("balance", (t) => t.payables.closing, "money", total), col("overdue", (t) => t.receivables.overdue, "money", { ...xl, total: true }), col("last", (t) => t.customers.lastPayment, "date", xxl),
            ],
          },
          ...when(unpaid.length > 0, {
            key: "bills", title: bi((t) => t.purchasing.unpaidBills), search: ["no", "bill"],
            rows: unpaid.map((x): ReportRow => {
              const late = x.due_date ? daysFrom(x.due_date, input.today) : 0;
              return { id: x.supplier_invoice_id ?? "", no: x.doc_no, noHref: flowPath("company", "bills", x.supplier_invoice_id ?? ""), bill: x.invoice_number, date: x.invoice_date, due: x.due_date, late: late > 0 ? late : null, amount: x.amount, paid: x.paid_amount, left: x.outstanding };
            }),
            columns: [
              col("no", (t) => t.documents.number, "link", { sub: "bill", subLabel: bi((t) => t.purchasing.billNumber), primary: true }), col("date", (t) => t.documents.date, "date"), col("due", (t) => t.analytics.dueDate, "date", lg), col("late", (t) => t.analytics.daysLate, "quantity"),
              col("amount", (t) => t.receivables.amount, "money", { ...lg, total: true }), col("paid", (t) => t.purchasing.paid, "money", { ...lg, total: true }), col("left", (t) => t.purchasing.outstanding, "money", total),
            ],
          } satisfies ReportTable),
        ],
        checks: await ledgerChecks(input, [{ label: bi((t) => t.analytics.checks[company ? "company" : "payables"]), report: balance, keys: company ? ["AP_PRINCIPAL"] : payableKeys(ctx), from: null, to: day }]),
        notes: [bi((t) => t.analytics.notes.payablesAging)],
      };
    },
  };
};

const delivery: ReportDefinition = {
  slug: "delivery-performance", group: PURCHASE_GROUP, title: title("deliveryPerformance"), hint: hint("deliveryPerformance"), icon: Truck, permissions: ["purchasing.view"], dates: "period",
  filters: () => sourceFilters(),
  async load({ period, filter }) {
    const rows = await reportSupplierDelivery(period, principalOf(filter("source")));
    const sum = (pick: (x: (typeof rows)[number]) => number) => rows.reduce((n, x) => n + pick(x), 0);
    const dated = sum((x) => x.dated_orders);
    return {
      figures: [
        { key: "orders", label: bi((t) => t.purchasing.tabs.orders), value: { count: sum((x) => x.orders) }, icon: Receipt },
        { key: "time", label: bi((t) => t.analytics.onTime), value: { text: dated ? `${Math.round((sum((x) => x.on_time) * 1000) / dated) / 10}%` : "—" }, icon: Clock3 },
        { key: "late", label: bi((t) => t.analytics.late), value: { count: sum((x) => x.late) }, icon: Truck, attention: sum((x) => x.late) > 0 },
      ],
      tables: [{
        key: "delivery", title: title("deliveryPerformance"), search: ["name", "code"],
        rows: rows.map((x): ReportRow => ({
          id: x.supplier_id, name: name(x.name, x.name_ur), code: x.code, orders: x.orders, completed: x.completed, onTime: x.on_time, late: x.late, daysLate: x.days_late, lead: x.lead_days, ordered: x.ordered, accepted: x.accepted, damaged: x.damaged, rejected: x.rejected, fill: x.fill_percent,
        })),
        columns: [
          col("name", (t) => t.documents.supplier, "text", { sub: "code", subLabel: bi((t) => t.suppliers.code), primary: true }), col("orders", (t) => t.purchasing.tabs.orders, "quantity", total), col("completed", (t) => t.analytics.completed, "quantity", { ...lg, total: true }),
          col("onTime", (t) => t.analytics.onTime, "quantity", total), col("late", (t) => t.analytics.late, "quantity", total), col("daysLate", (t) => t.analytics.averageDaysLate, "decimal", xxl), col("lead", (t) => t.analytics.leadDays, "decimal", lg),
          col("ordered", (t) => t.purchasing.ordered, "quantity", { ...xxl, total: true }), col("accepted", (t) => t.purchasing.accepted, "quantity", { ...xl, total: true }), col("damaged", (t) => t.purchasing.damaged, "quantity", { ...xxl, total: true }),
          col("rejected", (t) => t.purchasing.rejected, "quantity", { ...xxl, total: true }), col("fill", (t) => t.analytics.fillRate, "percent"),
        ],
      }],
      notes: [bi((t) => t.analytics.notes.delivery)],
    };
  },
};

/** The Ayra company's account month by month: the reports of purchase value, returns, adjustments and dues read it. */
const account: ReportDefinition = {
  slug: "company-account", group: "company", title: title("companyAccount"), hint: hint("companyAccount"), icon: Building2, permissions: ["company.view"], dates: "period",
  async load(input) {
    const rows = await reportCompany(input.period);
    const first = rows[0];
    const last = rows.at(-1);
    const sum = (key: "goods" | "adjustments" | "returns" | "payments" | "other") => sumOf(rows.map((x) => x[key]));
    return {
      figures: [
        { key: "goods", label: bi((t) => t.analytics.purchaseValue), value: { money: sum("goods") }, icon: PackageCheck }, { key: "payments", label: bi((t) => t.payables.payments), value: { money: sum("payments") }, icon: Banknote },
        { key: "returns", label: bi((t) => t.payables.returns), value: { money: sum("returns") }, icon: RotateCcw }, { key: "dues", label: bi((t) => t.analytics.owedToCompany), value: { money: toPaisa(last?.closing ?? 0) }, icon: WalletCards },
      ],
      charts: rows.length > 1 ? [{
        key: "account", type: "columns", title: bi((t) => t.analytics.charts.companyAccount), hint: hint("companyAccount"), category: bi((t) => t.reports.salesPeriod), series: [{ key: "goods", label: bi((t) => t.analytics.purchaseValue) }, { key: "payments", label: bi((t) => t.payables.payments) }],
        points: rows.map((x) => ({ label: bucketBi(x.month, "month"), values: [toPaisa(x.goods), toPaisa(x.payments)] })),
      }] : [],
      tables: [{
        key: "account", title: title("companyAccount"),
        rows: rows.map((x): ReportRow => ({ id: x.month, month: bucketBi(x.month, "month"), opening: x.opening, receipts: x.receipts, goods: x.goods, adjustments: x.adjustments, returns: x.returns, payments: x.payments, other: x.other, closing: x.closing })),
        columns: [
          col("month", (t) => t.reports.salesPeriod, "text", { primary: true }), col("opening", (t) => t.payables.opening, "money", lg), col("receipts", (t) => t.analytics.receipts, "quantity", { ...xl, total: true }), col("goods", (t) => t.analytics.purchaseValue, "money", total),
          col("adjustments", (t) => t.payables.differences, "money", { ...lg, total: true }), col("returns", (t) => t.payables.returns, "money", { ...lg, total: true }), col("payments", (t) => t.payables.payments, "money", total), col("other", (t) => t.payables.other, "money", { ...xl, total: true }),
          col("closing", (t) => t.payables.closing, "money"),
        ],
      }],
      checks: await ledgerChecks(input, [
        { label: bi((t) => t.analytics.checks.companyOpening), report: toPaisa(first?.opening ?? 0), keys: ["AP_PRINCIPAL"], from: null, to: new Date(Date.parse(`${input.period.from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) },
        { label: bi((t) => t.analytics.checks.companyMovement), report: sum("goods") + sum("adjustments") - sum("returns") - sum("payments") + sum("other"), keys: ["AP_PRINCIPAL"], from: input.period.from, to: input.period.to },
        { label: bi((t) => t.analytics.checks.company), report: toPaisa(last?.closing ?? 0), keys: ["AP_PRINCIPAL"], from: null, to: input.period.to },
      ]),
    };
  },
};

const KNOWN = new Set(["goods_receipt", "supplier_payment", "supplier_return"]);
/** Entries of one kind in the company's account: returns reduce it, adjustments go either way. */
const entries = (kind: "returns" | "adjustments"): ReportDefinition => ({
  slug: `company-${kind}`, group: "company", title: title(kind === "returns" ? "companyReturns" : "companyAdjustments"), hint: hint(kind === "returns" ? "companyReturns" : "companyAdjustments"), icon: kind === "returns" ? RotateCcw : ArrowLeftRight, permissions: ["company.view"], dates: "period",
  async load(input) {
    const rows = (await loadCompanyEntries(input.period)).filter((x) => (kind === "returns" ? x.source_type === "supplier_return" : !KNOWN.has(x.source_type ?? "")));
    const of = (x: (typeof rows)[number]) => { const net = toPaisa(x.credit ?? 0) - toPaisa(x.debit ?? 0); return kind === "returns" ? -net : net; };
    const amount = rows.reduce((sum, x) => sum + of(x), ZERO);
    const others = kind === "returns" ? ["supplier_return"] : [...new Set(rows.map((x) => x.source_type ?? ""))];
    return {
      figures: [{ key: "amount", label: title(kind === "returns" ? "companyReturns" : "companyAdjustments"), value: { money: amount }, icon: kind === "returns" ? RotateCcw : ArrowLeftRight }, { key: "count", label: bi((t) => t.analytics.entries), value: { count: rows.length }, icon: ReceiptText }],
      tables: [{
        key: "entries", title: title(kind === "returns" ? "companyReturns" : "companyAdjustments"), search: ["no", "type", "description"],
        rows: rows.map((x, i): ReportRow => ({
          id: `${x.doc_no}-${i}`, no: x.doc_no, noHref: kind === "returns" && x.source_id ? flowPath("company", "returns", x.source_id) : null, date: x.entry_date, type: biKey((t) => t.accounting.sources, x.source_type ?? "manual"), description: x.entry_description, amount: toDbAmount(of(x)),
        })),
        columns: [col("no", (t) => t.accounting.entry, "link", { primary: true }), col("date", (t) => t.documents.date, "date"), col("type", (t) => t.accounting.document, "text"), col("description", (t) => t.accounting.description, "text", lg), col("amount", (t) => t.receivables.amount, "money", total)],
      }],
      checks: await ledgerChecks(input, [others.length > 0 && { label: bi((t) => t.analytics.checks[kind === "returns" ? "supplierReturns" : "companyAdjustments"]), report: amount, keys: ["AP_PRINCIPAL"], sources: others, from: input.period.from, to: input.period.to, debit: kind === "returns" }]),
      notes: kind === "adjustments" ? [bi((t) => t.analytics.notes.adjustments)] : [],
    };
  },
});

/** Reports that compare vendors with one another; with Ayra alone its own reports say the same. */
const VENDOR_ONLY = new Set(["supplier-payments", "suppliers"]);
const all: ReportDefinition[] = [
  {
    slug: "purchases", group: PURCHASE_GROUP, title: bi((t) => t.reports.purchases), hint: bi((t) => t.reports.purchasesHint), icon: Receipt, permissions: ["purchasing.view"], dates: "period",
    filters: async (ctx) => [...sourceFilters(), ...(await supplierFilter(ctx))],
    async load(input) {
      const { ctx } = input;
      const rows = await reportPurchases(input.period, input.filter("supplier"), principalOf(input.filter("source")));
      const account = can(ctx, "payables.view") || can(ctx, "company.view");
      const cost = sumOf(rows.map((x) => x.total_cost));
      const bySupplier = [...Map.groupBy(rows, (x) => x.supplier_en).values()].map((list) => ({ en: list[0]?.supplier_en ?? "", ur: list[0]?.supplier_ur, value: sumOf(list.map((x) => x.total_cost)) })).toSorted((a, b) => (a.value < b.value ? 1 : -1));
      return {
        figures: [{ key: "value", label: bi((t) => t.analytics.purchaseValue), value: { money: cost }, icon: Receipt }, { key: "receipts", label: bi((t) => t.analytics.receipts), value: { count: rows.length }, icon: PackageCheck }],
        charts: bySupplier.length > 1 ? [{
          key: "suppliers", type: "bars", title: bi((t) => t.analytics.charts.purchasesBySupplier), hint: bi((t) => t.reports.purchasesHint), category: bi((t) => t.documents.supplier), series: [{ key: "value", label: bi((t) => t.analytics.purchaseValue) }],
          points: bySupplier.slice(0, 10).map((x) => ({ label: { en: x.en, ur: x.ur ?? x.en }, values: [x.value] })),
        }] : [],
        tables: [{
          key: "purchases", title: bi((t) => t.reports.purchases), search: ["no", "order", "supplier", "bill"],
          rows: rows.map((x): ReportRow => ({
            id: x.goods_receipt_id, no: x.doc_no, noHref: receiptHref(x.is_principal, x.goods_receipt_id), order: x.order_no, date: x.receipt_date, supplier: name(x.supplier_en, x.supplier_ur), ordered: x.ordered_base, received: x.received_base, accepted: x.accepted_base,
            damaged: x.damaged_base, rejected: x.rejected_base, cost: x.total_cost, bill: x.invoice_no, paid: x.paid_amount, remaining: x.remaining,
          })),
          columns: [
            col("no", (t) => t.purchasing.receipt, "link", { sub: "order", subLabel: bi((t) => t.purchasing.order), primary: true }), col("date", (t) => t.documents.date, "date"), ...when(OTHER_VENDORS, col("supplier", (t) => t.documents.supplier, "text")), col("ordered", (t) => t.purchasing.ordered, "quantity", { ...xxl, screenOnly: true }),
            col("received", (t) => t.purchasing.received, "quantity", { ...xl, total: true }), col("accepted", (t) => t.purchasing.accepted, "quantity", { ...lg, total: true }), col("damaged", (t) => t.purchasing.damaged, "quantity", { ...lg, total: true }),
            col("rejected", (t) => t.purchasing.rejected, "quantity", { ...xxl, total: true }), col("cost", (t) => t.catalog.purchaseCost, "money", total), col("bill", (t) => t.purchasing.billNumber, "code", { ...xxl, screenOnly: true }),
            ...when(account, col("paid", (t) => t.purchasing.paid, "money", { ...lg, total: true }), col("remaining", (t) => t.purchasing.outstanding, "money", total)),
          ],
        }],
        checks: await ledgerChecks(input, [apCheck(input, "purchases", cost, ["goods_receipt"], AP)]),
        notes: [bi((t) => t.analytics.notes.purchases)],
      };
    },
  },
  {
    slug: "supplier-payments", group: PURCHASE_GROUP, title: title("supplierPayments"), hint: hint("supplierPayments"), icon: Banknote, permissions: ["payables.view", "company.view"], dates: "period",
    filters: async (ctx) => [...when(payableKeys(ctx).length === 2, ...sourceFilters()), ...(await supplierFilter(ctx))],
    async load(input) {
      const rows = await reportSupplierPayments(input.period, input.filter("supplier"), principalOf(input.filter("source")));
      const amount = sumOf(rows.map((x) => x.amount));
      return {
        figures: [{ key: "paid", label: bi((t) => t.payables.payments), value: { money: amount }, icon: Banknote }, { key: "count", label: bi((t) => t.analytics.paymentCount), value: { count: rows.filter((x) => !x.is_reversal).length }, icon: ReceiptText }],
        tables: [paymentTable(rows, false)],
        checks: await ledgerChecks(input, [apCheck(input, "supplierPayments", amount, ["supplier_payment"], payableKeys(input.ctx), true)]),
        notes: [bi((t) => t.analytics.notes.reversals)],
      };
    },
  },
  {
    slug: "suppliers", group: PURCHASE_GROUP, title: bi((t) => t.reports.suppliers), hint: bi((t) => t.reports.suppliersHint), icon: Users, permissions: ["payables.view", "company.view"], dates: "period",
    async load(input) {
      const { ctx } = input;
      const rows = await reportSuppliers(input.period);
      const closing = sumOf(rows.map((x) => x.closing));
      const owed = rows.filter((x) => x.closing > 0).toSorted((a, b) => b.closing - a.closing);
      return {
        figures: [{ key: "closing", label: bi((t) => t.analytics.owedToSuppliers), value: { money: closing }, icon: WalletCards }, { key: "payments", label: bi((t) => t.payables.payments), value: { money: sumOf(rows.map((x) => x.payments)) }, icon: Banknote }],
        charts: owed.length > 1 ? [{
          key: "owed", type: "bars", title: bi((t) => t.payables.closing), hint: bi((t) => t.reports.suppliersHint), category: bi((t) => t.documents.supplier), series: [{ key: "closing", label: bi((t) => t.payables.closing) }],
          points: owed.slice(0, 10).map((x) => ({ label: { en: x.name, ur: x.name_ur ?? x.name }, values: [toPaisa(x.closing)] })),
        }] : [],
        tables: [{
          key: "suppliers", title: bi((t) => t.reports.suppliers), search: ["name", "code"],
          rows: rows.map((r): ReportRow => ({
            id: r.supplier_id, name: name(r.name, r.name_ur), nameHref: r.is_principal ? flowPath("company", "account") : `${flowPath("suppliers", "account")}?supplier=${r.supplier_id}`, code: r.code, opening: r.opening, purchases: r.purchases, differences: r.bill_differences, returns: r.returns,
            payments: r.payments, other: r.other, closing: r.closing, open: r.open_orders,
          })),
          columns: [
            col("name", (t) => t.documents.supplier, "link", { sub: "code", subLabel: bi((t) => t.suppliers.code), primary: true }), col("opening", (t) => t.payables.opening, "money", total), col("purchases", (t) => t.payables.purchases, "money", total),
            col("differences", (t) => t.payables.differences, "money", { ...xl, total: true }), col("returns", (t) => t.payables.returns, "money", { ...lg, total: true }), col("payments", (t) => t.payables.payments, "money", total), col("other", (t) => t.payables.other, "money", { ...xl, total: true }),
            col("closing", (t) => t.payables.closing, "money", total), ...when(can(ctx, "purchasing.view"), col("open", (t) => t.payables.openOrders, "money", { ...xl, total: true })),
          ],
        }],
        checks: await ledgerChecks(input, [{ label: bi((t) => t.analytics.checks.payables), report: closing, keys: payableKeys(ctx), from: null, to: input.period.to }]),
      };
    },
  },
  delivery,
  {
    slug: "purchase-history", group: PURCHASE_GROUP, title: title("purchaseHistory"), hint: hint("purchaseHistory"), icon: History, permissions: ["purchasing.view"], dates: "period",
    filters: async (ctx) => [...sourceFilters(), ...(await supplierFilter(ctx))],
    async load(input) {
      const rows = await reportPurchaseLines(input.period, input.filter("supplier"), principalOf(input.filter("source")));
      return { figures: goodsFigures(rows), tables: [lineTable(rows, !OTHER_VENDORS)], checks: await ledgerChecks(input, [apCheck(input, "purchases", sumOf(rows.map((x) => x.total)), ["goods_receipt"], AP)]) };
    },
  },
  {
    slug: "company-goods", group: "company", title: title("companyGoods"), hint: hint("companyGoods"), icon: PackageCheck, permissions: ["purchasing.view"], dates: "period",
    async load(input) {
      const rows = await reportPurchaseLines(input.period, null, true);
      return { figures: goodsFigures(rows), tables: [lineTable(rows, true, "goods")], checks: await ledgerChecks(input, [apCheck(input, "purchases", sumOf(rows.map((x) => x.total)), ["goods_receipt"], ["AP_PRINCIPAL"])]) };
    },
  },
  account,
  {
    slug: "company-payments", group: "company", title: title("companyPayments"), hint: hint("companyPayments"), icon: Banknote, permissions: ["company.view"], dates: "period",
    async load(input) {
      const rows = await reportSupplierPayments(input.period, null, true);
      const amount = sumOf(rows.map((x) => x.amount));
      return {
        figures: [{ key: "paid", label: bi((t) => t.payables.payments), value: { money: amount }, icon: Banknote }, { key: "count", label: bi((t) => t.analytics.paymentCount), value: { count: rows.filter((x) => !x.is_reversal).length }, icon: ReceiptText }],
        tables: [paymentTable(rows, true)], checks: await ledgerChecks(input, [apCheck(input, "supplierPayments", amount, ["supplier_payment"], ["AP_PRINCIPAL"], true)]), notes: [bi((t) => t.analytics.notes.reversals)],
      };
    },
  },
  {
    slug: "company-extra", group: "company", title: bi((t) => t.supply.extra.title), hint: bi((t) => t.supply.extra.reportHint), icon: HandCoins, permissions: ["company.view"], dates: "period",
    async load(input) {
      const rows = await reportCompanyExtra(input.period);
      const received = sumOf(rows.filter((x) => x.direction === "in").map((x) => x.amount));
      const extra = sumOf(rows.filter((x) => x.direction === "out" && x.kind === "extra").map((x) => x.amount));
      const owed = sumOf(rows.filter((x) => x.direction === "out" && x.kind === "account").map((x) => x.amount));
      const paidOut = sumOf(rows.filter((x) => x.direction === "out").map((x) => x.amount));
      // Where more than one person paid or received: each with their share, in place of the one account.
      const people = (value: unknown) => readContributors(value).map((c) => `${c.name} (${formatPaisa(toPaisa(c.amount)).replace(/^Rs /, "")})`).join(", ") || null;
      return {
        figures: [
          { key: "received", label: bi((t) => t.supply.extra.received), value: { money: received }, icon: HandCoins }, { key: "extra", label: bi((t) => t.supply.extra.extraTotal), value: { money: extra }, icon: Banknote }, { key: "account", label: bi((t) => t.supply.extra.accountTotal), value: { money: owed }, icon: WalletCards },
        ],
        tables: [{
          key: "payments", title: bi((t) => t.supply.extra.title), search: ["name", "no", "reference", "notes", "account"], empty: bi((t) => t.supply.extra.empty),
          rows: rows.map((x): ReportRow => ({ id: `${x.payment_id}-${x.entry_date}`, name: x.name, no: x.doc_no, date: x.entry_date, type: x.direction === "in" ? bi((t) => t.supply.extra.inLabel) : bi((t) => (x.kind === "account" ? t.supply.extra.accountTotal : t.supply.extra.extraTotal)), account: people(x.contributors) ?? x.account, method: biKey((t) => t.purchasing.methods, x.method), reference: x.reference, notes: x.notes, amount: x.amount })),
          columns: [
            col("name", (t) => t.supply.extra.name, "text", { sub: "no", subLabel: bi((t) => t.documents.number), primary: true }), col("date", (t) => t.documents.date, "date"), col("type", (t) => t.supply.extra.kind, "text", lg),
            col("account", (t) => t.accounting.account, "text", { sub: "method", subLabel: bi((t) => t.supply.extra.method), hideBelow: "lg" }), col("reference", (t) => t.supply.extra.reference, "text", xxl), col("notes", (t) => t.supply.extra.notes, "text", { ...xxl, screenOnly: true }), col("amount", (t) => t.supply.extra.amount, "money", total),
          ],
        }],
        checks: await ledgerChecks(input, [
          { label: bi((t) => t.supply.extra.check), report: paidOut, keys: ["AYRA_EXTRA", "AP_PRINCIPAL"], sources: ["company_extra"], from: input.period.from, to: input.period.to, debit: true },
          { label: bi((t) => t.supply.extra.checkIn), report: received, keys: ["CAPITAL"], sources: ["company_extra"], from: input.period.from, to: input.period.to, debit: false },
        ]),
        notes: [bi((t) => t.analytics.notes.reversals)],
      };
    },
  },
  entries("returns"),
  entries("adjustments"),
  aging("company"),
  aging("all"),
];
export const purchasingReports: ReportDefinition[] = all.filter((r) => OTHER_VENDORS || !VENDOR_ONLY.has(r.slug));
