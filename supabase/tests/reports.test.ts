// Phase 11: reports. Every figure is compared with sums made here from the raw journal lines, for whole and partial periods,
// including documents of one month that are voided in another.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, one, type Row, type TestDb } from "./helpers";
import { basics, customer, employee, openingStock, product, supplier, type Basics } from "./fixtures";

let db: TestDb;
let b: Basics;
let today: string;
let cash: string;
let bank: string;

beforeAll(async () => {
  db = await createTestDb();
  b = await basics(db);
  today = one(await db.sql("select private.business_today()::text as d")).d as string;
  const account = async (name: string, type: string) => one(await db.sql("insert into public.financial_accounts (name, account_type) values ($1, $2) returning id", [name, type])).id as string;
  [cash, bank] = [await account("Cash", "cash"), await account("HBL", "bank")];
});
afterAll(() => db.close());

const json = (v: unknown) => JSON.stringify(v);
const paisa = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const sum = (list: Row[], k: string) => list.reduce((n, r) => n + paisa(r[k]), 0);
const marks = (args: unknown[]) => args.map((_, i) => `$${i + 1}`).join(", ");
const rows = (fn: string, ...args: unknown[]) => db.as(b.admin, (q) => q(`select * from public.${fn}(${marks(args)})`, args));
const rowsAs = (user: string, fn: string, ...args: unknown[]) => db.as(user, (q) => q(`select * from public.${fn}(${marks(args)})`, args));
const call = async (fn: string, ...args: unknown[]) => one(await db.as(b.admin, (q) => q(`select public.${fn}(${marks(args)}) as r`, args))).r as string;
const refused = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: "42501" });
const day = (offset: number) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const total = async (key: string, from: string, to: string, sources?: string[]) => paisa(one(await db.as(b.admin, (q) => q("select public.ledger_total($1, $2, $3, $4) v", [key.split(","), from, to, sources ?? null]))).v);
/** The same, without the function under test. */
const raw = async (where: string, from: string, to: string) => paisa(one(await db.sql(`select coalesce(sum(l.credit - l.debit), 0) v from public.journal_entry_lines l
  join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' join public.chart_of_accounts a on a.id = l.account_id left join public.chart_of_accounts g on g.id = a.parent_id
  where e.entry_date between $1 and $2 and (${where})`, [from, to])).v);

const PERIODS = () => [["2000-01-01", today], [day(-400), day(-40)], [day(-60), day(-20)], [day(-30), day(-1)], [today, today]] as const;

/** Business of a few months: sales, returns, notes, payments, purchases, expenses; some of it voided today. */
async function business() {
  const [s1, s2] = [await supplier(db), b.principal];
  const customers = [await customer(db), await customer(db), await customer(db)];
  const products = [await product(db, b, { taxRate: 17 }), await product(db, b)];
  for (const p of products) await openingStock(db, b, p, 5000, "10.37");
  const notes: string[] = [];
  const payments: string[] = [];
  const vouchers: string[] = [];
  const supplierPayments: string[] = [];
  const rent = one(await db.sql("select id from public.expense_categories where code = 'RENT'")).id;
  for (const [n, offset] of [-70, -55, -50, -33, -20, -5, 0].entries()) {
    const date = day(offset);
    const c = customers[n % 3]!;
    const inv = await db.as(b.admin, async (q) => {
      const id = one(await q("insert into public.sales_invoices (customer_id, warehouse_id, invoice_date) values ($1, $2, $3) returning id", [c, b.mainWarehouse, date])).id as string;
      await q("insert into public.sales_invoice_items (sales_invoice_id, product_id, unit_id, quantity, unit_price, discount_amount) values ($1, $2, $3, $4, 15.55, 1.11), ($1, $5, $3, 7, 99.99, 0)", [id, products[0], b.units.PCS, 10 + n, products[1]]);
      await q("select public.post_sales_invoice($1)", [id]);
      const item = one(await q("select id from public.sales_invoice_items where sales_invoice_id = $1 order by quantity limit 1", [id])).id;
      const r = one(await q("insert into public.customer_returns (customer_id, sales_invoice_id, warehouse_id, return_date) values ($1, $2, $3, $4) returning id", [c, id, b.mainWarehouse, date])).id as string;
      await q("insert into public.customer_return_items (customer_return_id, sales_invoice_item_id, product_id, unit_id, quantity, unit_price) select $1, $2, product_id, unit_id, 2, unit_price from public.sales_invoice_items where id = $2", [r, item]);
      await q("select public.post_customer_return($1)", [r]);
      return id;
    });
    for (const kind of ["credit", "debit"]) notes.push(await call("record_customer_note", json({ kind, customer_id: c, amount: `${3 + n}.25`, reason: "x", date, client_request_id: randomUUID() })));
    const pay = await db.as(b.admin, async (q) => one(await q("insert into public.customer_payments (customer_id, amount, financial_account_id, method, payment_date) values ($1, $2, $3, 'cash', $4) returning id", [c, `${50 + n}.10`, n % 2 ? bank : cash, date])).id as string);
    await call("post_customer_payment", pay);
    payments.push(pay);
    void inv;
    for (const s of [s1, s2]) {
      const po = await db.as(b.admin, async (q) => {
        const id = one(await q("insert into public.purchase_orders (supplier_id, warehouse_id, order_date, expected_date) values ($1, $2, $3, $4) returning id", [s, b.mainWarehouse, date, day(offset + (n % 2 ? 2 : -0))])).id as string;
        const it = one(await q("insert into public.purchase_order_items (purchase_order_id, product_id, unit_id, quantity, unit_price) values ($1, $2, $3, 10, 720.55) returning id", [id, products[0], b.units.CTN])).id;
        await q("select public.approve_purchase_order($1)", [id]);
        const g = one(await q("insert into public.goods_receipts (supplier_id, purchase_order_id, warehouse_id, damaged_warehouse_id, receipt_date) values ($1, $2, $3, $4, $5) returning id", [s, id, b.mainWarehouse, b.damagedWarehouse, day(Math.min(offset + 1, 0))])).id as string;
        await q("insert into public.goods_receipt_items (goods_receipt_id, purchase_order_item_id, product_id, unit_id, quantity, damaged_quantity, rejected_quantity, unit_cost) values ($1, $2, $3, $4, $5, 1, $6, 720.55)", [g, it, products[0], b.units.CTN, n % 3 ? 9 : 6, n % 3 ? 0 : 1]);
        await q("select public.post_goods_receipt($1)", [g]);
        const bill = one(await q("insert into public.supplier_invoices (supplier_id, invoice_number, invoice_date, due_date, amount) values ($1, $2, $3, $4, 7300.25) returning id", [s, `B-${n}-${s.slice(0, 4)}`, date, day(offset + 10)])).id as string;
        await q("insert into public.supplier_invoice_receipts (supplier_invoice_id, goods_receipt_id) values ($1, $2)", [bill, g]);
        await q("select public.post_supplier_invoice($1)", [bill]);
        const p = one(await q("insert into public.supplier_payments (supplier_id, amount, financial_account_id, method, payment_date) values ($1, $2, $3, 'bank_transfer', $4) returning id", [s, `${1000 + n}.40`, bank, date])).id as string;
        await q("select public.post_supplier_payment($1)", [p]);
        return p;
      });
      supplierPayments.push(po);
    }
    vouchers.push(await call("record_expense", json({ category_id: rent, amount: `${100 + n}.15`, financial_account_id: cash, method: "cash", payee: "L", description: "Rent", no_receipt_reason: "x", date, client_request_id: randomUUID() })));
  }
  // Voided today, long after some of them were dated.
  await call("void_customer_note", notes[0], "x");
  await call("void_customer_note", notes[5], "x");
  await call("void_customer_payment", payments[1], "x");
  await call("void_expense", vouchers[2], "x");
  await call("void_supplier_payment", supplierPayments[3], "x");
  await call("void_supplier_payment", supplierPayments[4], "x");
  return { products, customers, s1 };
}

describe("reports reconcile with the general ledger", () => {
  let made: Awaited<ReturnType<typeof business>>;
  beforeAll(async () => { made = await business(); });

  it("ledger_total is the ledger", async () => {
    for (const [from, to] of PERIODS()) {
      expect(await total("SALES,SALES_RETURNS", from, to)).toBe(await raw("a.system_key in ('SALES','SALES_RETURNS')", from, to));
      expect(await total("AR", from, to, ["customer_payment"])).toBe(await raw("a.system_key = 'AR' and e.source_type = 'customer_payment'", from, to));
    }
    await refused(rowsAs(await db.createUser("viewer"), "ledger_total", ["SALES"], today, today, null));
  });

  it("sales by day, month, customer and territory equal net sales in every period", async () => {
    for (const [from, to] of PERIODS()) {
      const ledger = await raw("a.system_key in ('SALES','SALES_RETURNS')", from, to);
      for (const bucket of ["day", "month"]) {
        const r = await rows("report_sales", from, to, bucket);
        expect([from, bucket, sum(r, "net_sales")]).toEqual([from, bucket, ledger]);
        expect(sum(r, "collected")).toBe(await raw("a.system_key = 'AR' and e.source_type = 'customer_payment'", from, to));
      }
      const c = await rows("report_sales_by_customer", from, to);
      expect(sum(c, "net_sales")).toBe(ledger);
      for (const by of ["territory", "city", "area"]) expect(sum(await rows("report_territories", from, to, by), "net_sales")).toBe(ledger);
      // Products know invoices and returns; notes belong to customers.
      expect(sum(await rows("report_sales_by_product", from, to), "net_sales")).toBe(await raw("a.system_key in ('SALES','SALES_RETURNS') and e.source_type in ('sales_invoice','customer_return')", from, to));
    }
    const territory = await rows("report_territories", "2000-01-01", today, "territory");
    expect(sum(territory, "balance")).toBe(-(await raw("a.system_key = 'AR'", "2000-01-01", today)));
  });

  it("product profit equals sales less cost of goods sold in the ledger", async () => {
    for (const [from, to] of PERIODS()) {
      const r = await rows("report_product_profitability", from, to);
      expect(sum(r, "cost")).toBe(-(await raw("a.system_key = 'COGS' and e.source_type in ('sales_invoice','customer_return')", from, to)));
    }
  });

  it("profit and loss by day and month equals the income statement", async () => {
    for (const [from, to] of PERIODS()) {
      const net = await raw("a.account_type in ('income','expense')", from, to);
      for (const bucket of ["day", "month"]) {
        const r = await rows("report_profit_and_loss", from, to, bucket);
        expect(sum(r, "net_profit")).toBe(net);
        expect(sum(r, "expenses")).toBe(-(await raw("a.account_type = 'expense' and g.code is distinct from '5000'", from, to)));
        expect(sum(r, "cost_of_sales")).toBe(-(await raw("g.code = '5000'", from, to)));
        for (const x of r) {
          expect(paisa(x.net_sales) - paisa(x.cost_of_sales)).toBe(paisa(x.gross_profit));
          expect(paisa(x.gross_profit) + paisa(x.other_income) - paisa(x.expenses)).toBe(paisa(x.net_profit));
        }
      }
      const accounts = await rows("report_expense_accounts", from, to);
      expect(sum(accounts, "amount")).toBe(-(await raw("a.account_type = 'expense' and g.code is distinct from '5000'", from, to)));
      expect(sum(await rows("report_expenses", from, to), "amount")).toBe(-(await raw("a.account_type = 'expense' and e.source_type in ('expense','payroll_run')", from, to)));
    }
  });

  it("receivables and payables by age equal their accounts on any date", async () => {
    for (const at of [today, day(-10), day(-35), day(-60), day(-100)]) {
      const r = await rows("report_receivables", at);
      expect(sum(r, "balance")).toBe(0 - (await raw("a.system_key = 'AR'", "2000-01-01", at)));
      const p = await rows("report_payables_aging", at);
      expect([at, sum(p, "balance")]).toEqual([at, await raw("a.system_key in ('AP_PRINCIPAL','AP_SUPPLIERS')", "2000-01-01", at)]);
      for (const x of p) expect(paisa(x.days_30) + paisa(x.days_60) + paisa(x.days_90) + paisa(x.older) - paisa(x.advance)).toBe(paisa(x.balance));
      expect(sum(await rows("report_payables_aging", at, true), "balance")).toBe(await raw("a.system_key = 'AP_PRINCIPAL'", "2000-01-01", at));
      expect(sum(await rows("report_payables_aging", at, false), "balance")).toBe(await raw("a.system_key = 'AP_SUPPLIERS'", "2000-01-01", at));
    }
  });

  it("purchases and supplier payments equal the payables accounts", async () => {
    for (const [from, to] of PERIODS()) {
      const pay = await rows("report_supplier_payments", from, to);
      expect(sum(pay, "amount")).toBe(-(await raw("a.system_key in ('AP_PRINCIPAL','AP_SUPPLIERS') and e.source_type = 'supplier_payment'", from, to)));
      const lines = await rows("report_purchase_lines", from, to);
      expect(sum(lines, "total")).toBe(await raw("a.system_key in ('AP_PRINCIPAL','AP_SUPPLIERS') and e.source_type = 'goods_receipt'", from, to));
      expect(sum(await rows("report_purchases", from, to), "total_cost")).toBe(sum(lines, "total"));
      expect(sum(await rows("report_supplier_payments", from, to, made.s1), "amount")).toBe(sum(pay.filter((x) => x.supplier_id === made.s1), "amount"));
    }
  });

  it("the main company report runs from opening to closing", async () => {
    for (const [from, to] of PERIODS()) {
      const r = await rows("report_company", from, to);
      for (const [i, x] of r.entries()) {
        expect(paisa(x.opening) + paisa(x.goods) + paisa(x.adjustments) - paisa(x.returns) - paisa(x.payments) + paisa(x.other)).toBe(paisa(x.closing));
        if (i > 0) expect(paisa(x.opening)).toBe(paisa(r[i - 1]?.closing));
      }
      expect([from, to, r.length, paisa(r.at(-1)?.closing)]).toEqual([from, to, r.length, await raw("a.system_key = 'AP_PRINCIPAL'", "2000-01-01", to)]);
      expect(sum(r, "goods")).toBe(await raw("a.system_key = 'AP_PRINCIPAL' and e.source_type = 'goods_receipt'", from, to));
    }
  });

  it("product movement equals the stock movements", async () => {
    for (const [from, to] of PERIODS()) {
      const r = await rows("report_product_movement", from, to);
      const want = Number(one(await db.sql("select coalesce(-sum(quantity), 0) v from public.stock_movements where movement_type::text in ('sale','sales_return','sol_issue','sol_return') and movement_date between $1 and $2", [from, to])).v);
      expect(r.reduce((n, x) => n + Number(x.quantity_out), 0)).toBe(want);
      expect(sum(r, "net_sales")).toBe(sum(await rows("report_sales_by_product", from, to), "net_sales"));
    }
    const all = await rows("report_product_movement", "2000-01-01", today);
    expect(sum(all, "stock_value")).toBe(-(await raw("a.system_key = 'INVENTORY'", "2000-01-01", today)));
    await expect(rows("report_product_movement", today, day(-1))).rejects.toMatchObject({ code: "22023" });
  });

  it("delivery performance counts what was ordered, received, damaged and late", async () => {
    const r = await rows("report_supplier_delivery", "2000-01-01", today);
    expect(r).toHaveLength(2);
    for (const x of r) {
      expect(Number(x.orders)).toBe(7);
      expect(Number(x.on_time) + Number(x.late)).toBe(Number(x.dated_orders));
      expect(Number(x.ordered)).toBe(7 * 10 * 72);
      expect(Number(x.accepted)).toBe((3 * 6 + 4 * 9) * 72);
      expect(Number(x.damaged)).toBe(7 * 72);
      expect(Number(x.rejected)).toBe(3 * 72);
      expect(Number(x.fill_percent)).toBeCloseTo(((3 * 6 + 4 * 9) / 70) * 100, 0);
    }
    expect(await rows("report_supplier_delivery", "2000-01-01", today, true)).toHaveLength(1);
  });
});

describe("SOL", () => {
  it("payments and costs agree with the ledger", async () => {
    const c = await customer(db);
    const type = one(await db.sql("select id from public.sol_job_types limit 1")).id;
    const id = await call("save_sol_job", null, json({ customer_id: c, job_type_id: type, contract_value: "5000", description: "T", address: "L", contact_phone: "0300-1112223" }), json([]));
    await call("set_sol_job_status", id, "confirmed");
    const pid = await call("record_sol_payment", id, json({ amount: "1200.50", financial_account_id: cash, method: "cash", client_request_id: randomUUID() }));
    const fuel = one(await db.sql("select id from public.expense_categories where code = 'SOL_DIRECT'")).id;
    const voucher = await call("record_expense", json({ category_id: fuel, amount: "310.75", financial_account_id: cash, method: "cash", payee: "P", description: "x", no_receipt_reason: "x", sol_job_id: id, client_request_id: randomUUID() }));
    expect(sum(await rows("report_sol_payments", today, today), "amount")).toBe(120050);
    expect(sum(await rows("report_sol_costs", today, today), "amount")).toBe(31075);
    await call("complete_sol_job", id);
    const jobs = await rows("report_sol_jobs", null, null, "completed");
    expect(sum(jobs, "contract_value")).toBe(await raw("a.system_key = 'SOL_REVENUE'", "2000-01-01", today));
    expect(sum(jobs, "direct_costs") + sum(jobs, "vehicle_expenses")).toBe(31075);
    await call("void_expense", voucher, "x");
    expect(sum(await rows("report_sol_costs", today, today), "amount")).toBe(0);
    expect(await rows("report_sol_costs", today, today)).toHaveLength(2);
    await call("void_customer_payment", pid, "x");
    expect(sum(await rows("report_sol_payments", today, today), "amount")).toBe(0);
  });
});

describe("bank reconciliation", () => {
  it("is completed only when the statement and the ledger agree", async () => {
    const acc = one(await db.sql("insert into public.financial_accounts (name, account_type) values ('MCB', 'bank') returning id")).id as string;
    await call("record_account_opening", acc, "10000", day(-30));
    const move = (kind: string, amount: string, date: string) => call("record_cash_voucher", json({ kind, financial_account_id: acc, counter_account_id: capital, amount, method: "cheque", description: "x", date, client_request_id: randomUUID() }));
    const capital = one(await db.sql("select id from public.chart_of_accounts where code = '3100'")).id;
    await move("receipt", "500.25", day(-20));
    await move("receipt", "900.00", day(-4));
    await move("payment", "300.10", day(-3));
    const start = (date: string, balance: string) => call("start_bank_reconciliation", acc, json({ statement_date: date, statement_balance: balance, client_request_id: randomUUID() }));
    await expect(call("start_bank_reconciliation", cash, json({ statement_date: today, statement_balance: "1" }))).rejects.toMatchObject({ code: "23514" });
    // On the statement: opening, first receipt and the payment. The second receipt has not arrived yet.
    const id = await start(day(-2), "10200.15");
    await expect(start(today, "1")).rejects.toMatchObject({ code: "23514" });
    type Rec = { totals: Record<string, string>; lines: { id: string; amount: string; cleared: boolean }[]; status: string };
    const get = async (r: string) => (await call("bank_reconciliation", r)) as unknown as Rec;
    let x = await get(id);
    expect(x.lines).toHaveLength(4);
    expect(x.totals).toMatchObject({ ledger: "11100.15", uncleared_in: "11400.25", uncleared_out: "300.10", adjusted: "0.00", statement: "10200.15" });
    await expect(call("complete_bank_reconciliation", id)).rejects.toMatchObject({ code: "23514" });
    const clear = x.lines.filter((l) => l.amount !== "900.00").map((l) => l.id);
    await call("save_bank_reconciliation", id, json({ notes: "November" }), clear);
    x = await get(id);
    expect(x.totals).toMatchObject({ uncleared_in: "900.00", uncleared_out: "0.00", adjusted: "10200.15", difference: "0.00" });
    await call("complete_bank_reconciliation", id);
    await expect(call("save_bank_reconciliation", id, json({}), [])).rejects.toMatchObject({ code: "23514" });
    // The next one starts with what was not cleared, and nothing is cleared twice.
    await expect(start(day(-2), "1")).rejects.toMatchObject({ code: "23514" });
    const next = await start(today, "11100.15");
    x = await get(next);
    expect(x.lines.map((l) => l.amount)).toEqual(["900.00"]);
    await expect(call("save_bank_reconciliation", next, json({}), [clear[0]])).rejects.toMatchObject({ code: "23514" });
    await call("save_bank_reconciliation", next, json({}), x.lines.map((l) => l.id));
    await call("complete_bank_reconciliation", next);
    expect((await get(id)).totals.difference).toBe("0.00");
    await expect(call("reopen_bank_reconciliation", id, "x")).rejects.toMatchObject({ code: "23514" });
    await expect(call("reopen_bank_reconciliation", next, " ")).rejects.toMatchObject({ code: "22023" });
    await call("reopen_bank_reconciliation", next, "mistake");
    await call("delete_bank_reconciliation", next);
    await expect(call("delete_bank_reconciliation", id)).rejects.toMatchObject({ code: "23514" });
    expect(await rows("list_bank_reconciliations", acc)).toEqual([expect.objectContaining({ status: "completed", difference: "0.00" })]);
  });

  it("needs its own permission, and clients cannot write its tables", async () => {
    const entry = await db.createUser("data_entry");
    await refused(rowsAs(entry, "list_bank_reconciliations", null));
    await refused(db.as(entry, (q) => q("select public.start_bank_reconciliation($1, '{}'::jsonb)", [bank])));
    await refused(db.as(b.admin, (q) => q("insert into public.bank_reconciliations (doc_no, financial_account_id, statement_date, statement_balance) values ('x', $1, current_date, 0)", [bank])));
    await refused(db.as(b.admin, (q) => q("insert into public.bank_reconciliation_lines select id, gen_random_uuid() from public.journal_entry_lines limit 1")));
  });
});

describe("permissions", () => {
  it("every report refuses users who may not see it", async () => {
    const entry = await db.createUser("data_entry");
    const viewer = await db.createUser("viewer");
    for (const [fn, ...args] of [["report_profit_and_loss", today, today], ["report_expense_accounts", today, today], ["report_payables_aging", today], ["report_supplier_payments", today, today], ["report_company", today, today],
      ["report_sol_costs", today, today], ["report_supplier_delivery", today, today], ["report_purchase_lines", today, today]] as [string, ...unknown[]][]) {
      await refused(rowsAs(viewer, fn, ...args));
      if (fn !== "report_supplier_delivery" && fn !== "report_purchase_lines") await refused(rowsAs(entry, fn, ...args));
    }
    // Stock movement is for whoever sees stock, without its value.
    for (const r of await rowsAs(viewer, "report_product_movement", "2000-01-01", today)) expect(r.stock_value).toBeNull();
    // Only the main company, or only suppliers.
    const role = one(await db.sql("insert into public.roles (code, name_en, name_ur) values ('ap_only', 'AP', 'AP') returning id")).id;
    await db.sql("insert into public.role_permissions (role_id, permission_code) values ($1, 'payables.view')", [role]);
    const user = await db.createUser("ap_only");
    expect((await rowsAs(user, "report_payables_aging", today)).every((r) => r.is_principal === false)).toBe(true);
    expect((await rowsAs(user, "report_supplier_payments", "2000-01-01", today)).every((r) => r.is_principal === false)).toBe(true);
    void employee;
  });

  it("exports need their own permission and are logged", async () => {
    await db.as(b.admin, (q) => q("select public.record_report_export('daily-sales', 'xlsx', '{\"from\":\"2026-01-01\"}')"));
    expect(one(await db.sql("select user_id, record_id, new_data ->> 'format' as format from public.audit_logs where table_name = 'report_exports' order by id desc limit 1"))).toMatchObject({ user_id: b.admin, record_id: "daily-sales", format: "xlsx" });
    expect((await db.as(b.admin, (q) => q("select record_id from public.v_access_audit where table_name = 'report_exports'"))).length).toBe(1);
    const role = one(await db.sql("insert into public.roles (code, name_en, name_ur) values ('reader', 'R', 'R') returning id")).id;
    await db.sql("insert into public.role_permissions (role_id, permission_code) values ($1, 'reports.view')", [role]);
    await refused(db.as(await db.createUser("reader"), (q) => q("select public.record_report_export('daily-sales', 'csv')")));
    await expect(db.as(b.admin, (q) => q("select public.record_report_export('x', 'exe')"))).rejects.toMatchObject({ code: "22023" });
  });
});
