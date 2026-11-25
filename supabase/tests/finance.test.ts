// Phase 9: expense vouchers, payroll, cash and bank, daily closing, periods, ledgers and statements.
// Every figure is compared with sums computed here from the raw journal lines.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, one, type Row, type TestDb } from "./helpers";
import { basics, customer, directSale, employee, openingStock, product, receive, supplier, type Basics } from "./fixtures";

let db: TestDb;
let b: Basics;
let today: string;
let cash: string;
let till: string;
let bank: string;
let cats: Record<string, string>;
let acc: Record<string, string>;

beforeAll(async () => {
  db = await createTestDb();
  b = await basics(db);
  today = one(await db.sql("select private.business_today()::text as d")).d as string;
  const account = async (name: string, type: string) => one(await db.sql("insert into public.financial_accounts (name, account_type) values ($1, $2) returning id", [name, type])).id as string;
  [cash, till, bank] = [await account("Main cash", "cash"), await account("Till", "cash"), await account("HBL", "bank")];
  cats = Object.fromEntries((await db.sql("select code, id from public.expense_categories")).map((r) => [r.code, r.id])) as Record<string, string>;
  acc = Object.fromEntries((await db.sql("select coalesce(system_key, code) k, id from public.chart_of_accounts")).map((r) => [r.k, r.id])) as Record<string, string>;
});
afterAll(() => db.close());

const json = (value: unknown) => JSON.stringify(value);
const call = async (user: string, fn: string, ...args: unknown[]) => one(await db.as(user, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args))).r as string;
const rows = (user: string, fn: string, ...args: unknown[]) => db.as(user, (q) => q(`select * from public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")})`, args));
const paisa = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const refused = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: "42501" });
const day = (offset: number, from = today) => { const d = new Date(`${from}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const gl = async (key: string, at = "2999-01-01") => paisa(one(await db.sql("select private.gl_balance($1, $2) v", [acc[key], at])).v);
const book = async (account: string, at = "2999-01-01") => paisa(one(await db.sql("select private.gl_balance((select gl_account_id from public.financial_accounts where id = $1), $2) v", [account, at])).v);
const req = () => ({ client_request_id: randomUUID() });

const voucher = (user: string, category: string, amount: string, extra: Record<string, unknown> = {}) =>
  call(user, "record_expense", json({ category_id: cats[category], amount, financial_account_id: cash, method: "cash", payee: "Vendor", description: "Test", receipt_path: "expenses/x.jpg", ...req(), ...extra }));
const advance = (e: string, amount: string, extra: Record<string, unknown> = {}) => call(b.admin, "record_advance", json({ employee_id: e, amount, financial_account_id: cash, method: "cash", ...req(), ...extra }));
const transfer = (from: string, to: string, amount: string, extra: Record<string, unknown> = {}) => call(b.admin, "record_fund_transfer", json({ from_account_id: from, to_account_id: to, amount, method: "cash", ...req(), ...extra }));
const cashVoucher = (kind: string, account: string, amount: string, extra: Record<string, unknown> = {}) =>
  call(b.admin, "record_cash_voucher", json({ kind, financial_account_id: bank, counter_account_id: account, amount, method: "bank_transfer", description: "Test", ...req(), ...extra }));
const journal = (date: string, lines: unknown[], text = "Manual") => call(b.admin, "create_manual_journal", date, text, json(lines));
const close = (account: string, counted: string, extra: Record<string, unknown> = {}) => call(b.admin, "close_cash_day", account, json({ counted, ...req(), ...extra }));
const status = async (table: string, id: string) => one(await db.sql(`select status::text s from public.${table} where id = $1`, [id])).s;

interface Line { date: string; debit: number; credit: number; account: string; type: string; key: string | null; code: string; group: string | null; party: string | null; entry: string; cash: boolean; section: string | null }
const ledger = async (): Promise<Line[]> => (await db.sql(`select e.entry_date::text as date, (l.debit * 100)::bigint::int as debit, (l.credit * 100)::bigint::int as credit, a.id as account, a.account_type::text as type, a.system_key as key,
    a.code, g.code as group, coalesce(l.customer_id, l.supplier_id, l.employee_id)::text as party, e.id as entry, fa.id is not null as cash, a.cash_flow as section
   from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' join public.chart_of_accounts a on a.id = l.account_id
   left join public.chart_of_accounts g on g.id = a.parent_id left join public.financial_accounts fa on fa.gl_account_id = a.id`)) as unknown as Line[];
const total = (list: Line[]) => list.reduce((n, l) => n + l.debit - l.credit, 0);
const sum = (list: Row[], k: string) => list.reduce((n, r) => n + paisa(r[k]), 0);

async function checks() {
  for (const r of await rows(b.admin, "ledger_checks")) expect([r.check_code, paisa(r.ledger)]).toEqual([r.check_code, paisa(r.documents)]);
}

/** Every statement against sums of the raw journal lines. */
async function statements(from: string, to: string) {
  const all = await ledger();
  const until = all.filter((l) => l.date <= to);
  const within = until.filter((l) => l.date >= from);
  // Trial balance
  const tb = await rows(b.admin, "report_trial_balance", from, to);
  for (const [x, y] of [["opening_debit", "opening_credit"], ["debit", "credit"], ["closing_debit", "closing_credit"]] as const) expect(sum(tb, x)).toBe(sum(tb, y));
  for (const r of tb) {
    const mine = until.filter((l) => l.account === r.account_id);
    expect(paisa(r.closing_debit) - paisa(r.closing_credit)).toBe(total(mine));
    expect(paisa(r.opening_debit) - paisa(r.opening_credit)).toBe(total(mine.filter((l) => l.date < from)));
  }
  expect(new Set(tb.map((r) => r.account_id)).size).toBe(new Set(until.map((l) => l.account)).size);
  // Profit and loss
  const pl = await rows(b.admin, "income_statement", from, to);
  const part = (s: string) => sum(pl.filter((r) => r.section === s), "amount");
  const result = part("sales") - part("cost") + part("other_income") - part("expense");
  expect(result).toBe(0 - total(within.filter((l) => l.type === "income" || l.type === "expense")));
  expect(part("sales")).toBe(0 - total(within.filter((l) => l.key === "SALES" || l.key === "SALES_RETURNS")));
  expect(part("cost")).toBe(total(within.filter((l) => l.group === "5000")));
  const old = await rows(b.admin, "profit_and_loss", from, to);
  expect(sum(old.filter((r) => r.account_type === "income"), "amount") - sum(old.filter((r) => r.account_type === "expense"), "amount")).toBe(result);
  // Balance sheet
  const bs = await rows(b.admin, "balance_sheet", to);
  const side = (s: string) => sum(bs.filter((r) => r.section === s), "amount");
  expect(side("asset")).toBe(side("liability") + side("equity"));
  expect(side("asset") - side("liability")).toBe(total(until.filter((l) => l.type === "asset" || l.type === "liability")));
  expect(paisa(bs.find((r) => r.system_key === "RESULT")?.amount)).toBe(0 - total(until.filter((l) => l.type === "income" || l.type === "expense")));
  // Receivables are the customers who owe; the others are advances among the liabilities.
  const parties = new Map<string, number>();
  for (const l of until.filter((x) => x.key === "AR")) parties.set(l.party!, (parties.get(l.party!) ?? 0) + l.debit - l.credit);
  expect(sum(bs.filter((r) => r.system_key === "AR" && !r.flipped), "amount")).toBe([...parties.values()].filter((v) => v > 0).reduce((n, v) => n + v, 0));
  expect(sum(bs.filter((r) => r.system_key === "AR" && r.flipped), "amount")).toBe(0 - [...parties.values()].filter((v) => v < 0).reduce((n, v) => n + v, 0));
  // Cash flow
  const cf = await rows(b.admin, "cash_flow", from, to);
  const of = (s: string) => sum(cf.filter((r) => r.section === s), "amount");
  const money = until.filter((l) => l.cash);
  expect([of("opening"), of("closing")]).toEqual([total(money.filter((l) => l.date < from)), total(money)]);
  expect(of("opening") + of("opening_balances") + of("operating") + of("investing") + of("financing")).toBe(of("closing"));
  // Cash and bank accounts
  const ca = await rows(b.admin, "report_cash_accounts", from, to);
  expect(sum(ca, "closing")).toBe(of("closing"));
  for (const r of ca) {
    expect(["opening", "receipts", "payments", "deposits", "withdrawals", "transfers"].reduce((n, k) => n + paisa(r[k]), 0)).toBe(paisa(r.closing));
    const lines = await rows(b.admin, "account_book", r.account_id, from, to);
    expect(paisa(lines.at(-1)!.balance)).toBe(paisa(r.closing));
  }
  expect(sum(ca, "deposits") + sum(ca, "withdrawals") + sum(ca, "transfers")).toBe(0);
  // Expenses by category, salaries from payroll
  const ex = await rows(b.admin, "report_expenses", from, to);
  // Vouchers as the ledger has them: one voided later is undone on the day it was voided.
  const vouchers = new Set((await db.sql("select id from public.journal_entries where source_type = 'expense' and status = 'posted'")).map((r) => r.id as string));
  expect(sum(ex.filter((r) => !r.is_payroll), "amount")).toBe(total(within.filter((l) => vouchers.has(l.entry) && l.type === "expense")));
  const runs = new Set((await db.sql("select id from public.journal_entries where source_type = 'payroll_run'")).map((r) => r.id));
  expect(sum(ex.filter((r) => r.is_payroll), "amount")).toBe(total(within.filter((l) => runs.has(l.entry) && l.key === "SALARIES_EXPENSE")));
  // A ledger per account
  for (const a of [acc.AR, acc.SALES, acc["6200"]]) {
    const lines = await rows(b.admin, "general_ledger", a, from, to);
    expect(paisa(lines[0]!.balance) + lines.reduce((n, l) => n + paisa(l.debit) - paisa(l.credit), 0)).toBe(paisa(lines.at(-1)!.balance));
    expect(paisa(lines.at(-1)!.balance)).toBe(total(until.filter((l) => l.account === a)));
  }
}

describe("expense vouchers", () => {
  it("offer every category and need every detail before approval", async () => {
    const names = (await db.sql("select name_en from public.expense_categories where is_active")).map((r) => r.name_en);
    for (const n of ["Guard", "Sweeper", "Servant", "Salaries", "Electricity", "Gas", "Water", "Snacks", "Rent", "Petrol", "Vehicle Repairs", "Other expenses"]) expect(names).toContain(n);
    const entry = await db.createUser("data_entry");
    const before = { cash: await book(cash), guard: await gl("6110") };
    const id = await voucher(entry, "GUARD", "900.00", { receipt_path: null, payee: "", description: "" });
    expect([await status("expenses", id), await book(cash)]).toEqual(["draft", before.cash]);
    expect(one(await db.sql("select doc_no from public.expenses where id = $1", [id])).doc_no).toMatch(/^EXP-\d{6}$/);
    for (const [fix, message] of [[{ description: "Night guard" }, /Who was paid/], [{ payee: "Aslam" }, /Attach the receipt/]] as const) {
      await call(entry, "update_expense", id, json({ category_id: cats.GUARD, amount: "900.00", financial_account_id: cash, method: "cash", ...{ description: "Night guard", payee: "" }, ...fix }));
      await expect(call(b.admin, "post_expense", id)).rejects.toThrow(message);
    }
    await refused(call(entry, "post_expense", id));
    await call(entry, "attach_expense_receipt", id, "expenses/a.pdf");
    await call(b.admin, "post_expense", id);
    expect([await status("expenses", id), before.cash - await book(cash), await gl("6110") - before.guard]).toEqual(["posted", 90000, 90000]);
    expect((await rows(b.admin, "expense_register", today, today)).find((r) => r.expense_id === id)).toMatchObject({ status: "posted", has_receipt: true, payee: "Aslam", recorded_by: expect.any(String), decided_by: expect.any(String), method: "cash" });
    await expect(call(entry, "update_expense", id, json({ category_id: cats.GUARD, amount: "1", financial_account_id: cash }))).rejects.toThrow(/already posted/);
    await expect(call(b.admin, "attach_expense_receipt", id, "expenses/b.pdf")).rejects.toThrow(/already has a receipt/);
    await checks();
  });

  it("can be rejected with a reason and never reach the accounts", async () => {
    const entry = await db.createUser("data_entry");
    const other = await db.createUser("data_entry");
    const before = await book(cash);
    const id = await voucher(entry, "SWEEPER", "500.00");
    await refused(call(entry, "reject_expense", id, "x"));
    await expect(call(b.admin, "reject_expense", id, " ")).rejects.toThrow(/reason is required/);
    await expect(call(other, "update_expense", id, json({ category_id: cats.GAS, amount: "1", financial_account_id: cash }))).rejects.toThrow(/not found/);
    await call(b.admin, "reject_expense", id, "Paid twice");
    expect([await status("expenses", id), await book(cash)]).toEqual(["void", before]);
    expect(await db.as(entry, (q) => q("select void_reason from public.expenses where id = $1", [id]))).toEqual([{ void_reason: "Paid twice" }]);
    expect((await rows(b.admin, "expense_register", today, today, null, "rejected")).map((r) => r.expense_id)).toContain(id);
    await expect(call(b.admin, "post_expense", id)).rejects.toThrow(/already void/);
    for (const bad of [{ receipt_path: "sales/x.jpg" }, { receipt_path: "expenses/../sol/x" }, { date: day(1) }]) await expect(voucher(entry, "GAS", "5", bad)).rejects.toMatchObject({ code: "22023" });
    await refused(db.as(b.admin, (q) => q("update public.expenses set amount = 1")));
    await refused(db.as(b.admin, (q) => q("insert into public.expenses (category_id, amount, financial_account_id) values ($1, 1, $2)", [cats.GAS, cash])));
    const request = req();
    expect(await voucher(entry, "GAS", "7.00", request)).toBe(await voucher(entry, "GAS", "7.00", request));
    await refused(voucher(await db.createUser("viewer"), "GAS", "1"));
    await refused(rows(await db.createUser("viewer"), "expense_register", today, today));
  });

  it("leave salaries to payroll, so that they are counted once", async () => {
    await expect(voucher(b.admin, "SALARIES", "100")).rejects.toThrow(/recorded in Payroll/);
    const id = await voucher(await db.createUser("data_entry"), "WATER", "10");
    await db.sql("update public.expenses set category_id = $1 where id = $2", [cats.SALARIES, id]);
    await expect(call(b.admin, "post_expense", id)).rejects.toThrow(/recorded in Payroll/);
    await db.sql("delete from public.expenses where id = $1", [id]);
  });
});

describe("payroll", () => {
  it("from salary and advance through bonus and deduction to part payment and settlement", async () => {
    const [a, c] = [await employee(db), await employee(db)];
    await db.sql("insert into public.employee_salaries (employee_id, base_salary) values ($1, 30000), ($2, 20000)", [a, c]);
    const start = { exp: await gl("SALARIES_EXPENSE"), adv: await gl("EMPLOYEE_ADVANCES"), pay: await gl("SALARIES_PAYABLE"), cash: await book(cash), bank: await book(bank) };
    await advance(a, "6000.00");
    expect([await gl("EMPLOYEE_ADVANCES") - start.adv, start.cash - await book(cash), await gl("SALARIES_EXPENSE") - start.exp]).toEqual([600000, 600000, 0]);
    const run = await call(b.admin, "prepare_payroll", "2026-04-15");
    await expect(call(b.admin, "prepare_payroll", "2026-04-01")).rejects.toThrow(/already is a payroll/);
    await expect(call(b.admin, "prepare_payroll", "2099-01-01")).rejects.toThrow(/future/);
    expect((await rows(b.admin, "report_payroll", "2026-04-01", "2026-04-30")).map((r) => r.basic_salary).sort()).toEqual(["20000.00", "30000.00"]);
    const lines = [{ employee_id: a, basic_salary: "30000", allowances: "1500", bonus: "2500.50", deductions: "700.25", advance_recovery: "2000" }, { employee_id: c, basic_salary: "20000" }];
    await expect(call(b.admin, "save_payroll", run, json([{ employee_id: c, basic_salary: "100", deductions: "101" }]))).rejects.toMatchObject({ code: "23514" });
    await call(b.admin, "save_payroll", run, json(lines), "April");
    await expect(call(b.admin, "pay_salaries", run, json({ financial_account_id: bank, method: "cheque" }), json([{ payroll_item_id: randomUUID(), amount: "1" }]))).rejects.toThrow(/does not belong/);
    await call(b.admin, "post_payroll_run", run, null);
    // Net: 30000 + 1500 + 2500.50 - 700.25 - 2000 = 31300.25; expense without the recovery: 33300.25 + 20000.
    expect([await gl("SALARIES_EXPENSE") - start.exp, await gl("SALARIES_PAYABLE") - start.pay, await gl("EMPLOYEE_ADVANCES") - start.adv]).toEqual([5330025, -5130025, 400000]);
    expect(one(await db.sql("select entry_date::text d from public.journal_entries where id = (select journal_entry_id from public.payroll_runs where id = $1)", [run])).d).toBe("2026-04-30");
    const items = await rows(b.admin, "report_payroll", "2026-04-01", "2026-04-30");
    const mine = items.find((r) => r.employee_id === a)!;
    expect(mine).toMatchObject({ basic_salary: "30000.00", allowances: "1500.00", bonus: "2500.50", deductions: "700.25", advance_recovery: "2000.00", gross_pay: "34000.50", net_pay: "31300.25", paid: "0", pending: "31300.25" });
    const pay = (list: [string, string][], extra: Record<string, unknown> = {}) => call(b.admin, "pay_salaries", run, json({ financial_account_id: bank, method: "bank_transfer", reference: "T1", ...extra }), json(list.map(([payroll_item_id, amount]) => ({ payroll_item_id, amount }))));
    const other = items.find((r) => r.employee_id === c)!;
    // All or nothing: the second amount is too high, so the first is not paid either.
    await expect(pay([[mine.payroll_item_id as string, "100"], [other.payroll_item_id as string, "20000.01"]])).rejects.toThrow(/exceeds the salary due/);
    expect(await book(bank)).toBe(start.bank);
    const request = req();
    await pay([[mine.payroll_item_id as string, "10000"], [other.payroll_item_id as string, "20000"]], request);
    expect(Number(await pay([[mine.payroll_item_id as string, "10000"], [other.payroll_item_id as string, "20000"]], request))).toBe(0);
    const after = await rows(b.admin, "report_payroll", "2026-04-01", "2026-04-30", a);
    expect(after[0]).toMatchObject({ paid: "10000.00", pending: "21300.25" });
    // Paying is not an expense again.
    expect([await gl("SALARIES_EXPENSE") - start.exp, start.bank - await book(bank)]).toEqual([5330025, 3000000]);
    expect((await rows(b.admin, "payroll_employees")).find((r) => r.employee_id === a)).toMatchObject({ base_salary: "30000.00", advances: "4000.00", payable: "21300.25" });
    await expect(call(b.admin, "void_payroll_run", run, "x")).rejects.toThrow(/were paid/);
    for (const p of await db.sql("select id from public.salary_payments where status = 'posted' and payroll_item_id = any($1)", [[mine.payroll_item_id, other.payroll_item_id]])) await call(b.admin, "void_salary_payment", p.id, "Wrong account");
    await call(b.admin, "void_payroll_run", run, "Wrong month");
    expect([await gl("SALARIES_EXPENSE") - start.exp, await gl("SALARIES_PAYABLE") - start.pay, await gl("EMPLOYEE_ADVANCES") - start.adv, start.bank - await book(bank)]).toEqual([0, 0, 600000, 0]);
    expect(await call(b.admin, "prepare_payroll", "2026-04-01")).toBeTruthy();
    await checks();
  });

  it("guards advances and confidential figures", async () => {
    const e = await employee(db);
    const id = await advance(e, "1000.00");
    const run = await call(b.admin, "prepare_payroll", "2026-05-01");
    await call(b.admin, "save_payroll", run, json([{ employee_id: e, basic_salary: "5000", advance_recovery: "1000.01" }]));
    await expect(call(b.admin, "post_payroll_run", run, null)).rejects.toThrow(/exceeds the outstanding advance/);
    await call(b.admin, "save_payroll", run, json([{ employee_id: e, basic_salary: "5000", advance_recovery: "400" }]));
    await expect(call(b.admin, "post_payroll_run", run, "2026-04-30")).rejects.toThrow(/before the salary period/);
    await expect(call(b.admin, "post_payroll_run", run, day(1))).rejects.toThrow(/future/);
    await call(b.admin, "post_payroll_run", run, null);
    await expect(call(b.admin, "void_advance", id, "x")).rejects.toThrow(/already recovered/);
    await expect(advance(e, "0")).rejects.toMatchObject({ code: "23514" });
    const entry = await db.createUser("data_entry");
    for (const fn of [["prepare_payroll", "2026-06-01"], ["save_payroll", run, "[]"], ["post_payroll_run", run, null], ["pay_salaries", run, "{}", "[]"], ["record_advance", "{}"], ["void_advance", id, "x"]] as [string, ...unknown[]][]) await refused(call(entry, ...fn));
    await refused(rows(entry, "report_payroll", "2026-01-01", today));
    await refused(rows(entry, "payroll_employees"));
    for (const t of ["payroll_runs", "payroll_items", "salary_payments", "employee_advances"]) await refused(db.as(b.admin, (q) => q(`update public.${t} set id = id`)));
    const empty = await call(b.admin, "prepare_payroll", "2026-06-01");
    await call(b.admin, "save_payroll", empty, "[]");
    await expect(call(b.admin, "post_payroll_run", empty, null)).rejects.toThrow(/no employees/);
    await checks();
  });
});

describe("cash and bank", () => {
  it("tracks opening balance, receipts, payments, deposits, withdrawals and transfers", async () => {
    const mk = async (name: string, type: string) => call(b.admin, "save_financial_account", null, json({ name, account_type: type, bank_name: "B" }));
    const [box, safe, acct] = [await mk("Box", "cash"), await mk("Safe", "cash"), await mk("UBL", "bank")];
    const eq = await gl("OPENING_EQUITY");
    const opening = await call(b.admin, "record_account_opening", box, "5000.00", day(-5));
    await call(b.admin, "record_account_opening", acct, "-250.00", day(-5));
    expect(await gl("OPENING_EQUITY") - eq).toBe(-475000);
    await expect(call(b.admin, "record_account_opening", box, "1", day(-5))).rejects.toThrow(/already has an opening balance/);
    await expect(call(b.admin, "record_account_opening", safe, "-1", null)).rejects.toThrow(/cannot be negative/);
    const c = await customer(db);
    const pay = one(await db.as(b.admin, (q) => q("insert into public.customer_payments (customer_id, amount, financial_account_id, method) values ($1, 700, $2, 'cash') returning id", [c, box]))).id as string;
    await call(b.admin, "post_customer_payment", pay);
    await voucher(b.admin, "SNACKS" in cats ? "SNACKS" : "REFRESHMENTS", "120.00", { financial_account_id: box });
    await transfer(box, acct, "1000.00");
    await transfer(acct, box, "300.00");
    const t = await transfer(box, safe, "400.00");
    const undone = await transfer(box, acct, "77.00");
    await call(b.admin, "void_fund_transfer", undone, "Mistake");
    await call(b.admin, "void_customer_payment", pay, "Bounced");
    const r = async (id: string, from = day(-1)) => (await rows(b.admin, "report_cash_accounts", from, today)).find((x) => x.account_id === id)!;
    expect(await r(box)).toMatchObject({ opening: "5000.00", receipts: "0.00", payments: "-120.00", deposits: "-1000.00", withdrawals: "300.00", transfers: "-400.00", closing: "3780.00" });
    expect(await r(acct)).toMatchObject({ opening: "-250.00", deposits: "1000.00", withdrawals: "-300.00", transfers: "0", closing: "450.00" });
    expect((await r(box, day(-9))).opening).toBe("5000.00");
    await call(b.admin, "void_fund_transfer", t, "x");
    await call(b.admin, "void_account_opening", opening, "Wrong");
    await call(b.admin, "record_account_opening", box, "5100.00", day(-5));
    expect((await r(box)).closing).toBe("4280.00");
    await expect(transfer(box, box, "1")).rejects.toMatchObject({ code: "23514" });
    const entry = await db.createUser("data_entry");
    for (const fn of [["record_account_opening", box, "1", null], ["record_fund_transfer", "{}"], ["void_fund_transfer", t, "x"], ["record_cash_voucher", "{}"], ["close_cash_day", box, "{}"]] as [string, ...unknown[]][]) await refused(call(entry, ...fn));
    await refused(rows(entry, "report_cash_accounts", today, today));
    await refused(rows(entry, "account_book", box, today, today));
    await checks();
  });

  it("vouchers take capital and other income, never what has its own document", async () => {
    const start = await book(bank);
    const id = await cashVoucher("receipt", acc.CAPITAL!, "10000.00");
    const out = await cashVoucher("payment", acc.DRAWINGS!, "1500.00");
    expect(one(await db.sql("select string_agg(left(doc_no, 3), ',' order by kind desc) v from public.cash_vouchers where id = any($1)", [[id, out]])).v).toBe("RV-,PV-");
    expect(await book(bank) - start).toBe(850000);
    for (const key of ["SALES", "SALES_RETURNS", "SOL_REVENUE", "AR", "AP_PRINCIPAL", "AP_SUPPLIERS", "INVENTORY", "SALARIES_PAYABLE", "EMPLOYEE_ADVANCES", "CASH_WITH_COLLECTORS", "OPENING_EQUITY", "6300", "COGS"]) {
      await expect(cashVoucher("receipt", acc[key]!, "1"), key).rejects.toThrow(/has its own document/);
      await expect(cashVoucher("payment", acc[key]!, "1"), key).rejects.toThrow(/has its own document/);
    }
    await expect(cashVoucher("payment", acc.OTHER_INCOME!, "1")).rejects.toThrow(/has its own document/);
    expect((await rows(b.admin, "list_voucher_accounts", "receipt")).map((r) => r.code)).toEqual(expect.arrayContaining(["3100", "4900"]));
    expect((await rows(b.admin, "list_voucher_accounts", "payment")).map((r) => r.code)).not.toContain("4900");
    await call(b.admin, "void_cash_voucher", id, "x");
    await expect(call(b.admin, "void_cash_voucher", id, "x")).rejects.toThrow(/Only posted/);
    await checks();
  });
});

describe("revenue and purchases are counted once", () => {
  it("whatever is paid, refunded, settled or deposited", async () => {
    const p = await product(db, b);
    await openingStock(db, b, p, 100, "5.00");
    const c = await customer(db);
    const s = await supplier(db);
    const before = { sales: await gl("SALES"), inventory: await gl("INVENTORY"), expense: total((await ledger()).filter((l) => l.type === "expense")) };
    await receive(db, b, s, p, 10, b.units.PCS!, "8.00");
    const bought = await gl("INVENTORY") - before.inventory;
    const invoice = await directSale(db, b, c, p, 4, b.units.PCS!, "20.00");
    const [sold, cost] = [await gl("SALES") - before.sales, total((await ledger()).filter((l) => l.type === "expense")) - before.expense];
    expect([bought, sold]).toEqual([8000, -8000]);
    const pay = one(await db.as(b.admin, (q) => q("insert into public.customer_payments (customer_id, amount, financial_account_id, method) values ($1, 80, $2, 'cash') returning id", [c, cash]))).id as string;
    await call(b.admin, "post_customer_payment", pay);
    await call(b.admin, "allocate_customer_payment", pay, invoice, "80");
    const sp = one(await db.as(b.admin, (q) => q("insert into public.supplier_payments (supplier_id, amount, financial_account_id, method) values ($1, 80, $2, 'cash') returning id", [s, cash]))).id as string;
    await call(b.admin, "post_supplier_payment", sp);
    await transfer(cash, bank, "80.00");
    expect([await gl("SALES") - before.sales, total((await ledger()).filter((l) => l.type === "expense")) - before.expense]).toEqual([sold, cost]);
    const inv = await gl("INVENTORY");
    expect(inv - before.inventory).toBe(bought - cost);
    // Nor through the back door.
    const g = one(await db.sql("select gl_account_id id from public.financial_accounts where id = $1", [cash])).id;
    for (const key of ["SALES", "SOL_REVENUE", "INVENTORY", "COGS", "SALES_RETURNS", "CASH_WITH_COLLECTORS", "SALARIES_PAYABLE", "EMPLOYEE_ADVANCES"]) {
      await expect(journal(today, [{ account_id: g, debit: "80" }, { account_id: acc[key], credit: "80", customer_id: c }]), key).rejects.toThrow(/changed by its documents only/);
    }
    await checks();
  });
});

describe("manual journals and the chart of accounts", () => {
  it("balance, post once and reverse with a reason", async () => {
    const request = randomUUID();
    const lines = [{ account_id: acc["6700"], debit: "12.34", client_request_id: request }, { account_id: acc.CAPITAL, credit: "12.34" }];
    const id = await journal(today, lines);
    expect(await journal(today, lines)).toBe(id);
    await expect(journal(today, [{ account_id: acc["6700"], debit: "1" }, { account_id: acc.CAPITAL, credit: "1.01" }])).rejects.toThrow(/not balanced/);
    await expect(journal(today, lines, " ")).rejects.toThrow(/description is missing/);
    await expect(journal(day(1), lines)).rejects.toThrow(/future/);
    expect(await rows(b.admin, "journal_lines", id)).toMatchObject([{ code: "6700", debit: "12.34" }, { code: "3100", credit: "12.34" }]);
    expect((await rows(b.admin, "list_journal", today, today, "manual", "Manual", 10, 0)).map((r) => r.entry_id)).toContain(id);
    await expect(call(b.admin, "reverse_manual_journal", id, today, "")).rejects.toThrow(/reason is required/);
    await call(b.admin, "reverse_manual_journal", id, today, "Wrong");
    await checks();
  });

  it("protect accounts in use", async () => {
    const set = (sql: string, ...args: unknown[]) => db.as(b.admin, (q) => q(sql, args));
    const group = one(await db.sql("select id from public.chart_of_accounts where code = '2000'")).id;
    const loan = one(await set("insert into public.chart_of_accounts (code, name_en, name_ur, account_type, parent_id) values ('2600', 'Bank loan', 'قرض', 'liability', $1) returning id", group)).id as string;
    await expect(set("insert into public.chart_of_accounts (code, name_en, name_ur, account_type, parent_id) values ('2601', 'x', 'x', 'asset', $1)", group)).rejects.toThrow(/type of its group/);
    await expect(set("insert into public.chart_of_accounts (code, name_en, name_ur, account_type, parent_id) values ('2602', 'x', 'x', 'liability', $1)", loan)).rejects.toThrow(/not a group/);
    await cashVoucher("receipt", loan, "500.00");
    await expect(set("update public.chart_of_accounts set is_active = false where id = $1", loan)).rejects.toThrow(/still has a balance/);
    await expect(set("update public.chart_of_accounts set is_postable = false where id = $1", loan)).rejects.toThrow(/has entries/);
    await expect(set("update public.chart_of_accounts set is_active = false where system_key = 'AR'")).rejects.toThrow(/cannot be deactivated/);
    await cashVoucher("payment", loan, "500.00");
    await set("update public.chart_of_accounts set is_active = false where id = $1", loan);
    await call(b.admin, "save_financial_account", till, json({ name: "Front till" }));
    expect(one(await db.sql("select a.name_en from public.chart_of_accounts a join public.financial_accounts f on f.gl_account_id = a.id where f.id = $1", [till])).name_en).toBe("Front till");
    await call(b.admin, "save_financial_account", till, json({ name: "Till" }));
    const cf = await rows(b.admin, "cash_flow", today, today);
    expect(cf.find((r) => r.code === "2600")).toBeUndefined(); // received and repaid: no net flow
  });
});

describe("daily cash closing", () => {
  it("counts, explains the difference and locks the day", async () => {
    const box = await call(b.admin, "save_financial_account", null, json({ name: "Closing box", account_type: "cash" }));
    await call(b.admin, "record_account_opening", box, "1000.00", day(-3));
    await voucher(b.admin, "WATER", "150.00", { financial_account_id: box, date: day(-2) });
    expect(one(await rows(b.admin, "cash_day", box, day(-2)))).toMatchObject({ opened_after: null, opening: "0", receipts: "1000.00", payments: "150.00", expected: "850.00" });
    await expect(close(box, "840.00", { date: day(-2) })).rejects.toThrow(/Explain the difference/);
    await expect(close(bank, "1")).rejects.toThrow(/Only cash accounts/);
    await expect(close(box, "850", { date: day(1) })).rejects.toThrow(/future/);
    await expect(close(box, "-1", { date: day(-2) })).rejects.toThrow(/counted cash/);
    const short = await gl("CASH_OVER_SHORT");
    const request = req();
    const first = await close(box, "840.00", { date: day(-2), notes: "Short", post_difference: true, denominations: { 500: 1, 100: 3, 20: 2 }, ...request });
    expect(await close(box, "840.00", { date: day(-2), notes: "Short", post_difference: true, ...request })).toBe(first);
    expect([await book(box), await gl("CASH_OVER_SHORT") - short]).toEqual([84000, 1000]);
    expect(one(await db.sql("select expected::text, counted::text, difference::text from public.cash_closings where id = $1", [first]))).toEqual({ expected: "850.00", counted: "840.00", difference: "-10.00" });
    // Nothing more on that day or before; other accounts and later days are open.
    for (const date of [day(-2), day(-3)]) await expect(voucher(b.admin, "WATER", "1", { financial_account_id: box, date })).rejects.toThrow(/cash of Closing box is closed/);
    await expect(transfer(box, bank, "1", { date: day(-2) })).rejects.toThrow(/is closed/);
    await voucher(b.admin, "WATER", "1", { financial_account_id: cash, date: day(-2) });
    await voucher(b.admin, "WATER", "40.00", { financial_account_id: box, date: day(-1) });
    await expect(close(box, "1", { date: day(-2) })).rejects.toThrow(/already closed until/);
    const second = await close(box, "800.00", { date: day(-1) });
    expect(one(await db.sql("select opening_balance::text o, payments::text p, difference::text d from public.cash_closings where id = $1", [second]))).toEqual({ o: "840.00", p: "40.00", d: "0.00" });
    await expect(call(b.admin, "reopen_cash_day", first, "x")).rejects.toThrow(/later days first/);
    await expect(call(b.admin, "reopen_cash_day", second, "")).rejects.toThrow(/reason is required/);
    await call(b.admin, "reopen_cash_day", second, "Forgot a voucher");
    await call(b.admin, "reopen_cash_day", first, "Recount");
    expect([await book(box), await gl("CASH_OVER_SHORT") - short]).toEqual([81000, 0]);
    await checks();
    await close(box, "805.00", { date: day(-1), notes: "Short, not booked" });
    expect(await book(box)).toBe(81000);
    await checks();
  });

  it("cannot be passed by a posting at the same moment", async () => {
    const box = await call(b.admin, "save_financial_account", null, json({ name: "Race box", account_type: "cash" }));
    await call(b.admin, "record_account_opening", box, "1000.00", today);
    for (let i = 0; i < 3; i++) {
      const r = await Promise.allSettled([voucher(b.admin, "WATER", "10.00", { financial_account_id: box }), close(box, "1000.00", { notes: "race" }), voucher(b.admin, "GAS", "10.00", { financial_account_id: box }), transfer(box, bank, "5.00")]);
      expect(r[1]!.status).toBe("fulfilled");
      const c = one(await db.sql("select id, expected from public.cash_closings where financial_account_id = $1 and status = 'closed'", [box]));
      expect(await book(box)).toBe(paisa(c.expected));
      await call(b.admin, "reopen_cash_day", c.id, "again");
    }
    await checks();
  });
});

describe("period closing", () => {
  it("waits for drafts, cash and checks, then locks the month until it is reopened", async () => {
    const month = (n: number) => { const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
    const found = async (id: string) => Object.fromEntries((await rows(b.admin, "period_checklist", id)).filter((r) => Number(r.found) > 0).map((r) => [r.check_code, Number(r.found)]));
    const current = await call(b.admin, "create_period", today);
    expect(await found(current)).toMatchObject({ not_ended: 1 });
    await expect(call(b.admin, "close_period", current)).rejects.toThrow(/cannot be closed yet/);
    await expect(call(b.admin, "create_period", today)).rejects.toThrow(/already exists/);
    // Everything before is a chain of months; close them oldest first.
    const oldest = one(await db.sql("select min(entry_date)::text d from public.journal_entries")).d as string;
    const months: string[] = [];
    for (let i = -1; ; i--) { months.unshift(month(i)); if (month(i) <= oldest) break; }
    const ids: string[] = [];
    for (const m of months) ids.push(await call(b.admin, "create_period", m));
    if (ids.length > 1) expect(await found(ids.at(-1)!)).toHaveProperty("earlier_open");
    const entry = await db.createUser("data_entry");
    const draft = await voucher(entry, "RENT", "10", { date: months[0] });
    expect(await found(ids[0]!)).toHaveProperty("draft_expenses", 1);
    await call(b.admin, "reject_expense", draft, "x");
    for (const [i, id] of ids.entries()) {
      const end = day(-1, month(i - ids.length + 1));
      for (const f of await db.sql("select id, name from public.financial_accounts where account_type = 'cash'")) {
        const until = one(await db.sql("select private.cash_closed_until($1)::text d", [f.id])).d as string | null;
        const expected = one(await db.sql("select expected::text e, (receipts <> 0 or payments <> 0) moved from private.cash_day($1, $2)", [f.id, end]));
        if ((until === null || until < end) && expected.moved) {
          expect(await found(id)).toHaveProperty("cash_not_closed");
          const negative = Number(expected.e) < 0;
          await close(f.id as string, negative ? "0" : (expected.e as string), { date: end, notes: "Month end" });
        }
      }
      for (const r of await db.sql("select id from public.payroll_runs where status = 'draft' and period_month between $1 and $2", [months[i], end])) await db.sql("delete from public.payroll_runs where id = $1", [r.id]);
      expect(await found(id)).toEqual({});
      await call(b.admin, "close_period", id);
      const totals = one(await db.sql("select closing_totals t from public.accounting_periods where id = $1", [id])).t as { debit: string; credit: string; result: string };
      expect(totals.debit).toBe(totals.credit);
    }
    const last = ids.at(-1)!;
    const inside = day(-1, month(0));
    await expect(voucher(b.admin, "RENT", "10", { date: inside, financial_account_id: bank })).rejects.toThrow(/period .* is closed/);
    await expect(journal(inside, [{ account_id: acc["6700"], debit: "1" }, { account_id: acc.CAPITAL, credit: "1" }])).rejects.toThrow(/is closed/);
    const [c] = await db.sql("select id from public.cash_closings where status = 'closed' and closing_date = $1 limit 1", [inside]);
    if (c) await expect(call(b.admin, "reopen_cash_day", c.id, "x")).rejects.toThrow(/period .* is closed/);
    if (ids.length > 1) await expect(call(b.admin, "reopen_period", ids[0], "x")).rejects.toThrow(/later periods first/);
    await expect(call(b.admin, "reopen_period", last, "")).rejects.toThrow(/reason is required/);
    const viewer = await db.createUser("viewer");
    for (const fn of [["create_period", "2025-01-01"], ["close_period", last], ["reopen_period", last, "x"]] as [string, ...unknown[]][]) await refused(call(viewer, ...fn));
    await refused(db.as(b.admin, (q) => q("update public.accounting_periods set status = 'open'")));
    await call(b.admin, "reopen_period", last, "Late bill");
    await voucher(b.admin, "RENT", "10", { date: inside, financial_account_id: bank });
    await checks();
    for (const id of [...ids].reverse().slice(1)) await call(b.admin, "reopen_period", id, "test");
  });
});

describe("statements", () => {
  it("need their permissions", async () => {
    const entry = await db.createUser("data_entry");
    for (const fn of [["report_trial_balance", today, today], ["income_statement", today, today], ["balance_sheet", today], ["cash_flow", today, today], ["ledger_checks"], ["general_ledger", acc.AR, today, today], ["list_journal", today, today], ["journal_lines", randomUUID()], ["period_checklist", randomUUID()], ["report_expenses", today, today]] as [string, ...unknown[]][]) await refused(rows(entry, ...fn));
  });

  it("agree with the general ledger after random business", async () => {
    let seed = Number(process.env.SEED ?? 20261128);
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor((seed / 2147483648) * n); };
    const pick = <T,>(list: T[]): T => { if (!list.length) throw Object.assign(new Error("nothing"), { code: "P0002" }); return list[rnd(list.length)]!; };
    const amount = (max: number) => `${1 + rnd(max)}.${String(rnd(100)).padStart(2, "0")}`;
    const boxes: string[] = [];
    for (const [n, t] of [["R1", "cash"], ["R2", "cash"], ["RB", "bank"]] as const) boxes.push(await call(b.admin, "save_financial_account", null, json({ name: n, account_type: t, bank_name: "B" })));
    for (const x of boxes) await call(b.admin, "record_account_opening", x, "50000.00", day(-40));
    const cs = [await customer(db), await customer(db)];
    const ss = [await supplier(db), one(await db.sql("select id from public.suppliers where is_principal")).id as string];
    const es = [await employee(db), await employee(db)];
    const p = await product(db, b);
    await openingStock(db, b, p, 500, "11.37");
    const count: Record<string, number> = {};
    const attempt = async (name: string, f: () => Promise<unknown>) => {
      try { await f(); count[name] = (count[name] ?? 0) + 1; } catch (e) { if (!["23514", "22023", "P0002"].includes((e as { code?: string }).code ?? "")) throw e; }
    };
    const months = new Set<string>();
    for (let i = 0; i < 260; i++) {
      const date = day(-rnd(35));
      const op = rnd(14);
      const insert = (table: string, sql: string, args: unknown[]) => db.as(b.admin, async (q) => one(await q(`insert into public.${table} ${sql} returning id`, args)).id as string);
      if (op === 0) await attempt("sale", () => directSale(db, b, pick(cs), p, 1 + rnd(5), b.units.PCS!, amount(60)));
      else if (op === 1) await attempt("receipt", () => receive(db, b, pick(ss), p, 1 + rnd(20), b.units.PCS!, amount(20)));
      else if (op <= 3) await attempt("customer payment", async () => call(b.admin, "post_customer_payment", await insert("customer_payments", "(customer_id, payment_date, amount, financial_account_id, method) values ($1, $2, $3, $4, 'cash')", [pick(cs), date, amount(900), pick(boxes)])));
      else if (op === 4) await attempt("supplier payment", async () => call(b.admin, "post_supplier_payment", await insert("supplier_payments", "(supplier_id, payment_date, amount, financial_account_id, method) values ($1, $2, $3, $4, 'cash')", [pick(ss), date, amount(400), pick(boxes)])));
      else if (op <= 6) await attempt("expense", () => voucher(b.admin, pick(["GUARD", "GAS", "WATER", "RENT", "FUEL", "MISC", "ELECTRICITY"]), amount(300), { date, financial_account_id: pick(boxes) }));
      else if (op === 7) await attempt("transfer", () => transfer(pick(boxes), pick(boxes), amount(500), { date }));
      else if (op === 8) await attempt("voucher", () => { const kind = pick(["receipt", "payment"]); return cashVoucher(kind, pick([acc.CAPITAL!, acc.DRAWINGS!, acc["1600"]!, acc.OTHER_INCOME!]), amount(800), { date, financial_account_id: pick(boxes) }); });
      else if (op === 9) await attempt("advance", () => advance(pick(es), amount(500), { date, financial_account_id: pick(boxes) }));
      else if (op === 10) await attempt("payroll", async () => {
        const m = `2025-${String(1 + rnd(12)).padStart(2, "0")}-01`;
        const run = await call(b.admin, "prepare_payroll", m);
        await call(b.admin, "save_payroll", run, json(es.map((e) => ({ employee_id: e, basic_salary: amount(3000), bonus: amount(90), deductions: amount(50), advance_recovery: rnd(2) ? amount(40) : "0" }))));
        try { await call(b.admin, "post_payroll_run", run, null); months.add(run); } catch (e) { await db.sql("delete from public.payroll_runs where id = $1", [run]); throw e; }
      });
      else if (op === 11) await attempt("salary", async () => {
        const run = pick([...months]);
        const items = await db.sql("select id, net_pay from public.payroll_items where payroll_run_id = $1", [run]);
        await call(b.admin, "pay_salaries", run, json({ financial_account_id: pick(boxes), method: "cash", date }), json(items.map((x) => ({ payroll_item_id: x.id, amount: (Number(x.net_pay) / 3).toFixed(2) }))));
      });
      else if (op === 12) await attempt("journal", () => journal(date, [{ account_id: acc["6700"], debit: "5.55" }, { account_id: acc["6800"], debit: "1.45" }, { account_id: acc.CAPITAL, credit: "7" }]));
      else await attempt("void", async () => {
        const t = pick([["expenses", "void_expense"], ["fund_transfers", "void_fund_transfer"], ["cash_vouchers", "void_cash_voucher"], ["customer_payments", "void_customer_payment"], ["salary_payments", "void_salary_payment"], ["employee_advances", "void_advance"]]);
        await call(b.admin, t[1]!, pick(await db.sql(`select id from public.${t[0]} where status = 'posted' and created_at > now() - interval '1 hour'`) as { id: string }[]).id, "x");
      });
      if (i % 65 === 64) { await checks(); await statements(day(-20), day(-3)); }
    }
    expect(Object.keys(count).length).toBeGreaterThan(9);
    await statements(day(-400), today);
    await statements(day(-10), day(-10));
    await statements("2025-01-01", "2025-12-31");
  }, 180_000);
});
