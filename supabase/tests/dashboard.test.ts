// Dashboard figures: hand-calculated from one scenario, reconciled with the official
// financial reports, and checked per role.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, one, type Row, type TestDb } from "./helpers";
import { basics, cashAccount, customer, employee, openingStock, product, supplier, type Basics } from "./fixtures";

let db: TestDb;
let b: Basics;
let today: string;
const users = { manager: "", dataEntry: "", viewer: "", orderTaker: "", noRole: "", expenseOnly: "" };

const day = (offset: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const rpc = async (user: string, call: string, params: unknown[] = []): Promise<Record<string, never>> =>
  one(await db.as(user, (q) => q(`select ${call} as r`, params))).r as Record<string, never>;
const list = (user: string, call: string) => db.as(user, (q) => q(`select * from ${call}`));

async function customRole(code: string, permissions: string[]) {
  const id = one(await db.sql("insert into public.roles (code, name_en, name_ur) values ($1, $1, $1) returning id", [code])).id;
  for (const p of permissions) await db.sql("insert into public.role_permissions (role_id, permission_code) values ($1, $2)", [id, p]);
  return code;
}

beforeAll(async () => {
  db = await createTestDb();
  b = await basics(db);
  today = one(await db.sql("select private.business_today()::text as d")).d as string;
  users.manager = await db.createUser("manager");
  users.dataEntry = await db.createUser("data_entry");
  users.viewer = await db.createUser("viewer");
  users.noRole = await db.createUser(null);
  users.expenseOnly = await db.createUser(await customRole("expense_reader", ["dashboard.view", "expenses.view"]));
  const takerEmployee = await employee(db);
  users.orderTaker = await db.createUser("order_taker", { employeeId: takerEmployee });

  const p = await product(db, b, { taxRate: 10 });
  const q0 = await product(db, b);
  const low = await product(db, b);
  const damagedOnly = await product(db, b);
  await db.sql("update public.products set reorder_level = 200 where id = $1", [p]);
  await db.sql("update public.products set reorder_level = 10 where id = $1", [low]);
  await db.sql("update public.products set reorder_level = 5 where id = $1", [damagedOnly]);

  const cash = await cashAccount(db);
  const bank = one(await db.sql("insert into public.financial_accounts (name, account_type) values ('Bank A', 'bank') returning id")).id as string;
  const gl = async (id: string) => one(await db.sql("select gl_account_id from public.financial_accounts where id = $1", [id])).gl_account_id;
  const account = async (key: string) => one(await db.sql("select id from public.chart_of_accounts where system_key = $1", [key])).id;
  const s = await supplier(db);
  const c = await customer(db);

  await openingStock(db, b, p, 100, "5.00");
  await openingStock(db, b, damagedOnly, 10, "1.00", b.damagedWarehouse);

  await db.as(b.admin, async (q) => {
    const receive = async (supplierId: string, productId: string, unit: string, quantity: number, cost: string, date: string) => {
      const id = one(await q("insert into public.goods_receipts (supplier_id, warehouse_id, receipt_date) values ($1, $2, $3) returning id", [supplierId, b.mainWarehouse, date])).id;
      await q("insert into public.goods_receipt_items (goods_receipt_id, product_id, unit_id, quantity, unit_cost) values ($1, $2, $3, $4, $5)", [id, productId, unit, quantity, cost]);
      await q("select public.post_goods_receipt($1)", [id]);
    };
    const sell = async (productId: string, quantity: number, price: string, date: string, extra: { due?: string; taker?: string } = {}) => {
      const id = one(await q(
        "insert into public.sales_invoices (customer_id, warehouse_id, invoice_date, due_date, order_taker_id) values ($1, $2, $3, $4, $5) returning id",
        [c, b.mainWarehouse, date, extra.due ?? null, extra.taker ?? null])).id;
      const item = one(await q("insert into public.sales_invoice_items (sales_invoice_id, product_id, unit_id, quantity, unit_price) values ($1, $2, $3, $4, $5) returning id", [id, productId, b.units.PCS, quantity, price])).id;
      await q("select public.post_sales_invoice($1)", [id]);
      return { id, item };
    };
    const pay = async (amount: string) => {
      const id = one(await q(
        "insert into public.customer_payments (customer_id, payment_date, amount, financial_account_id, method) values ($1, $2, $3, $4, 'cash') returning id",
        [c, today, amount, cash])).id;
      await q("select public.post_customer_payment($1)", [id]);
      return id;
    };
    const journal = (description: string, lines: unknown[]) =>
      q("select public.create_manual_journal($1, $2, $3)", [today, description, JSON.stringify(lines)]);

    await receive(b.principal, p, b.units.CTN, 1, "720.00", today); // 72 pcs, 720.00
    await receive(s, q0, b.units.PCS, 10, "20.00", day(-1)); // 200.00

    await sell(p, 10, "12.00", today, { taker: takerEmployee }); // 120.00 + 12.00 tax, cost 70.93
    const old = await sell(q0, 2, "50.00", day(-40), { due: day(-10) }); // 100.00, cost 40.00
    await sell(q0, 1, "1.00", day(-40)); // no due date: never overdue; cost 20.00

    const ret = one(await q("insert into public.customer_returns (customer_id, sales_invoice_id, warehouse_id, return_date) values ($1, $2, $3, $4) returning id", [c, old.id, b.mainWarehouse, today])).id;
    await q("insert into public.customer_return_items (customer_return_id, sales_invoice_item_id, product_id, unit_id, quantity, unit_price) values ($1, $2, $3, $4, 1, 50)", [ret, old.item, q0, b.units.PCS]);
    await q("select public.post_customer_return($1)", [ret]);

    await q("select public.allocate_customer_payment($1, $2, 30)", [await pay("30.00"), old.id]);

    const category = one(await q("select id from public.expense_categories where code = 'FUEL'")).id;
    const expense = one(await q("insert into public.expenses (expense_date, category_id, amount, financial_account_id) values ($1, $2, 15.50, $3) returning id", [today, category, cash])).id;
    await q("select public.post_expense($1)", [expense]);

    await journal("Capital", [{ account_id: await gl(bank), debit: 1000 }, { account_id: await account("CAPITAL"), credit: 1000 }]);
    await journal("Other income", [{ account_id: await gl(cash), debit: 5 }, { account_id: await account("OTHER_INCOME"), credit: 5 }]);
    await journal("Salaries", [{ account_id: await account("SALARIES_EXPENSE"), debit: 300 }, { account_id: await gl(bank), credit: 300 }]);

    const job = one(await q("select public.save_sol_job(null, jsonb_build_object('customer_id', $1::uuid, 'job_type_id', (select id from public.sol_job_types limit 1), 'contract_value', 500), '[]') id", [c])).id;
    await q("select public.set_sol_job_status($1, 'confirmed')", [job]);
    await q("select public.complete_sol_job($1)", [job]);
    await q("select public.allocate_payment_to_sol_job($1, $2, 200)", [await pay("200.00"), job]);

    const supplierPayment = one(await q("insert into public.supplier_payments (supplier_id, payment_date, amount, financial_account_id, method) values ($1, $2, 100, $3, 'bank_transfer') returning id", [s, today, bank])).id;
    await q("select public.post_supplier_payment($1)", [supplierPayment]);
  });
});
afterAll(() => db.close());

describe("position", () => {
  it("matches the hand-calculated balances", async () => {
    expect(await rpc(b.admin, "public.dashboard_position()")).toMatchObject({
      today,
      cash: "219.50", // 30 + 200 - 15.50 + 5
      bank: "600.00", // 1000 - 300 - 100
      receivables: "453.00", // 132 + 100 + 1 - 50 - 30 + 500 - 200
      supplier_payables: "100.00",
      company_outstanding: "720.00",
      inventory_value: "1319.07", // 500 + 10 + 720 + 200 - 70.93 - 40 - 20 + 20
      today_sales: { scope: "all", net: "70.00", returns: "50.00", invoices: 1 },
      today_purchases: { total: "720.00", receipts: 1 },
      sol_pending: { amount: "300.00", jobs: 1 },
      stock: { products: 3, units: [{ name_en: "Piece", on_hand: "180", damaged: "10" }] }, // 162 + 8 + 10
    });
  });

  it("agrees with the ledgers and the inventory account", async () => {
    const r = await rpc(b.admin, "public.dashboard_position()");
    const sum = async (sql: string) => String(one(await db.as(b.admin, (q) => q(sql))).v);
    expect(r.receivables).toBe(await sum("select sum(balance)::numeric(18,2) v from public.v_customer_balances"));
    expect(r.supplier_payables).toBe(await sum("select sum(balance)::numeric(18,2) v from public.v_supplier_balances where not is_principal"));
    expect(r.company_outstanding).toBe(await sum("select sum(balance)::numeric(18,2) v from public.v_supplier_balances where is_principal"));
    expect(r.cash).toBe(await sum("select sum(balance)::numeric(18,2) v from public.v_financial_account_balances where account_type = 'cash'"));
    expect(r.bank).toBe(await sum("select sum(balance)::numeric(18,2) v from public.v_financial_account_balances where account_type = 'bank'"));
    expect(r.inventory_value).toBe(await sum(
      "select (balance_debit - balance_credit)::numeric(18,2) v from public.trial_balance('2999-12-31') where code = '1300'"));
  });
});

describe("performance", () => {
  // SOL completion is dated by the database clock (UTC), which is today or yesterday in Pakistan.
  const range = () => [day(-1), today];

  it("matches the hand-calculated period figures", async () => {
    const r = await rpc(b.admin, "public.dashboard_performance($1, $2)", range());
    expect(r).toMatchObject({
      days: 2, bucket: "day", sales_scope: "all", expense_scope: "ledger", sol_route_sales: "0.00",
      current: {
        sales: "70.00", returns: "50.00", purchases: "920.00", expenses: "315.50", sol_revenue: "500.00",
        gross_profit: "19.07", // 70 - (70.93 - 20)
        net_profit: "208.57", // 19.07 + 500 + 5 - 315.50
      },
      previous: { sales: "0.00", purchases: "0.00", expenses: "0.00", gross_profit: "0.00", net_profit: "0.00", sol_revenue: "0.00" },
    });
  });

  it("reports the same net profit as the profit and loss statement", async () => {
    for (const [from, to] of [range(), [day(-60), today], [day(-40), day(-40)]] as [string, string][]) {
      const r = await rpc(b.admin, "public.dashboard_performance($1, $2)", [from, to]) as unknown as { current: Record<string, string> };
      const pl = await db.as(b.admin, (q) => q(
        `select coalesce(sum(case when account_type = 'income' then amount else -amount end), 0)::numeric(18,2) as net,
                coalesce(sum(amount) filter (where code like '41%'), 0)::numeric(18,2) as sales,
                coalesce(sum(amount) filter (where code like '6%'), 0)::numeric(18,2) as expenses
           from public.profit_and_loss($1, $2)`, [from, to]));
      expect(r.current).toMatchObject({ net_profit: one(pl).net, sales: one(pl).sales, expenses: one(pl).expenses });
    }
  });

  it("splits the period into buckets that add up to the totals, including empty days", async () => {
    const r = await rpc(b.admin, "public.dashboard_performance($1, $2)", [day(-20), today]) as unknown as { series: Record<string, string>[]; current: Record<string, string> };
    expect(r.series).toHaveLength(21);
    expect(r.series[0]).toMatchObject({ start: day(-20), sales: "0.00", net_profit: "0.00" });
    const total = (key: string) => r.series.reduce((sum, x) => sum + Math.round(Number(x[key]) * 100), 0);
    for (const key of ["sales", "expenses", "gross_profit", "net_profit"]) expect(total(key)).toBe(Math.round(Number(r.current[key]) * 100));
    expect(r.series.at(-1)).toMatchObject({ start: today, sales: "70.00", stock_out: "10" });
  });

  it("uses weeks and months for longer ranges and never starts a bucket before the range", async () => {
    const weekly = await rpc(b.admin, "public.dashboard_performance($1, $2)", [day(-59), today]) as unknown as { bucket: string; series: Record<string, string>[] };
    expect(weekly.bucket).toBe("week");
    expect(weekly.series[0]!.start! >= day(-59)).toBe(true);
    const monthly = await rpc(b.admin, "public.dashboard_performance($1, $2)", [day(-364), today]) as unknown as { bucket: string; current: Record<string, string> };
    expect(monthly.bucket).toBe("month");
    expect(monthly.current.sales).toBe("171.00"); // 120 + 100 + 1 - 50
  });

  it("lists expenses by account, largest first", async () => {
    const r = await rpc(b.admin, "public.dashboard_performance($1, $2)", range()) as unknown as { expense_accounts: Row[] };
    expect(r.expense_accounts.map((x) => [x.name_en, x.amount])).toEqual([["Salaries and Wages", "300.00"], ["Fuel / Petrol", "15.50"]]);
  });

  it("moves reversed expenses out of the total", async () => {
    const before = (await rpc(b.admin, "public.dashboard_performance($1, $2)", range()) as unknown as { current: Record<string, string> }).current.expenses;
    const id = await db.as(b.admin, async (q) => {
      const x = one(await q(`insert into public.expenses (expense_date, category_id, amount, financial_account_id)
        select $1, (select id from public.expense_categories where code = 'RENT'), 99, id from public.financial_accounts where account_type = 'cash' returning id`, [day(-1)])).id;
      await q("select public.post_expense($1)", [x]);
      return x;
    });
    expect((await rpc(b.admin, "public.dashboard_performance($1, $2)", range()) as unknown as { current: Record<string, string> }).current.expenses).toBe("414.50");
    await db.as(b.admin, (q) => q("select public.void_expense($1, 'test')", [id]));
    expect((await rpc(b.admin, "public.dashboard_performance($1, $2)", range()) as unknown as { current: Record<string, string> }).current.expenses).toBe(before);
  });

  it.each([["2026-02-01", "2026-01-01"], ["2020-01-01", "2026-01-01"], [null, "2026-01-01"]])("rejects the range %s to %s", async (from, to) => {
    await expect(rpc(b.admin, "public.dashboard_performance($1, $2)", [from, to])).rejects.toMatchObject({ code: "22023" });
  });
});

describe("alerts", () => {
  it("counts only due invoices with a remaining balance", async () => {
    expect(await rpc(b.admin, "public.dashboard_overdue()")).toMatchObject({
      receivables: { total: "20.00", count: 1, items: [{ days: 10, outstanding: "20.00" }] }, // 100 - 50 returned - 30 paid
      payables: { total: "0.00", count: 0, items: [] },
    });
  });

  it("separates the main company from other suppliers", async () => {
    const invoice = async (supplierId: string) => {
      const id = one(await db.as(b.admin, (q) => q(
        "insert into public.supplier_invoices (supplier_id, invoice_number, invoice_date, due_date, amount) values ($1, $2, $3, $4, 60) returning id",
        [supplierId, `N-${supplierId.slice(0, 6)}`, day(-30), day(-5)]))).id;
      await db.sql("update public.supplier_invoices set status = 'posted' where id = $1", [id]);
    };
    await invoice(b.principal);
    await invoice(await supplier(db));
    const reader = await db.createUser(await customRole("company_reader", ["dashboard.view", "company.view"]));
    expect(await rpc(reader, "public.dashboard_overdue()")).toMatchObject({ payables: { total: "60.00", count: 1 } });
    expect(await rpc(b.admin, "public.dashboard_overdue()")).toMatchObject({ payables: { total: "120.00", count: 2 } });
  });

  it("lists low stock by saleable quantity, ignoring damaged goods and unmonitored products", async () => {
    const r = await rpc(b.admin, "public.dashboard_low_stock()") as unknown as { count: number; monitored: number; items: Row[] };
    expect([r.count, r.monitored]).toEqual([3, 3]);
    expect(r.items.map((x) => [x.available, x.reorder_level])).toEqual(expect.arrayContaining([["0", "10"], ["0", "5"], ["162", "200"]]));
    expect(r.items.at(-1)).toMatchObject({ available: "162" });
  });
});

describe("permissions", () => {
  it("gives a manager every business figure", async () => {
    expect(await rpc(users.manager, "public.dashboard_position()")).toEqual(await rpc(b.admin, "public.dashboard_position()"));
    const range = [day(-1), today];
    expect(await rpc(users.manager, "public.dashboard_performance($1, $2)", range)).toEqual(await rpc(b.admin, "public.dashboard_performance($1, $2)", range));
  });

  it.each(["dataEntry", "viewer"] as const)("%s gets no balances, costs, purchases or profit", async (who) => {
    const position = await rpc(users[who], "public.dashboard_position()");
    expect(Object.keys(position).sort()).toEqual(["stock", "today", "today_sales"]);
    const performance = await rpc(users[who], "public.dashboard_performance($1, $2)", [day(-1), today]) as unknown as Record<string, Record<string, string>> & { series: Row[] };
    expect(Object.keys(performance.current!).sort()).toEqual(["returns", "sales", "sol_revenue"]);
    expect(Object.keys(performance.series[0]!).sort()).toEqual(["sales", "start", "stock_in", "stock_out"]);
    expect(performance).not.toHaveProperty("expense_accounts");
    expect(await rpc(users[who], "public.dashboard_overdue()")).toEqual({});
    const kinds = (await list(users[who], "public.dashboard_recent_transactions(20)")).map((r) => r.kind);
    for (const hidden of ["goods_receipt", "supplier_payment", "expense", "fund_transfer"]) expect(kinds).not.toContain(hidden);
  });

  it("limits an order taker to their own sales", async () => {
    expect(await rpc(users.orderTaker, "public.dashboard_position()")).toMatchObject({ today_sales: { scope: "own", net: "120.00", invoices: 1 } });
    const other = await db.createUser("order_taker", { employeeId: await employee(db) });
    expect(await rpc(other, "public.dashboard_position()")).toMatchObject({ today_sales: { scope: "own", net: "0.00", invoices: 0 } });
    expect(await rpc(users.orderTaker, "public.dashboard_performance($1, $2)", [day(-1), today])).toMatchObject({ sales_scope: "own", current: { sales: "120.00" } });
    await expect(rpc(users.orderTaker, "public.dashboard_low_stock()")).rejects.toMatchObject({ code: "42501" });
  });

  it("does not show a driver any company totals", async () => {
    const driver = await db.createUser("driver", { employeeId: await employee(db) });
    expect(Object.keys(await rpc(driver, "public.dashboard_position()"))).toEqual(["today"]);
    expect(await rpc(driver, "public.dashboard_performance($1, $2)", [day(-1), today])).toMatchObject({ current: {}, previous: {} });
  });

  it("shows expense documents, not payroll, to someone who may only see expenses", async () => {
    const r = await rpc(users.expenseOnly, "public.dashboard_performance($1, $2)", [day(-1), today]) as unknown as { expense_accounts: Row[] };
    expect(r).toMatchObject({ expense_scope: "documents", current: { expenses: "15.50" } });
    expect(r.expense_accounts.map((x) => x.name_en)).toEqual(["Fuel / Petrol"]);
    expect(r).not.toHaveProperty("current.net_profit");
  });

  it("refuses users without a role, and anonymous visitors", async () => {
    for (const call of ["public.dashboard_position()", "public.dashboard_overdue()", "public.dashboard_low_stock()"]) {
      await expect(rpc(users.noRole, call)).rejects.toMatchObject({ code: "42501" });
      await expect(db.asAnon((q) => q(`select ${call}`))).rejects.toMatchObject({ code: "42501" });
    }
    expect(await list(users.noRole, "public.dashboard_recent_transactions()")).toEqual([]);
    expect(await list(users.noRole, "public.dashboard_recent_orders()")).toEqual([]);
    expect(await list(users.noRole, "public.dashboard_open_work()")).toEqual([]);
  });
});

describe("lists", () => {
  it("shows the latest posted documents of every kind to the Super Admin", async () => {
    const rows = await list(b.admin, "public.dashboard_recent_transactions(20)");
    expect(new Set(rows.map((r) => r.kind))).toEqual(new Set(["sales_invoice", "customer_return", "customer_payment", "goods_receipt", "supplier_payment", "expense"]));
  });

  it("tracks orders through review, dispatch and delivery", async () => {
    const c = await customer(db);
    const p = one(await db.sql("select product_id from public.stock_balances order by on_hand desc limit 1")).product_id as string;
    const work = async (user: string) => Object.fromEntries((await list(user, "public.dashboard_open_work()")).map((r) => [`${r.scope}.${r.kind}`, Number(r.waiting)]));

    const order = await db.as(users.dataEntry, async (q) => {
      const id = one(await q("insert into public.sales_orders (customer_id, warehouse_id) values ($1, $2) returning id", [c, b.mainWarehouse])).id as string;
      await q("insert into public.sales_order_items (sales_order_id, product_id, unit_id, quantity, unit_price) values ($1, $2, $3, 5, 10)", [id, p, b.units.PCS]);
      return id;
    });
    expect(await work(users.dataEntry)).toEqual({ "mine.sales_order": 1 });
    expect(await work(users.manager)).not.toHaveProperty("review.sales_order");
    expect((await list(users.dataEntry, "public.dashboard_my_records()")).map((r) => [r.kind, r.status])).toEqual([["sales_order", "draft"]]);
    expect(await list(users.manager, "public.dashboard_my_records()")).toEqual([]);

    await db.as(users.dataEntry, (q) => q("select public.submit_sales_order($1)", [order]));
    expect(await work(users.dataEntry)).toEqual({});
    expect(await work(users.manager)).toMatchObject({ "review.sales_order": 1 });

    await db.as(users.manager, (q) => q("select public.approve_sales_order($1)", [order]));
    expect(await work(users.manager)).toMatchObject({ "review.dispatch": 1 });
    expect((await list(users.viewer, "public.dashboard_recent_orders()"))[0]).toMatchObject({ status: "approved", total_amount: "50.00" });
    expect(await list(users.orderTaker, "public.dashboard_recent_orders()")).toEqual([]);

    await db.as(users.manager, (q) => q("insert into public.deliveries (sales_order_id) values ($1)", [order]));
    const [pending] = await list(users.viewer, "public.dashboard_pending_deliveries()");
    expect(pending).toMatchObject({ status: "draft", total_count: "1" });
  });
});
