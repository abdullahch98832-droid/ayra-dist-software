import "server-only";
import { ArrowLeftRight, CalendarDays, CalendarRange, Landmark, PieChart, ReceiptText, TrendingUp } from "lucide-react";
import { loadCashFlow, loadIncomeStatement } from "@/features/accounting/queries";
import { loadBankAccounts, loadBankReconciliation, loadBankReconciliations, reportCashAccounts } from "@/features/cash-bank/queries";
import { sumPaisa, toDbAmount, toPaisa } from "@/lib/utils/money";
import { ledgerChecks } from "../checks";
import type { ReportDefinition, ReportRow, ReportTable, StatementPart } from "../model";
import { reportExpenseAccounts, reportProfitAndLoss } from "../queries";
import { bucketBi, statusOptions } from "../values";
import { bi, biKey, col, hint, lg, name, sumOf, title, total, xl, xxl, ZERO } from "./shared";

const FINANCIAL = ["reports.financial"] as const;

const profitOver = (bucket: "day" | "month"): ReportDefinition => ({
  slug: bucket === "day" ? "daily-profit" : "monthly-profit", group: "finance", title: title(bucket === "day" ? "dailyProfit" : "monthlyProfit"), hint: hint(bucket === "day" ? "dailyProfit" : "monthlyProfit"), icon: bucket === "day" ? CalendarDays : CalendarRange, permissions: FINANCIAL, dates: "period",
  async load(input) {
    const { period } = input;
    const [rows, statement] = await Promise.all([reportProfitAndLoss(period, bucket), loadIncomeStatement(period.from, period.to)]);
    const sum = (key: "net_sales" | "cost_of_sales" | "gross_profit" | "other_income" | "expenses" | "net_profit") => sumOf(rows.map((x) => x[key]));
    const part = (section: string) => sumOf(statement.filter((x) => x.section === section).map((x) => x.amount));
    const net = sum("net_profit");
    return {
      figures: [
        { key: "sales", label: bi((t) => t.accounting.sales), value: { money: sum("net_sales") }, icon: ReceiptText }, { key: "gross", label: bi((t) => t.accounting.grossProfit), value: { money: sum("gross_profit") }, icon: TrendingUp },
        { key: "expenses", label: bi((t) => t.accounting.expenses), value: { money: sum("expenses") }, icon: PieChart }, { key: "net", label: bi((t) => (net < ZERO ? t.accounting.netLoss : t.accounting.netProfit)), value: { money: net }, icon: TrendingUp, attention: net < ZERO },
      ],
      charts: rows.length > 1 ? [{
        key: "profit", type: "columns", title: bi((t) => t.accounting.netProfit), hint: bi((t) => t.analytics.notes.profit), category: bi((t) => (bucket === "day" ? t.documents.date : t.reports.salesPeriod)), series: [{ key: "gross", label: bi((t) => t.accounting.grossProfit) }, { key: "net", label: bi((t) => t.accounting.netProfit) }],
        points: rows.toReversed().map((x) => ({ label: bucketBi(x.period, bucket), values: [toPaisa(x.gross_profit), toPaisa(x.net_profit)] })),
      }] : [],
      tables: [{
        key: "profit", title: title(bucket === "day" ? "dailyProfit" : "monthlyProfit"),
        rows: rows.map((x): ReportRow => ({ id: x.period, date: x.period, period: bucketBi(x.period, "month"), sales: x.sales, returns: x.returns, net: x.net_sales, cost: x.cost_of_sales, gross: x.gross_profit, other: x.other_income, expenses: x.expenses, profit: x.net_profit })),
        columns: [
          bucket === "day" ? col("date", (t) => t.documents.date, "date", { primary: true }) : col("period", (t) => t.reports.salesPeriod, "text", { primary: true }), col("sales", (t) => t.analytics.salesBeforeReturns, "money", { ...xxl, total: true }), col("returns", (t) => t.reports.returns, "money", { ...xxl, total: true }),
          col("net", (t) => t.accounting.sales, "money", total), col("cost", (t) => t.accounting.costOfSales, "money", { ...lg, total: true }), col("gross", (t) => t.accounting.grossProfit, "money", { ...lg, total: true }), col("other", (t) => t.accounting.otherIncome, "money", { ...xxl, total: true }),
          col("expenses", (t) => t.accounting.expenses, "money", { ...lg, total: true }), col("profit", (t) => t.accounting.netProfit, "money", total),
        ],
      }],
      checks: [
        ...(await ledgerChecks(input, [{ label: bi((t) => t.analytics.checks.netProfit), report: net, keys: ["type:income", "type:expense"], from: period.from, to: period.to }])),
        { label: bi((t) => t.analytics.checks.incomeStatement), report: net, other: ZERO, ledger: part("sales") - part("cost") + part("other_income") - part("expense") },
      ],
      notes: [bi((t) => t.analytics.notes.profit)],
    };
  },
});

/** Parties first, then the single accounts by their code. */
const ORDER = ["customers", "company", "suppliers", "salaries", "advances"];

export const financeReports: ReportDefinition[] = [
  profitOver("day"),
  profitOver("month"),
  {
    slug: "cash-flow", group: "finance", title: title("cashFlow"), hint: hint("cashFlow"), icon: ArrowLeftRight, permissions: FINANCIAL, dates: "period",
    async load({ period }) {
      const [rows, accounts] = await Promise.all([loadCashFlow(period.from, period.to), reportCashAccounts(period.from, period.to).catch(() => null)]);
      const place = (line: string) => (ORDER.indexOf(line) < 0 ? ORDER.length : ORDER.indexOf(line));
      const sorted = rows.toSorted((x, y) => place(x.line) - place(y.line) || (x.code ?? "").localeCompare(y.code ?? ""));
      const of = (s: string) => sorted.filter((r) => r.section === s).map((r) => ({ key: `${r.line}-${r.code ?? ""}`, label: r.name_en ? name(r.name_en, r.name_ur) : biKey((t) => t.accounting.cashLines, r.line), code: r.code, amount: toPaisa(r.amount) }));
      const add = (list: { amount: bigint }[]) => sumPaisa(list.map((r) => r.amount));
      const one = (s: string) => toPaisa(rows.find((r) => r.section === s)?.amount ?? 0);
      const parts = (["operating", "investing", "financing"] as const).map((key) => ({ key, rows: of(key) }));
      const opened = add(of("opening_balances"));
      const change = parts.reduce((sum, p) => sum + add(p.rows), ZERO);
      const statement: StatementPart[] = [
        { key: "opening", rows: [], total: { label: bi((t) => t.accounting.cashStart), amount: one("opening") }, strong: true },
        ...(opened !== ZERO ? [{ key: "opened", rows: [], total: { label: bi((t) => t.accounting.openingBalances), amount: opened } }] : []),
        ...parts.map((p) => ({ key: p.key, title: p.rows.length ? bi((t) => t.accounting[p.key]) : undefined, rows: p.rows, total: { label: bi((t) => t.accounting[p.key]), amount: add(p.rows) } })),
        { key: "change", rows: [], total: { label: bi((t) => t.accounting.netChange), amount: change } },
        { key: "closing", rows: [], total: { label: bi((t) => t.accounting.cashEnd), amount: one("closing") }, strong: true },
      ];
      return {
        statement, tables: [],
        checks: [
          { label: bi((t) => t.analytics.checks.cashFlow), report: one("opening") + opened + change, other: ZERO, ledger: one("closing") },
          ...(accounts ? [{ label: bi((t) => t.analytics.checks.cashAccounts), report: sumOf(accounts.map((a) => a.closing)), other: ZERO, ledger: one("closing") }] : []),
        ],
      };
    },
  },
  {
    slug: "expense-breakdown", group: "finance", title: title("expenseBreakdown"), hint: hint("expenseBreakdown"), icon: PieChart, permissions: FINANCIAL, dates: "period",
    async load({ period }) {
      const [rows, statement] = await Promise.all([reportExpenseAccounts(period), loadIncomeStatement(period.from, period.to)]);
      const amount = sumOf(rows.map((x) => x.amount));
      const previous = sumOf(rows.map((x) => x.previous));
      const share = (v: number) => (amount > ZERO ? Number((toPaisa(v) * BigInt(1000)) / amount) / 10 : null);
      const drawn = rows.filter((x) => x.amount > 0);
      return {
        figures: [{ key: "total", label: bi((t) => t.vehicles.total), value: { money: amount }, icon: PieChart }, { key: "previous", label: bi((t) => t.analytics.previousPeriod), value: { money: previous }, icon: CalendarRange }, { key: "change", label: bi((t) => t.analytics.change), value: { money: amount - previous }, icon: TrendingUp, attention: amount > previous && previous > ZERO }],
        charts: drawn.length > 1 ? [{
          key: "expenses", type: "bars", title: bi((t) => t.accounting.expenses), hint: hint("expenseBreakdown"), category: bi((t) => t.accounting.account), series: [{ key: "amount", label: bi((t) => t.expenses.amount) }],
          points: drawn.slice(0, 10).map((x) => ({ label: { en: x.name_en, ur: x.name_ur ?? x.name_en }, values: [toPaisa(x.amount)] })),
        }] : [],
        tables: [{
          key: "expenses", title: title("expenseBreakdown"), search: ["name", "code"],
          rows: rows.map((x): ReportRow => ({ id: x.account_id, name: name(x.name_en, x.name_ur), nameHref: `/accounting/ledger?account=${x.account_id}&range=custom&from=${period.from}&to=${period.to}`, code: x.code, amount: x.amount, share: share(x.amount), previous: x.previous, change: toDbAmount(toPaisa(x.amount) - toPaisa(x.previous)) })),
          columns: [
            col("name", (t) => t.accounting.account, "link", { sub: "code", subLabel: bi((t) => t.accounting.code), primary: true }), col("amount", (t) => t.expenses.amount, "money", total), col("share", (t) => t.analytics.share, "percent", lg), col("previous", (t) => t.analytics.previousPeriod, "money", { ...lg, total: true }),
            col("change", (t) => t.analytics.change, "money", total),
          ],
        }],
        checks: [{ label: bi((t) => t.analytics.checks.expenses), report: amount, other: ZERO, ledger: sumOf(statement.filter((x) => x.section === "expense").map((x) => x.amount)) }],
        notes: [bi((t) => t.analytics.notes.expenses)],
      };
    },
  },
  {
    slug: "bank-reconciliation", group: "finance", title: title("bankReconciliation"), hint: hint("bankReconciliation"), icon: Landmark, permissions: ["cash_bank.view", "cash_bank.reconcile"], dates: "now",
    filters: async () => { const list = await loadBankAccounts(); return list.length > 1 ? [{ param: "account", label: bi((t) => t.cashBank.name), all: bi((t) => t.analytics.allBankAccounts), options: list.map((a) => ({ value: a.id, label: a.name })) }] : []; },
    async load({ filter }) {
      const chosen = filter("account");
      const accounts = (await loadBankAccounts()).filter((a) => !chosen || a.id === chosen);
      const all = (await loadBankReconciliations(null)).filter((r) => !chosen || r.account_id === chosen);
      // The newest statement of every account, and what the bank had not yet seen on its date.
      const latest = accounts.flatMap((a) => { const r = all.find((x) => x.account_id === a.id); return r ? [r] : []; });
      const details = await Promise.all(latest.map((r) => loadBankReconciliation(r.id)));
      const summary: ReportTable = {
        key: "accounts", title: bi((t) => t.analytics.bankAccounts), empty: bi((t) => t.analytics.noBankAccounts),
        rows: accounts.map((a): ReportRow => {
          const d = details.find((x) => x?.accountId === a.id);
          return d
            ? { id: a.id, name: a.name, nameHref: `/cash-bank/reconciliation/${d.id}`, no: d.number, date: d.date, ledger: d.totals.ledger, inward: d.totals.unclearedIn, outward: d.totals.unclearedOut, adjusted: d.totals.adjusted, statement: d.totals.statement, difference: d.totals.difference, status: d.status }
            : { id: a.id, name: a.name, no: null, date: null, ledger: null, inward: null, outward: null, adjusted: null, statement: null, difference: null, status: "never" };
        }),
        columns: [
          col("name", (t) => t.cashBank.name, "link", { sub: "no", subLabel: bi((t) => t.documents.number), primary: true }), col("date", (t) => t.analytics.statementDate, "date"), col("ledger", (t) => t.analytics.ledgerBalance, "money", xxl), col("inward", (t) => t.analytics.unclearedIn, "money", xxl), col("outward", (t) => t.analytics.unclearedOut, "money", xxl),
          col("adjusted", (t) => t.analytics.adjustedBalance, "money", xl), col("statement", (t) => t.analytics.statementBalance, "money"), col("difference", (t) => t.analytics.difference, "money"), col("status", (t) => t.common.status, "status", { options: statusOptions((t) => ({ draft: { label: t.analytics.statuses.draft, tone: "amber" }, completed: { label: t.analytics.statuses.completed, tone: "green" }, never: { label: t.analytics.statuses.never, tone: "gray" } })) }),
        ],
      };
      const open: ReportTable = {
        key: "uncleared", title: bi((t) => t.analytics.uncleared), empty: bi((t) => t.analytics.noUncleared), search: ["account", "no", "party"],
        rows: details.flatMap((d) => (d ? d.lines.filter((l) => !l.cleared).map((l): ReportRow => ({ id: l.id, account: d.account, date: l.date, no: l.number ?? l.entry, type: biKey((t) => t.accounting.sources, l.type ?? "manual"), party: l.party ? name(l.party, l.partyUr) : l.description, amount: l.amount })) : [])),
        columns: [col("no", (t) => t.documents.number, "text", { sub: "type", subLabel: bi((t) => t.accounting.document), primary: true }), col("date", (t) => t.documents.date, "date"), col("account", (t) => t.cashBank.name, "text", lg), col("party", (t) => t.accounting.party, "text", lg), col("amount", (t) => t.receivables.amount, "money", total)],
      };
      const history: ReportTable = {
        key: "history", title: bi((t) => t.analytics.reconciliations), empty: bi((t) => t.analytics.noReconciliations),
        rows: all.map((r): ReportRow => ({ id: r.id, no: r.doc_no, noHref: `/cash-bank/reconciliation/${r.id}`, account: r.account, date: r.statement_date, statement: r.statement_balance, ledger: r.ledger, difference: r.difference, status: r.status, done: r.completed_at })),
        columns: [
          col("no", (t) => t.documents.number, "link", { primary: true }), col("account", (t) => t.cashBank.name, "text"), col("date", (t) => t.analytics.statementDate, "date"), col("statement", (t) => t.analytics.statementBalance, "money", lg), col("ledger", (t) => t.analytics.ledgerBalance, "money", lg), col("difference", (t) => t.analytics.difference, "money"),
          col("status", (t) => t.common.status, "status", { options: statusOptions((t) => ({ draft: { label: t.analytics.statuses.draft, tone: "amber" }, completed: { label: t.analytics.statuses.completed, tone: "green" } })) }),
        ],
      };
      return {
        tables: [summary, open, history],
        checks: details.flatMap((d) => (d ? [{ label: { en: `${d.account} · ${bi((t) => t.analytics.checks.bank).en}`, ur: `${d.account} · ${bi((t) => t.analytics.checks.bank).ur}` }, report: toPaisa(d.totals.statement), other: toPaisa(d.totals.unclearedIn) - toPaisa(d.totals.unclearedOut), ledger: toPaisa(d.totals.ledger) }] : [])),
        notes: [bi((t) => t.analytics.notes.bank)],
      };
    },
  },
];
