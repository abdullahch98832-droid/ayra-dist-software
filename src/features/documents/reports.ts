import "server-only";
import { businessToday, parsePeriod, type Period } from "@/features/dashboard/period";
import { loadBalanceSheet, loadCashFlow, loadChart, loadGeneralLedger, loadIncomeStatement, reportTrialBalance, type LedgerLine } from "@/features/accounting/queries";
import { loadAccountBook, reportCashAccounts } from "@/features/cash-bank/queries";
import { reportDocument } from "@/features/reports/export";
import { loadReport, recordExport } from "@/features/reports/load";
import { AuthorizationError, type SessionContext } from "@/lib/auth/session";
import { uuidParam } from "@/lib/page-context";
import type { Bi, Block, Cell, DocModel, Value } from "@/lib/pdf/model";
import { sumPaisa, toPaisa, type Paisa } from "@/lib/utils/money";
import { asOfBi, periodBi } from "./build";
import { assertStatement, DocumentMismatch, loadStatementData, principalId, type StatementData } from "./data";
import { bi, biKey, code, date, figure, figureOrDash, name, rupees, text } from "./format";
import type { DocumentKind } from "./kinds";

export type Query = Record<string, string | string[] | undefined>;

const ZERO = BigInt(0);
const title = (kind: DocumentKind): Bi => bi((t) => t.docs.kinds[kind]);
const empty = bi((t) => t.docs.empty);
/** "1,234.50" totals of a column, added exactly. */
const sum = (amounts: (string | number | null | undefined)[]): Paisa => sumPaisa(amounts.map((v) => toPaisa(v ?? 0)));
const named = (en: string | null | undefined, ur: string | null | undefined, extra: Partial<Cell> = {}): Cell => text(name(en, ur), extra);
const blank: Cell = { text: "" };
const totalLabel: Cell = { text: bi((t) => t.docs.totals.total) };

function asOf(query: Query, today: string): string {
  const asked = typeof query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.date) && !Number.isNaN(Date.parse(query.date)) ? query.date : today;
  return asked > today ? today : asked;
}

// --- statements of account ---------------------------------------------------------------------------------------

function accountStatement(kind: DocumentKind, data: StatementData, period: Period, partyLabel: Bi, type: (key: string | null) => Bi): DocModel {
  const p = data.party;
  const supplier = kind !== "customer_statement";
  return {
    title: title(kind), period: periodBi(period.from, period.to),
    party: p ? { label: partyLabel, name: name(p.en, p.ur), lines: [...[p.contact, p.address].filter((x): x is string => !!x).map((x) => ({ text: x })), ...(p.phone ? [{ text: p.phone, code: true }] : []), ...(p.code ? [{ text: p.code, code: true, tone: "muted" as const }] : [])] } : undefined,
    meta: [
      { label: bi((t) => t.docs.totals.opening), value: rupees(data.opening) }, ...(supplier
        ? [{ label: bi((t) => t.purchasing.credit), value: rupees(data.totals.credit) }, { label: bi((t) => t.purchasing.debit), value: rupees(data.totals.debit) }]
        : [{ label: bi((t) => t.docs.totals.debit), value: rupees(data.totals.debit) }, { label: bi((t) => t.docs.totals.credit), value: rupees(data.totals.credit) }]),
      { label: bi((t) => t.docs.totals.closing), value: rupees(data.totals.closing, { strong: true }) },
    ],
    blocks: [{
      type: "table",
      columns: [
        { label: bi((t) => t.docs.labels.date) }, { label: bi((t) => t.docs.labels.description), flex: 1 }, { label: bi((t) => t.docs.labels.number) },
        { label: supplier ? bi((t) => t.purchasing.credit) : bi((t) => t.accounting.debit), figure: true }, { label: supplier ? bi((t) => t.purchasing.debit) : bi((t) => t.accounting.credit), figure: true }, { label: bi((t) => t.accounting.balance), figure: true },
      ],
      rows: [
        [date(period.from), { text: bi((t) => t.docs.broughtForward), tone: "muted" }, blank, blank, blank, figure(data.opening)],
        ...data.lines.map((l) => [
          date(l.date), { text: l.description ?? type(l.type), sub: l.reversal ? bi((t) => t.accounting.reversal) : undefined }, code(l.number),
          figureOrDash(supplier ? l.credit : l.debit), figureOrDash(supplier ? l.debit : l.credit), figure(l.balance),
        ]),
      ],
      footer: [blank, totalLabel, blank, figure(supplier ? data.totals.credit : data.totals.debit), figure(supplier ? data.totals.debit : data.totals.credit), figure(data.totals.closing)],
    }],
    signatures: [bi((t) => t.docs.signatures.prepared), supplier ? bi((t) => t.docs.signatures.supplier) : bi((t) => t.docs.signatures.customer), bi((t) => t.docs.signatures.authorised)],
  };
}

// --- ledgers -------------------------------------------------------------------------------------------------------

function ledger(kind: DocumentKind, account: Value, accountCode: string | null, lines: LedgerLine[], period: Period, columns: [Bi, Bi]): DocModel {
  const opening = lines.find((l) => l.source_type === "brought_forward");
  const moves = lines.filter((l) => l !== opening);
  let balance = toPaisa(opening?.balance ?? 0);
  for (const l of moves) {
    balance += toPaisa(l.debit) - toPaisa(l.credit);
    if (balance !== toPaisa(l.balance)) throw new DocumentMismatch("Running balance differs");
  }
  return {
    title: title(kind), period: periodBi(period.from, period.to), landscape: true,
    meta: [
      { label: bi((t) => t.docs.labels.account), value: text(account, accountCode ? { sub: accountCode } : {}) }, { label: bi((t) => t.docs.totals.opening), value: rupees(opening?.balance ?? 0) },
      { label: bi((t) => t.docs.totals.closing), value: rupees(balance, { strong: true }) },
    ],
    blocks: [{
      type: "table",
      columns: [
        { label: bi((t) => t.accounting.date) }, { label: bi((t) => t.accounting.document), flex: 1.1 }, { label: bi((t) => t.accounting.party), flex: 1 }, { label: bi((t) => t.accounting.entry) },
        { label: columns[0], figure: true }, { label: columns[1], figure: true }, { label: bi((t) => t.accounting.balance), figure: true },
      ],
      rows: [
        [date(period.from), { text: bi((t) => t.docs.broughtForward), tone: "muted" }, blank, blank, blank, blank, figure(opening?.balance ?? 0)],
        ...moves.map((l): Cell[] => [
          date(l.entry_date), { text: biKey((t) => t.accounting.sources, l.source_type), sub: [l.source_no, l.source_type === "manual" ? l.description : null].filter(Boolean).join(" · ") || undefined },
          l.party ? named(l.party, l.party_ur) : blank, code(l.doc_no, l.is_reversal ? { sub: bi((t) => t.accounting.reversal) } : {}), figureOrDash(l.debit), figureOrDash(l.credit), figure(l.balance),
        ]),
      ],
      footer: [blank, totalLabel, blank, blank, figure(sum(moves.map((l) => l.debit))), figure(sum(moves.map((l) => l.credit))), figure(balance)],
    }],
  };
}

// --- statements ------------------------------------------------------------------------------------------------------

type Sections = Extract<Block, { type: "statement" }>["sections"];
interface Amount { label: Value; code: string | null; amount: Paisa }
const rowsOf = (list: Amount[]) => list.map((r) => ({ label: r.label, code: r.code, value: rupees(r.amount) }));
const add = (list: Amount[]) => sumPaisa(list.map((r) => r.amount));
const section = (label: Bi, list: Amount[], heading: Bi | undefined = label): Sections[number] => ({ title: list.length ? heading : undefined, rows: rowsOf(list), total: { label, value: rupees(add(list)) } });
const result = (label: Bi, amount: Paisa): Sections[number] => ({ rows: [], total: { label, value: rupees(amount) }, strong: true });

async function profitAndLoss(period: Period): Promise<DocModel> {
  const rows = await loadIncomeStatement(period.from, period.to);
  const of = (s: string): Amount[] => rows.filter((r) => r.section === s).map((r) => ({ label: name(r.name_en, r.name_ur), code: r.code, amount: toPaisa(r.amount) }));
  const [sales, cost, other, expense] = [of("sales"), of("cost"), of("other_income"), of("expense")];
  const gross = add(sales) - add(cost);
  const net = gross + add(other) - add(expense);
  return {
    title: title("profit_and_loss"), period: periodBi(period.from, period.to), meta: [],
    blocks: [{ type: "statement", sections: [
      section(bi((t) => t.accounting.sales), sales), section(bi((t) => t.accounting.costOfSales), cost), result(bi((t) => t.accounting.grossProfit), gross),
      section(bi((t) => t.accounting.otherIncome), other), section(bi((t) => t.accounting.expenses), expense), result(net < ZERO ? bi((t) => t.accounting.netLoss) : bi((t) => t.accounting.netProfit), net),
    ] }],
    signatures: [bi((t) => t.docs.signatures.prepared), bi((t) => t.docs.signatures.authorised)],
  };
}

async function balanceSheet(day: string): Promise<DocModel> {
  const rows = await loadBalanceSheet(day);
  const label = (r: (typeof rows)[number]): Value => {
    if (r.system_key === "RESULT") return bi((t) => t.accounting.result);
    if (!r.flipped) return name(r.name_en, r.name_ur);
    const known = r.system_key ?? "";
    const en = r.name_en ?? "";
    return { en: (bi((t) => (t.accounting.flipped as Record<string, string>)[known] ?? t.accounting.flipped.overdraft, { name: en })).en, ur: (bi((t) => (t.accounting.flipped as Record<string, string>)[known] ?? t.accounting.flipped.overdraft, { name: r.name_ur ?? en })).ur };
  };
  const of = (s: string): Amount[] => rows.filter((r) => r.section === s && (r.amount !== 0 || r.system_key === "RESULT")).map((r) => ({ label: label(r), code: r.system_key === "RESULT" ? null : r.code, amount: toPaisa(r.amount) }));
  const [assets, liabilities, equity] = [of("asset"), of("liability"), of("equity")];
  if (add(assets) !== add(liabilities) + add(equity)) throw new DocumentMismatch("The balance sheet does not balance");
  return {
    title: title("balance_sheet"), period: asOfBi(day), meta: [],
    blocks: [{ type: "statement", sections: [
      { title: bi((t) => t.accounting.assets), rows: rowsOf(assets) }, result(bi((t) => t.accounting.totalAssets), add(assets)),
      { title: bi((t) => t.accounting.liabilities), rows: rowsOf(liabilities), total: { label: bi((t) => t.accounting.totalLiabilities), value: rupees(add(liabilities)) } },
      { title: bi((t) => t.accounting.equity), rows: rowsOf(equity), total: { label: bi((t) => t.accounting.totalEquity), value: rupees(add(equity)) } },
      result(bi((t) => t.accounting.liabilitiesAndEquity), add(liabilities) + add(equity)),
    ] }],
    signatures: [bi((t) => t.docs.signatures.prepared), bi((t) => t.docs.signatures.authorised)],
  };
}

async function cashFlow(period: Period): Promise<DocModel> {
  const rows = await loadCashFlow(period.from, period.to);
  const order = ["customers", "company", "suppliers", "salaries", "advances"];
  const place = (line: string) => (order.indexOf(line) < 0 ? order.length : order.indexOf(line));
  const sorted = rows.toSorted((x, y) => place(x.line) - place(y.line) || (x.code ?? "").localeCompare(y.code ?? ""));
  const of = (s: string): Amount[] => sorted.filter((r) => r.section === s).map((r) => ({ label: r.name_en ? name(r.name_en, r.name_ur) : biKey((t) => t.accounting.cashLines, r.line), code: r.code, amount: toPaisa(r.amount) }));
  const one = (s: string) => toPaisa(rows.find((r) => r.section === s)?.amount ?? 0);
  const [operating, investing, financing, opened] = [of("operating"), of("investing"), of("financing"), add(of("opening_balances"))];
  const change = add(operating) + add(investing) + add(financing);
  if (one("opening") + opened + change !== one("closing")) throw new DocumentMismatch("The cash flow does not explain the change in cash");
  return {
    title: title("cash_flow"), period: periodBi(period.from, period.to), meta: [],
    blocks: [{ type: "statement", sections: [
      result(bi((t) => t.accounting.cashStart), one("opening")), ...(opened !== ZERO ? [{ rows: [], total: { label: bi((t) => t.accounting.openingBalances), value: rupees(opened) } }] : []),
      section(bi((t) => t.accounting.operating), operating), section(bi((t) => t.accounting.investing), investing), section(bi((t) => t.accounting.financing), financing),
      { rows: [], total: { label: bi((t) => t.accounting.netChange), value: rupees(change) } }, result(bi((t) => t.accounting.cashEnd), one("closing")),
    ] }],
    signatures: [bi((t) => t.docs.signatures.prepared), bi((t) => t.docs.signatures.authorised)],
  };
}

async function trialBalance(period: Period): Promise<DocModel> {
  const rows = await reportTrialBalance(period.from, period.to);
  const keys = ["opening_debit", "opening_credit", "debit", "credit", "closing_debit", "closing_credit"] as const;
  const totals = keys.map((k) => sum(rows.map((r) => r[k])));
  for (let i = 0; i < 6; i += 2) if (totals[i] !== totals[i + 1]) throw new DocumentMismatch("Debits and credits differ");
  return {
    title: title("trial_balance"), period: periodBi(period.from, period.to), meta: [], landscape: true,
    blocks: [{
      type: "table",
      columns: [{ label: bi((t) => t.accounting.code) }, { label: bi((t) => t.accounting.account), flex: 1 }, ...[
        bi((t) => t.accounting.openingDebit), bi((t) => t.accounting.openingCredit), bi((t) => t.accounting.debit), bi((t) => t.accounting.credit), bi((t) => t.accounting.closingDebit), bi((t) => t.accounting.closingCredit),
      ].map((label) => ({ label, figure: true }))],
      rows: rows.map((r) => [code(r.code), named(r.name_en, r.name_ur), ...keys.map((k) => figureOrDash(r[k]))]), footer: [blank, totalLabel, ...totals.map((v) => figure(v))], empty,
    }],
    signatures: [bi((t) => t.docs.signatures.prepared), bi((t) => t.docs.signatures.authorised)],
  };
}

/** Model of a report or statement, or null when its account does not exist or may not be seen. */
export async function buildReport(kind: DocumentKind, ctx: SessionContext, query: Query): Promise<DocModel | null> {
  const today = businessToday();
  const period = parsePeriod(query, today);
  const day = asOf(query, today);
  switch (kind) {
    case "customer_statement": {
      const id = uuidParam(query.customer);
      const data = id && (await loadStatementData("customer", id, period.from, period.to));
      if (!data) return null;
      assertStatement(data, 1);
      return accountStatement(kind, data, period, bi((t) => t.docs.labels.customer), (key) => biKey((t) => t.customers.kinds, key));
    }
    case "supplier_statement": case "company_statement": {
      const id = kind === "company_statement" ? await principalId() : uuidParam(query.supplier);
      const data = id && (await loadStatementData("supplier", id, period.from, period.to));
      if (!data || (kind === "supplier_statement") === data.party?.principal) return null;
      assertStatement(data, -1);
      return accountStatement(kind, data, period, kind === "company_statement" ? bi((t) => t.docs.labels.company) : bi((t) => t.docs.labels.supplier), (key) => biKey((t) => t.accounting.sources, key));
    }
    case "general_ledger": {
      const account = (await loadChart()).find((a) => a.id === uuidParam(query.account) && a.is_postable);
      if (!account) return null;
      return ledger(kind, name(account.name_en, account.name_ur), account.code, await loadGeneralLedger(account.id, period.from, period.to), period, [bi((t) => t.accounting.debit), bi((t) => t.accounting.credit)]);
    }
    case "cash_book": case "bank_book": {
      const account = (await reportCashAccounts(period.from, period.to)).find((a) => a.account_id === uuidParam(query.account));
      if (!account) return null;
      return ledger(account.account_type === "cash" ? "cash_book" : "bank_book", account.name, null, await loadAccountBook(account.account_id, period.from, period.to), period, [bi((t) => t.cashBank.moneyIn), bi((t) => t.cashBank.moneyOut)]);
    }
    case "report": {
      const report = await loadReport(typeof query.report === "string" ? query.report : "", ctx, query, true);
      if (report === "notFound") return null;
      if (report === "forbidden") throw new AuthorizationError("reports.export");
      await recordExport(report, "pdf");
      return reportDocument(report, typeof query.table === "string" ? query.table : undefined);
    }
    case "trial_balance": return trialBalance(period);
    case "profit_and_loss": return profitAndLoss(period);
    case "balance_sheet": return balanceSheet(day);
    case "cash_flow": return cashFlow(period);
    default: return null;
  }
}
