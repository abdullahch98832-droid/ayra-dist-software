// Phase 7: customers, order takers, the order workflow, deliveries, collections, notes, sales reports and their accounting.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, one, type Row, type TestDb } from "./helpers";
import { basics, cashAccount, customer, employee, glBalance, openingStock, product, stock, type Basics } from "./fixtures";

let db: TestDb;
let b: Basics;
let today: string;
let cash: string;
let bank: string;

beforeAll(async () => {
  db = await createTestDb();
  b = await basics(db);
  today = one(await db.sql("select private.business_today()::text as d")).d as string;
  cash = await cashAccount(db);
  bank = one(await db.sql("insert into public.financial_accounts (name, account_type) values ('HBL', 'bank') returning id")).id as string;
});
afterAll(() => db.close());

const json = (value: unknown) => JSON.stringify(value);
const call = async (user: string, fn: string, ...args: unknown[]) =>
  one(await db.as(user, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args))).r as string;
const rows = (user: string, fn: string, ...args: unknown[]) =>
  db.as(user, (q) => q(`select * from public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")})`, args));
const paisa = (v: unknown) => Math.round(Number(v) * 100);
const gl = async (key: string) => paisa(await glBalance(db, key));
const day = (offset: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const status = async (so: string) => one(await db.sql("select status::text s from public.sales_orders where id = $1", [so])).s;
const outstanding = async (invoice: string) => one(await db.sql("select private.sales_invoice_outstanding($1)::text v", [invoice])).v;
const balance = async (c: string) => one(await db.sql("select private.customer_balance($1)::numeric(18,2)::text v", [c])).v;
const held = async (e: string) => one(await db.sql("select private.collector_held($1)::numeric(18,2)::text v", [e])).v;

interface Line { product: string; unit?: string; qty: number; price: string; discount?: string }
const saveOrder = (user: string, c: string, lines: Line[], extra: Record<string, unknown> = {}, id: string | null = null) =>
  call(user, "save_sales_order", id, json({ customer_id: c, warehouse_id: b.mainWarehouse, date: today, ...extra }),
    json(lines.map((l) => ({ product_id: l.product, unit_id: l.unit ?? b.units.PCS, quantity: l.qty, unit_price: l.price, discount_amount: l.discount }))));
async function approved(c: string, lines: Line[], extra: Record<string, unknown> = {}) {
  const so = await saveOrder(b.admin, c, lines, extra);
  await call(b.admin, "submit_sales_order", so);
  await call(b.admin, "approve_sales_order", so);
  return so;
}
async function picking(c: string, lines: Line[], extra: Record<string, unknown> = {}) {
  const so = await approved(c, lines, extra);
  await call(b.admin, "start_picking", so);
  return so;
}
const items = (so: string) => db.sql("select id, quantity::int from public.sales_order_items where sales_order_id = $1 order by product_id, id", [so]);
/** Dispatches the given quantity of every line; returns the delivery and its invoice. */
async function dispatch(so: string, quantities?: number[], extra: Record<string, unknown> = {}) {
  const lines = (await items(so)).map((l, i) => ({ sales_order_item_id: l.id, quantity: quantities ? quantities[i] : l.quantity })).filter((l) => Number(l.quantity) > 0);
  const delivery = await call(b.admin, "save_delivery", so, json({ date: today, ...extra }), json(lines));
  return { delivery, invoice: await call(b.admin, "dispatch_delivery", delivery) };
}
const pay = (user: string, c: string, amount: string, invoices: [string, string][] = [], extra: Record<string, unknown> = {}) =>
  call(user, "record_customer_payment", json({ customer_id: c, date: today, amount, method: "cash", financial_account_id: cash, ...extra }),
    json(invoices.map(([invoice_id, a]) => ({ invoice_id, amount: a }))));

async function orderTaker() {
  const id = await employee(db);
  await call(b.admin, "save_order_taker", id, json({ territory: "Gulberg" }));
  return { id, user: await db.createUser("order_taker", { employeeId: id }) };
}

/** Rules that must hold after any sequence of documents. */
async function invariants() {
  const r = JSON.parse(json(one(await db.as(b.admin, (q) => q("select public.inventory_reconciliation() as r"))).r));
  expect(r).toMatchObject({ difference: "0.00", quantity_mismatches: 0 });
  expect(await db.sql("select journal_entry_id from public.journal_entry_lines group by 1 having sum(debit) <> sum(credit)")).toEqual([]);
  // Reserved stock is exactly what open orders still hold.
  expect(await db.sql(`select sb.product_id from public.stock_balances sb
     left join (select i.product_id, o.warehouse_id, sum(i.reserved_base_quantity) q from public.sales_order_items i join public.sales_orders o on o.id = i.sales_order_id group by 1, 2) x using (product_id, warehouse_id)
    where sb.reserved <> coalesce(x.q, 0)`)).toEqual([]);
  // The receivables account is the sum of invoices, returns, payments, notes and SOL jobs.
  const docs = one(await db.sql(`select (select coalesce(sum(total_amount), 0) from public.sales_invoices where status = 'posted')
     - (select coalesce(sum(total_amount), 0) from public.customer_returns where status = 'posted') - (select coalesce(sum(amount), 0) from public.customer_payments where status = 'posted')
     + (select coalesce(sum(case when kind = 'credit' then -amount else amount end), 0) from public.customer_notes where status = 'posted') as v`)).v;
  expect(await gl("AR")).toBe(paisa(docs));
  // Cash held = collections without an account - posted deposits.
  const held = one(await db.sql(`select (select coalesce(sum(amount), 0) from public.customer_payments where status = 'posted' and financial_account_id is null)
     - (select coalesce(sum(amount), 0) from public.cash_deposits where status = 'posted') as v`)).v;
  expect(await gl("CASH_WITH_COLLECTORS")).toBe(paisa(held));
  expect(await db.sql("select employee_id from public.order_takers where private.collector_held(employee_id) < 0")).toEqual([]);
  // Every order's state follows from its deliveries and invoices.
  expect(await db.sql(`select o.doc_no, o.status from public.sales_orders o
     join (select sales_order_id, bool_or(dispatched_base_quantity > 0) out, bool_or(dispatched_base_quantity < base_quantity) remaining from public.sales_order_items group by 1) i on i.sales_order_id = o.id
    where i.out and o.status::text <> case when i.remaining and o.closed_at is null then 'partially_dispatched'
      when exists (select 1 from public.deliveries d where d.sales_order_id = o.id and d.status = 'dispatched') then 'dispatched'
      when exists (select 1 from public.sales_invoices v where v.sales_order_id = o.id and private.sales_invoice_outstanding(v.id) > 0) then 'delivered' else 'completed' end`)).toEqual([]);
  // Nothing is settled beyond its amount.
  expect(await db.sql("select p.doc_no from public.customer_payments p where private.payment_unallocated(p.id) < 0")).toEqual([]);
}

describe("customers and order takers", () => {
  it("stores every detail, numbers customers and books the opening balance", async () => {
    const t = await orderTaker();
    const id = await call(b.admin, "save_customer", null, json({
      name: "Bismillah Store", owner_name: "Ali", phone: "0300", whatsapp: "0301", address: "Main Bazaar", city: "Lahore", credit_limit: "50000.00", payment_terms_days: 15,
      order_taker_id: t.id, opening_balance: "1250.50", opening_date: day(-10) }));
    expect(one(await db.sql("select code, name, owner_name, whatsapp, city, credit_limit, order_taker_id from public.customers where id = $1", [id])))
      .toEqual({ code: expect.stringMatching(/^CUS-\d{4}$/), name: "Bismillah Store", owner_name: "Ali", whatsapp: "0301", city: "Lahore", credit_limit: "50000.00", order_taker_id: t.id });
    expect(await balance(id)).toBe("1250.50");
    expect(await rows(b.admin, "customer_statement", id, day(-30), today)).toMatchObject([
      { kind: "brought_forward", balance: "0.00" }, { kind: "opening", doc_no: expect.stringMatching(/^OB-/), debit: "1250.50", balance: "1250.50" }]);
    await expect(call(b.admin, "record_customer_note", json({ kind: "opening", customer_id: id, amount: "1" }))).rejects.toThrow(/already has an opening balance/);
    // Customers who paid in advance start with a credit.
    const advance = await call(b.admin, "save_customer", null, json({ name: "Advance", opening_balance: "-300.00" }));
    expect(await balance(advance)).toBe("-300.00");
    // Someone who may create customers but not adjust accounts cannot book one, and nothing is half saved.
    const role = one(await db.sql("insert into public.roles (code, name_en, name_ur) values ('shop_keeper', 'x', 'x') returning id")).id;
    for (const p of ["customers.view", "customers.manage"]) await db.sql("insert into public.role_permissions values ($1, $2)", [role, p]);
    const keeper = await db.createUser("shop_keeper");
    await expect(call(keeper, "save_customer", null, json({ name: "No Opening", opening_balance: "5" }))).rejects.toMatchObject({ code: "42501" });
    expect(await db.sql("select id from public.customers where name = 'No Opening'")).toEqual([]);
    expect(await call(keeper, "save_customer", null, json({ name: "Plain" }))).toBeTruthy();
    await invariants();
  });

  it("creates order takers with or without an existing employee", async () => {
    const id = await call(b.admin, "save_order_taker", null, json({ full_name: "Imran", phone: "0333", territory: "Model Town" }));
    await call(b.admin, "save_order_taker", id, json({ full_name: "Imran Khan", phone: "0334", status: "on_leave", territory: "DHA", is_active: false }));
    expect((await rows(b.admin, "list_order_takers")).find((r) => r.employee_id === id))
      .toMatchObject({ full_name: "Imran Khan", phone: "0334", territory: "DHA", employment_status: "on_leave", is_active: false });
    const viewer = await db.createUser("viewer");
    await expect(call(viewer, "save_order_taker", null, json({ full_name: "X" }))).rejects.toMatchObject({ code: "42501" });
    // Names are visible to people who sell; the employee record is not.
    expect((await rows(viewer, "list_order_takers")).length).toBeGreaterThan(0);
    expect(await db.as(viewer, (q) => q("select id from public.employees"))).toEqual([]);
  });

  it("limits order takers to their own customers, orders and ledgers", async () => {
    const t = await orderTaker();
    const mine = await customer(db, { orderTakerId: t.id });
    const other = await customer(db);
    await call(b.admin, "record_customer_note", json({ kind: "debit", customer_id: other, amount: "10.00", reason: "x" }));
    await call(b.admin, "record_customer_note", json({ kind: "debit", customer_id: mine, amount: "20.00", reason: "x" }));
    expect((await db.as(t.user, (q) => q("select id from public.customers"))).map((r) => r.id)).toEqual([mine]);
    expect((await db.as(t.user, (q) => q("select distinct customer_id from public.v_customer_ledger"))).map((r) => r.customer_id)).toEqual([mine]);
    expect((await db.as(t.user, (q) => q("select customer_id from public.customer_notes"))).map((r) => r.customer_id)).toEqual([mine]);
    expect((await rows(t.user, "customer_statement", mine, today, today)).at(-1)).toMatchObject({ balance: "20.00" });
    await expect(rows(t.user, "customer_statement", other, today, today)).rejects.toMatchObject({ code: "P0002" });
    await expect(call(t.user, "customer_summary", other)).rejects.toMatchObject({ code: "P0002" });
    const p = await product(db, b);
    const so = await saveOrder(t.user, mine, [{ product: p, qty: 2, price: "5.00" }], { order_taker_id: t.id });
    await expect(saveOrder(t.user, mine, [{ product: p, qty: 2, price: "5.00" }], { order_taker_id: null })).rejects.toMatchObject({ code: "42501" });
    await call(t.user, "submit_sales_order", so);
    // Once submitted it can no longer be changed by the order taker.
    await expect(saveOrder(t.user, mine, [{ product: p, qty: 1, price: "5.00" }], { order_taker_id: t.id }, so)).rejects.toMatchObject({ code: "P0002" });
    await expect(call(t.user, "approve_sales_order", so)).rejects.toMatchObject({ code: "42501" });
    // A user without an employee record matches nobody's orders, not those without an order taker.
    const unlinked = await db.createUser("order_taker");
    const office = await saveOrder(b.admin, mine, [{ product: p, qty: 1, price: "5.00" }]);
    await expect(call(unlinked, "submit_sales_order", office)).rejects.toMatchObject({ code: "P0002" });
    expect(await db.as(unlinked, (q) => q("select id from public.customers"))).toEqual([]);
    expect(await rows(unlinked, "report_sales", day(-30), today, "day")).toEqual([]);
    expect(await rows(unlinked, "collector_cash")).toEqual([]);
  });
});

describe("order to delivery to payment", () => {
  it("follows every step, partial delivery included, and the ledgers agree throughout", async () => {
    const t = await orderTaker();
    const p = await product(db, b);
    const p2 = await product(db, b);
    const c = await customer(db, { orderTakerId: t.id });
    await db.sql("update public.customers set payment_terms_days = 10 where id = $1", [c]);
    await openingStock(db, b, p, 500, "5.00");
    await openingStock(db, b, p2, 100, "20.00");
    const [first, second] = [p, p2].sort() as [string, string];
    const request = randomUUID();
    const draft = () => saveOrder(t.user, c, [{ product: p, unit: b.units.BOX, qty: 10, price: "100.00", discount: "50.00" }, { product: p2, qty: 4, price: "30.00" }], { order_taker_id: t.id, required_date: day(2), client_request_id: request });
    const so = await draft();
    expect(await draft()).toBe(so); // a repeated submit does not create a second order
    expect(one(await db.sql("select status, total_amount from public.sales_orders where id = $1", [so]))).toEqual({ status: "draft", total_amount: "1070.00" });
    await expect(call(b.admin, "approve_sales_order", so)).rejects.toThrow(/Only submitted orders/);

    await call(t.user, "submit_sales_order", so);
    await call(b.admin, "send_back_sales_order", so, "Discount too high");
    expect(one(await db.sql("select status, sent_back_reason from public.sales_orders where id = $1", [so]))).toEqual({ status: "draft", sent_back_reason: "Discount too high" });
    await saveOrder(t.user, c, [{ product: p, unit: b.units.BOX, qty: 10, price: "100.00", discount: "10.00" }, { product: p2, qty: 4, price: "30.00" }], { order_taker_id: t.id, required_date: day(2) }, so);
    await call(t.user, "submit_sales_order", so);
    // An approver may correct a submitted order.
    await saveOrder(b.admin, c, [{ product: p, unit: b.units.BOX, qty: 10, price: "100.00", discount: "10.00" }, { product: p2, qty: 5, price: "30.00" }], { order_taker_id: t.id, required_date: day(2) }, so);
    await call(b.admin, "approve_sales_order", so);
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 500, reserved: 120 });

    const delivery0 = await call(b.admin, "save_delivery", so, json({ date: today }), json([{ sales_order_item_id: (await items(so))[0]!.id, quantity: 1 }]));
    await expect(call(b.admin, "dispatch_delivery", delivery0)).rejects.toThrow(/start picking/);
    await db.as(b.admin, (q) => q("delete from public.deliveries where id = $1", [delivery0]));
    await call(b.admin, "start_picking", so);
    await expect(call(b.admin, "start_picking", so)).rejects.toThrow(/Only approved orders/);
    expect(await status(so)).toBe("picking");

    const before = { ar: await gl("AR"), sales: await gl("SALES"), cogs: await gl("COGS") };
    const qty = { [p]: 10, [p2]: 5 };
    const d1 = await dispatch(so, [first, second].map((x) => (x === p ? 6 : 0)));
    expect(await status(so)).toBe("partially_dispatched");
    expect(one(await db.sql("select total_amount, due_date::text from public.sales_invoices where id = $1", [d1.invoice]))).toEqual({ total_amount: "594.00", due_date: day(10) });
    expect([await gl("AR") - before.ar, await gl("SALES") - before.sales, await gl("COGS") - before.cogs]).toEqual([59400, -59400, 36000]);
    await call(b.admin, "complete_delivery", d1.delivery, json({ received_by: "Ali", notes: "ok" }), "[]");
    expect(await status(so)).toBe("partially_dispatched");
    const d2 = await dispatch(so, [first, second].map((x) => qty[x]! - (x === p ? 6 : 0)));
    expect(await status(so)).toBe("dispatched");
    await expect(call(b.admin, "cancel_sales_order", so, "x")).rejects.toThrow(/close the remaining quantity/);
    await call(b.admin, "complete_delivery", d2.delivery, "{}", "[]");
    expect(await status(so)).toBe("delivered");
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 380, reserved: 0 });
    expect(await balance(c)).toBe("1140.00");

    const p1 = await pay(b.admin, c, "594.00", [[d1.invoice, "594.00"]], { collected_by: t.id, reference: "R-1" });
    expect(await status(so)).toBe("delivered");
    const pay2 = await pay(b.admin, c, "600.00", [[d2.invoice, "546.00"]], { method: "bank_transfer", financial_account_id: bank });
    expect(await status(so)).toBe("completed");
    expect(await balance(c)).toBe("-54.00"); // 54.00 stays on account
    // Voiding a payment reopens the order; paying again completes it.
    await call(b.admin, "void_customer_payment", p1, "bounced");
    expect(await status(so)).toBe("delivered");
    await pay(b.admin, c, "540.00", [[d1.invoice, "540.00"]]);
    expect(await status(so)).toBe("delivered");
    // All or nothing: the second line is too high, so the first is not settled either.
    await expect(call(b.admin, "settle_invoices", pay2, json([{ invoice_id: d1.invoice, amount: "50.00" }, { invoice_id: d1.invoice, amount: "50.00" }]))).rejects.toThrow(/exceeds/);
    expect(await outstanding(d1.invoice)).toBe("54.00");
    await call(b.admin, "settle_invoices", pay2, json([{ invoice_id: d1.invoice, amount: "54.00" }]));
    expect(await status(so)).toBe("completed");
    expect(await balance(c)).toBe("0.00");
    expect((await rows(b.admin, "customer_statement", c, today, today)).map((r) => r.kind)).toEqual(
      ["brought_forward", "sales_invoice", "sales_invoice", "customer_payment", "customer_payment", "customer_payment", "customer_payment"]);
    await invariants();
  });

  it("takes goods refused at the door back into stock and credits the invoice", async () => {
    const p = await product(db, b, { taxRate: 17 });
    const c = await customer(db);
    await openingStock(db, b, p, 100, "7.00");
    const so = await picking(c, [{ product: p, unit: b.units.BOX, qty: 3, price: "99.99", discount: "10.00" }]);
    const { delivery, invoice } = await dispatch(so);
    const total = one(await db.sql("select total_amount from public.sales_invoices where id = $1", [invoice])).total_amount;
    const di = one(await db.sql("select id from public.delivery_items where delivery_id = $1", [delivery])).id;
    const dispatcher = await db.createUser("warehouse");
    await db.sql("delete from public.role_permissions where permission_code = 'sales.return' and role_id = (select id from public.roles where code = 'warehouse')");
    await expect(call(dispatcher, "complete_delivery", delivery, "{}", json([{ delivery_item_id: di, quantity: 1 }]))).rejects.toMatchObject({ code: "42501" });
    await expect(call(b.admin, "complete_delivery", delivery, "{}", json([{ delivery_item_id: di, quantity: 4 }]))).rejects.toThrow(/returned_within_dispatched|exceeds/);
    await call(b.admin, "complete_delivery", delivery, json({ received_by: "Shop" }), json([{ delivery_item_id: di, quantity: 1, condition: "saleable" }, { delivery_item_id: di, quantity: 1, condition: "damaged" }]));
    expect([(await stock(db, p, b.mainWarehouse)).onHand, (await stock(db, p, b.damagedWarehouse)).onHand]).toEqual([76, 12]);
    const back = one(await db.sql("select total_amount from public.customer_returns where delivery_id = $1", [delivery])).total_amount;
    expect(paisa(await outstanding(invoice))).toBe(paisa(total) - paisa(back));
    expect(await status(so)).toBe("delivered");
    expect((await rows(b.admin, "report_deliveries", today, today, "delivered")).find((r) => r.delivery_id === delivery))
      .toMatchObject({ dispatched_quantity: "36", returned_quantity: "24", received_by: "Shop", returned_amount: back });
    // The last box comes back later: the three credits are the invoice to the paisa, so nothing is left to pay.
    const item = one(await db.sql("select id from public.sales_invoice_items where sales_invoice_id = $1", [invoice])).id;
    const r = await call(b.admin, "save_customer_return", null, json({ customer_id: c, sales_invoice_id: invoice, warehouse_id: b.mainWarehouse, date: today }), json([{ sales_invoice_item_id: item, product_id: p, unit_id: b.units.PCS, quantity: 12, unit_price: 0 }]));
    await call(b.admin, "post_customer_return", r);
    expect(await outstanding(invoice)).toBe("0.00");
    expect(await balance(c)).toBe("0.00");
    expect(await status(so)).toBe("completed");
    expect(one(await db.sql("select sum(cost_total)::text c from public.customer_returns where customer_id = $1", [c])).c).toBe(one(await db.sql("select cost_total::text c from public.sales_invoices where id = $1", [invoice])).c);
    await invariants();
  });

  it("credits partial returns in any unit to the paisa", async () => {
    const p = await product(db, b, { taxRate: 17.5 });
    const c = await customer(db);
    await openingStock(db, b, p, 720, "1.37");
    for (const [qty, price, discount] of [[1, "1000.01", "33.33"], [2, "77.77", "0.01"]] as const) {
      const so = await picking(c, [{ product: p, unit: b.units.CTN, qty, price, discount }]);
      const { delivery, invoice } = await dispatch(so);
      await call(b.admin, "complete_delivery", delivery, "{}", "[]");
      const item = one(await db.sql("select id from public.sales_invoice_items where sales_invoice_id = $1", [invoice])).id;
      let left = qty * 72;
      for (const part of [1, 5, 7, 13, 29]) {
        left -= part;
        const r = await call(b.admin, "save_customer_return", null, json({ customer_id: c, sales_invoice_id: invoice, warehouse_id: b.mainWarehouse, damaged_warehouse_id: b.damagedWarehouse, date: today }),
          json([{ sales_invoice_item_id: item, product_id: p, unit_id: b.units.PCS, quantity: part, condition: part % 2 ? "saleable" : "damaged" }]));
        await call(b.admin, "post_customer_return", r);
      }
      const r = await call(b.admin, "save_customer_return", null, json({ customer_id: c, sales_invoice_id: invoice, warehouse_id: b.mainWarehouse, damaged_warehouse_id: b.damagedWarehouse, date: today }),
        json([{ sales_invoice_item_id: item, product_id: p, unit_id: b.units.PCS, quantity: left - 3 }, { sales_invoice_item_id: item, product_id: p, unit_id: b.units.PCS, quantity: 3, condition: "damaged" }]));
      await call(b.admin, "post_customer_return", r);
      expect(await outstanding(invoice)).toBe("0.00");
    }
    expect(await balance(c)).toBe("0.00");
    await invariants();
  });

  it("closes a partly delivered order, cancels an untouched one, and frees the stock", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 100, "2.00");
    const so = await picking(c, [{ product: p, qty: 50, price: "4.00" }]);
    await expect(call(b.admin, "close_sales_order", so, "x")).rejects.toThrow(/Only partly dispatched/);
    const { delivery, invoice } = await dispatch(so, [20]);
    await expect(call(b.admin, "close_sales_order", so, " ")).rejects.toThrow(/reason is required/);
    await call(b.admin, "close_sales_order", so, "Out of stock");
    expect([await status(so), (await stock(db, p, b.mainWarehouse)).reserved]).toEqual(["dispatched", 0]);
    await call(b.admin, "complete_delivery", delivery, "{}", "[]");
    await pay(b.admin, c, "80.00", [[invoice, "80.00"]]);
    expect(await status(so)).toBe("completed");
    const other = await picking(c, [{ product: p, qty: 30, price: "4.00" }]);
    await call(b.admin, "cancel_sales_order", other, "Shop closed");
    expect(one(await db.sql("select status, cancel_reason from public.sales_orders where id = $1", [other]))).toEqual({ status: "cancelled", cancel_reason: "Shop closed" });
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 80, reserved: 0 });
    await invariants();
  });

  it("lets the assigned driver, and no other, confirm a delivery", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 10, "2.00");
    const [e1, e2] = [await employee(db), await employee(db)];
    const [u1, u2] = [await db.createUser("driver", { employeeId: e1 }), await db.createUser("driver", { employeeId: e2 })];
    const driver = one(await db.sql("insert into public.drivers (employee_id) values ($1) returning id", [e1])).id;
    await db.sql("insert into public.drivers (employee_id) values ($1)", [e2]);
    const so = await picking(c, [{ product: p, qty: 5, price: "4.00" }]);
    const { delivery } = await dispatch(so, undefined, { driver_id: driver });
    expect((await db.as(u1, (q) => q("select o.doc_no, c.name from public.deliveries d join public.sales_orders o on o.id = d.sales_order_id join public.customers c on c.id = o.customer_id"))).length).toBe(1);
    expect(await db.as(u2, (q) => q("select id from public.customers"))).toEqual([]);
    expect((await db.as(u1, (q) => q("select p.name_en, u.name_en from public.delivery_items i join public.sales_order_items s on s.id = i.sales_order_item_id join public.products p on p.id = s.product_id join public.units u on u.id = s.unit_id"))).length).toBe(1);
    expect(await db.as(u2, (q) => q("select id from public.delivery_items"))).toEqual([]);
    await expect(call(u2, "complete_delivery", delivery, "{}", "[]")).rejects.toMatchObject({ code: "42501" });
    await call(u1, "complete_delivery", delivery, json({ received_by: "Ali" }), "[]");
    expect(one(await db.sql("select status, received_by from public.deliveries where id = $1", [delivery]))).toEqual({ status: "delivered", received_by: "Ali" });
  });

  it("counts picked orders against the credit limit, even when two are approved at once", async () => {
    const p = await product(db, b);
    const c = await customer(db, { creditLimit: "1000.00" });
    await openingStock(db, b, p, 1000, "1.00");
    await picking(c, [{ product: p, qty: 60, price: "10.00" }]);
    const next = await Promise.all([1, 2].map(async () => {
      const so = await saveOrder(b.admin, c, [{ product: p, qty: 30, price: "10.00" }]);
      await call(b.admin, "submit_sales_order", so);
      return so;
    }));
    const results = await Promise.allSettled(next.map((so) => call(b.admin, "approve_sales_order", so)));
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    const summary = one(await db.as(b.admin, (q) => q("select public.customer_summary($1) r", [c]))).r as Row;
    expect(summary).toMatchObject({ open_orders: "900.00", credit_available: "100.00", balance: "0.00" });
  });
});

describe("collections and cash held by order takers", () => {
  it("posts an order taker's cash at once, holds it in their name, and clears it on deposit", async () => {
    const t = await orderTaker();
    const c = await customer(db, { orderTakerId: t.id });
    const stranger = await customer(db);
    const p = await product(db, b);
    await openingStock(db, b, p, 100, "3.00");
    const so = await picking(c, [{ product: p, qty: 100, price: "10.00" }], { order_taker_id: t.id });
    const { delivery, invoice } = await dispatch(so);
    await call(b.admin, "complete_delivery", delivery, "{}", "[]");

    const request = randomUUID();
    const collect = () => pay(t.user, c, "400.00", [[invoice, "400.00"]], { financial_account_id: null, client_request_id: request, collected_by: b.admin });
    const id = await collect();
    expect(await collect()).toBe(id);
    expect(one(await db.sql("select status, collected_by, financial_account_id from public.customer_payments where id = $1", [id]))).toEqual({ status: "posted", collected_by: t.id, financial_account_id: null });
    expect([await held(t.id), await outstanding(invoice), await balance(c)]).toEqual(["400.00", "600.00", "600.00"]);
    await expect(pay(t.user, stranger, "1.00", [], { financial_account_id: null })).rejects.toMatchObject({ code: "P0002" });
    await expect(pay(t.user, c, "700.00", [[invoice, "700.00"]], { financial_account_id: null })).rejects.toThrow(/invoice balance/);
    await expect(pay(t.user, c, "5.00", [], { financial_account_id: null, method: "cheque" })).rejects.toThrow(/Choose the account/);

    // A bank transfer reported by the order taker waits for the office.
    const transfer = await pay(t.user, c, "500.00", [[invoice, "500.00"]], { method: "bank_transfer", financial_account_id: bank, reference: "TRX-1" });
    expect(one(await db.sql("select status from public.customer_payments where id = $1", [transfer])).status).toBe("draft");
    expect(await outstanding(invoice)).toBe("600.00");
    await expect(call(t.user, "post_customer_payment", transfer)).rejects.toMatchObject({ code: "42501" });
    await call(b.admin, "post_customer_payment", transfer);
    expect(await outstanding(invoice)).toBe("100.00");

    const deposit = await call(t.user, "record_cash_deposit", json({ amount: "250.00", financial_account_id: cash, date: today, reference: "Slip 1" }));
    expect([one(await db.sql("select status from public.cash_deposits where id = $1", [deposit])).status, await held(t.id)]).toEqual(["draft", "400.00"]);
    expect((await rows(t.user, "collector_cash"))).toMatchObject([{ employee_id: t.id, held: "400.00", waiting_deposits: "250.00" }]);
    await expect(call(t.user, "post_cash_deposit", deposit)).rejects.toMatchObject({ code: "42501" });
    await call(b.admin, "post_cash_deposit", deposit);
    expect(await held(t.id)).toBe("150.00");
    await expect(call(b.admin, "record_cash_deposit", json({ employee_id: t.id, amount: "150.01", financial_account_id: bank }))).rejects.toThrow(/exceeds the cash held/);
    await expect(call(b.admin, "void_customer_payment", id, "mistake")).rejects.toThrow(/already deposited/);

    await call(b.admin, "reconcile_collector_cash", t.id, "140.00", "Ten short");
    expect((await rows(b.admin, "collector_cash")).find((r) => r.employee_id === t.id)).toMatchObject({ held: "150.00", last_counted: "140.00", last_difference: "-10.00" });
    const second = await call(b.admin, "record_cash_deposit", json({ employee_id: t.id, amount: "150.00", financial_account_id: bank }));
    expect(await held(t.id)).toBe("0.00");
    await call(b.admin, "void_cash_deposit", second, "Wrong account");
    expect((await rows(t.user, "collector_statement", t.id, today, today)).map((r) => [r.kind, r.is_reversal, r.received, r.handed_over, r.balance])).toEqual([
      ["customer_payment", false, "400.00", "0.00", "400.00"], ["cash_deposit", false, "0.00", "250.00", "150.00"],
      ["cash_deposit", false, "0.00", "150.00", "0.00"], ["cash_deposit", true, "150.00", "0.00", "150.00"]]);
    await invariants();
  });

  it("never lets two deposits hand over the same cash", async () => {
    const t = await orderTaker();
    const c = await customer(db, { orderTakerId: t.id });
    await pay(t.user, c, "100.00", [], { financial_account_id: null });
    const drafts = await Promise.all([1, 2, 3].map(() => call(t.user, "record_cash_deposit", json({ amount: "60.00", financial_account_id: cash }))));
    const results = await Promise.allSettled(drafts.map((d) => call(b.admin, "post_cash_deposit", d)));
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    expect(await held(t.id)).toBe("40.00");
    await invariants();
  });

  it("keeps data entry collections as drafts and refuses cash nobody holds", async () => {
    const entry = await db.createUser("data_entry");
    const t = await orderTaker();
    const c = await customer(db);
    await expect(pay(entry, c, "10.00", [], { financial_account_id: null })).rejects.toThrow(/order taker who holds the cash/);
    const id = await pay(entry, c, "10.00", [], { financial_account_id: null, collected_by: t.id });
    expect([one(await db.sql("select status from public.customer_payments where id = $1", [id])).status, await held(t.id)]).toEqual(["draft", "0.00"]);
    await call(b.admin, "post_customer_payment", id);
    expect(await held(t.id)).toBe("10.00");
    await expect(rows(entry, "collector_statement", t.id, today, today)).rejects.toMatchObject({ code: "42501" });
    await invariants();
  });
});

describe("credit notes and debit notes", () => {
  it("adjust the customer, net sales and one invoice, and can be voided", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 10, "5.00");
    const so = await picking(c, [{ product: p, qty: 10, price: "10.00" }]);
    const { delivery, invoice } = await dispatch(so);
    await call(b.admin, "complete_delivery", delivery, "{}", "[]");
    const before = { returns: await gl("SALES_RETURNS"), sales: await gl("SALES") };
    const cn = await call(b.admin, "record_customer_note", json({ kind: "credit", customer_id: c, sales_invoice_id: invoice, amount: "30.00", reason: "Price allowance" }));
    expect([await outstanding(invoice), await gl("SALES_RETURNS") - before.returns]).toEqual(["70.00", 3000]);
    await expect(call(b.admin, "record_customer_note", json({ kind: "credit", customer_id: c, sales_invoice_id: invoice, amount: "70.01", reason: "x" }))).rejects.toThrow(/exceeds the invoice balance/);
    await expect(call(b.admin, "record_customer_note", json({ kind: "credit", customer_id: c, amount: "5.00" }))).rejects.toThrow(/reason is required/);
    const dn = await call(b.admin, "record_customer_note", json({ kind: "debit", customer_id: c, amount: "15.00", reason: "Undercharged" }));
    expect([await balance(c), await gl("SALES") - before.sales]).toEqual(["85.00", -1500]);
    expect(one(await db.as(b.admin, (q) => q("select outstanding, credited_amount, payment_status from public.v_sales_invoice_balances where sales_invoice_id = $1", [invoice]))))
      .toEqual({ outstanding: "70.00", credited_amount: "30.00", payment_status: "partially_paid" });
    await pay(b.admin, c, "70.00", [[invoice, "70.00"]]);
    expect(await status(so)).toBe("completed");
    await call(b.admin, "void_customer_note", cn, "Wrong shop");
    expect([await status(so), await outstanding(invoice), await balance(c)]).toEqual(["delivered", "30.00", "45.00"]);
    await call(b.admin, "void_customer_note", dn, "Wrong");
    await expect(call(b.admin, "void_customer_note", dn, "Again")).rejects.toThrow(/Only posted notes/);
    const viewer = await db.createUser("viewer");
    // Without receivables a viewer learns nothing about payments; a collector sees the real figure, not only their own payments.
    const seen = async (u: string) => one(await db.as(u, (q) => q("select paid_amount, outstanding, payment_status from public.v_sales_invoice_balances where sales_invoice_id = $1", [invoice])));
    expect(await seen(viewer)).toEqual({ paid_amount: null, outstanding: null, payment_status: null });
    expect(await seen(await db.createUser("data_entry"))).toEqual({ paid_amount: "70.00", outstanding: "30.00", payment_status: "partially_paid" });
    await expect(call(viewer, "record_customer_note", json({ kind: "credit", customer_id: c, amount: "5", reason: "x" }))).rejects.toMatchObject({ code: "42501" });
    await invariants();
  });
});

describe("reports", () => {
  it("agree with the ledgers", async () => {
    const [from, to] = [day(-400), today];
    const ledger = await gl("SALES") + await gl("SALES_RETURNS");
    const sum = (list: Row[], k: string) => list.reduce((n, r) => n + paisa(r[k]), 0);
    const daily = await rows(b.admin, "report_sales", from, to, "day");
    expect(sum(daily, "net_sales")).toBe(-ledger);
    const monthly = await rows(b.admin, "report_sales", from, to, "month");
    for (const k of ["gross", "discounts", "net", "tax", "returns", "credit_notes", "debit_notes", "net_sales", "collected"]) expect(sum(monthly, k)).toBe(sum(daily, k));
    for (const r of daily) expect(paisa(r.gross) - paisa(r.discounts)).toBe(paisa(r.net));
    expect(sum(await rows(b.admin, "report_sales_by_customer", from, to, null), "net_sales")).toBe(-ledger);
    const notes = one(await db.sql("select coalesce(sum(case when kind = 'debit' then amount else -amount end), 0) v from public.customer_notes where status = 'posted' and kind <> 'opening'")).v;
    expect(sum(await rows(b.admin, "report_sales_by_product", from, to, null), "net_sales")).toBe(-ledger - paisa(notes));
    const receivables = await rows(b.admin, "report_receivables", to, null);
    expect(sum(receivables, "balance")).toBe(await gl("AR"));
    for (const r of receivables) expect(paisa(r.days_30) + paisa(r.days_60) + paisa(r.days_90) + paisa(r.older) - paisa(r.advance)).toBe(paisa(r.balance));
    const collections = await rows(b.admin, "report_collections", from, to, null, null);
    expect(sum(collections, "amount")).toBe(sum(daily, "collected"));
    for (const r of collections) expect(paisa(r.settled) + paisa(r.on_account)).toBe(paisa(r.amount));
    const takers = await rows(b.admin, "report_order_takers", from, to);
    expect(sum(takers, "cash_held")).toBe(await gl("CASH_WITH_COLLECTORS"));
  });

  it("age debts by the oldest unpaid first and ignore voided payments", async () => {
    const c = await customer(db);
    const at = (amount: string, d: string) => call(b.admin, "record_customer_note", json({ kind: "debit", customer_id: c, amount, reason: "x", date: d }));
    await at("100.00", day(-120));
    await at("50.00", day(-70));
    await at("40.00", day(-45));
    await at("30.00", day(-5));
    await pay(b.admin, c, "120.00", [], { date: day(-4) });
    const wrong = await pay(b.admin, c, "90.00", [], { date: day(-3) });
    await call(b.admin, "void_customer_payment", wrong, "x");
    const row = async (asOf: string) => (await rows(b.admin, "report_receivables", asOf, null)).find((r) => r.customer_id === c);
    expect(await row(today)).toMatchObject({ balance: "100.00", days_30: "30.00", days_60: "40.00", days_90: "30.00", older: "0", advance: "0" });
    // Before the payment, everything was still open.
    expect(await row(day(-5))).toMatchObject({ balance: "220.00", older: "100.00", days_90: "50.00" });
    // While it stood, the payment that was voided later counted.
    expect(await row(day(-1))).toMatchObject({ balance: "10.00", days_30: "10.00" });
  });

  it("show order takers only their own figures", async () => {
    const t = await orderTaker();
    const c = await customer(db, { orderTakerId: t.id });
    const p = await product(db, b);
    await openingStock(db, b, p, 50, "2.00");
    const so = await picking(c, [{ product: p, qty: 10, price: "7.00" }], { order_taker_id: t.id });
    const { delivery, invoice } = await dispatch(so);
    await call(b.admin, "complete_delivery", delivery, "{}", "[]");
    await pay(t.user, c, "70.00", [[invoice, "70.00"]], { financial_account_id: null });
    const cancelled = await approved(c, [{ product: p, qty: 1, price: "7.00" }], { order_taker_id: t.id });
    await call(b.admin, "cancel_sales_order", cancelled, "x");
    expect(await rows(t.user, "report_sales", today, today, "day")).toMatchObject([{ invoices: "1", net_sales: "70.00", collected: "70.00" }]);
    expect((await rows(t.user, "report_sales_by_customer", today, today, null)).map((r) => r.customer_id)).toEqual([c]);
    expect(await rows(t.user, "report_order_takers", today, today)).toMatchObject([
      { employee_id: t.id, customers: "1", orders: "2", delivered_orders: "1", cancelled_orders: "1", total_sales: "70.00", collected: "70.00", cash_held: "70.00", pending_collections: "0.00" }]);
    expect((await rows(t.user, "report_deliveries", today, today, null)).map((r) => r.delivery_id)).toEqual([delivery]);
    expect((await rows(t.user, "report_collections", today, today, null, null)).length).toBe(1);
    expect(one(await db.as(t.user, (q) => q("select public.sales_summary() r"))).r).toMatchObject({ today: "70.00", collected_month: "70.00" });
    const viewer = await db.createUser("viewer");
    await expect(rows(viewer, "report_receivables", today, null)).rejects.toMatchObject({ code: "42501" });
    await expect(rows(viewer, "report_collections", today, today, null, null)).rejects.toMatchObject({ code: "42501" });
    for (const r of await rows(viewer, "report_sales_by_customer", day(-30), today, null)) expect([r.balance, r.collected]).toEqual([null, null]);
    const driver = await db.createUser("driver");
    expect(await rows(driver, "report_sales", day(-30), today, "day")).toEqual([]);
  });

  it("limit the dashboard's receivables to people who work with every customer", async () => {
    const t = await orderTaker();
    const position = async (u: string) => one(await db.as(u, (q) => q("select public.dashboard_position() r"))).r as Row;
    expect(await position(t.user)).not.toHaveProperty("receivables");
    expect(await position(b.admin)).toHaveProperty("receivables");
  });
});

describe("any sequence of documents", () => {
  it("keeps stock, reservations, receivables, held cash and order states consistent", async () => {
    let seed = Number(process.env.SEED ?? 20261126);
    const rnd = (n: number) => {
      seed = (seed + 0x6d2b79f5) | 0;
      let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) % n;
    };
    const takers = [await orderTaker(), await orderTaker()];
    const customers = await Promise.all(takers.flatMap((t) => [1, 2].map(async () => ({ id: await customer(db, { orderTakerId: t.id, ...(rnd(2) ? { creditLimit: "5000.00" } : {}) }), taker: t }))));
    const products = await Promise.all([0, 17, 5.5].map((taxRate) => product(db, b, { taxRate })));
    for (const p of products) await openingStock(db, b, p, 2000, `${2 + rnd(9)}.${10 + rnd(80)}`);
    const pick = async (sql: string, params: unknown[] = []) => {
      const list = await db.sql(sql, params);
      return list.length ? (list[rnd(list.length)]!.id as string) : null;
    };
    const mine = "customer_id = any($1)";
    const ids = [customers.map((x) => x.id)];
    let done = 0;
    let refused = 0;
    for (let i = 0; i < 500; i++) {
      const c = customers[rnd(customers.length)]!;
      const money = (max: number) => `${1 + rnd(max)}.${String(rnd(100)).padStart(2, "0")}`;
      try {
        switch (rnd(13)) {
          case 0: case 1: {
            const so = await saveOrder(c.taker.user, c.id, products.slice(0, 1 + rnd(3)).map((p) => {
              const unit = [b.units.PCS, b.units.BOX][rnd(2)]!;
              const qty = 1 + rnd(8);
              const price = money(90);
              return { product: p, unit, qty, price, discount: rnd(2) ? ((paisa(price) * qty * rnd(40)) / 10000).toFixed(2) : "0" };
            }), { order_taker_id: c.taker.id });
            await call(c.taker.user, "submit_sales_order", so);
            if (rnd(5)) await call(b.admin, "approve_sales_order", so, rnd(2) === 1);
            else await call(b.admin, "send_back_sales_order", so, "x");
            break;
          }
          case 2: { const so = await pick(`select id from public.sales_orders where status = 'approved' and ${mine}`, ids); if (so) await call(b.admin, "start_picking", so); break; }
          case 3: case 4: {
            const so = await pick(`select id from public.sales_orders where status::text in ('picking', 'partially_dispatched') and ${mine}`, ids);
            if (so) {
              const left = await db.sql("select ((base_quantity - dispatched_base_quantity) / factor)::int q from public.sales_order_items where sales_order_id = $1 order by product_id, id", [so]);
              await dispatch(so, left.map((l) => (rnd(3) ? Number(l.q) : rnd(Number(l.q) + 2))));
            }
            break;
          }
          case 5: case 6: {
            const d = await pick(`select d.id from public.deliveries d join public.sales_orders o on o.id = d.sales_order_id where d.status = 'dispatched' and o.${mine}`, ids);
            if (d) {
              const lines = await db.sql("select id, quantity::int q from public.delivery_items where delivery_id = $1", [d]);
              await call(b.admin, "complete_delivery", d, "{}", json(rnd(3) ? [] : lines.map((l) => ({ delivery_item_id: l.id, quantity: 1 + rnd(Number(l.q) + 1), condition: rnd(2) ? "saleable" : "damaged" }))));
            }
            break;
          }
          case 7: case 8: {
            const inv = await pick(`select i.id from public.sales_invoices i where i.status = 'posted' and private.sales_invoice_outstanding(i.id) > 0 and i.customer_id = $1`, [c.id]);
            const due = inv ? String(await outstanding(inv)) : "0";
            const amount = inv && rnd(2) ? due : money(400);
            const settle: [string, string][] = inv ? [[inv, paisa(amount) < paisa(due) ? amount : due]] : [];
            if (rnd(2)) await pay(c.taker.user, c.id, amount, settle, { financial_account_id: null });
            else await pay(b.admin, c.id, amount, settle, { method: "bank_transfer", financial_account_id: bank });
            break;
          }
          case 9: {
            const item = one(await db.sql("select ii.id, ii.product_id, ii.sales_invoice_id inv, i.customer_id from public.sales_invoice_items ii join public.sales_invoices i on i.id = ii.sales_invoice_id and i.status = 'posted' where i.customer_id = any($1) order by md5(ii.id::text || $2) limit 1", [ids[0], String(i)]).then((r) => (r.length ? r : [{}])));
            if (item.id) {
              const r = await call(b.admin, "save_customer_return", null, json({ customer_id: item.customer_id, sales_invoice_id: item.inv, warehouse_id: b.mainWarehouse, damaged_warehouse_id: b.damagedWarehouse, date: today }),
                json([{ sales_invoice_item_id: item.id, product_id: item.product_id, unit_id: b.units.PCS, quantity: 1 + rnd(6), condition: rnd(2) ? "saleable" : "damaged" }]));
              await call(b.admin, "post_customer_return", r);
            }
            break;
          }
          case 10: await call(b.admin, "record_cash_deposit", json({ employee_id: c.taker.id, amount: money(300), financial_account_id: [cash, bank][rnd(2)] })); break;
          case 11: {
            const inv = await pick(`select id from public.sales_invoices where status = 'posted' and customer_id = $1`, [c.id]);
            await call(b.admin, "record_customer_note", json({ kind: rnd(2) ? "credit" : "debit", customer_id: c.id, amount: money(40), reason: "x", ...(rnd(2) && inv ? { sales_invoice_id: inv } : {}) }));
            break;
          }
          default: {
            const what = rnd(4);
            if (what === 0) { const x = await pick(`select id from public.customer_payments where status = 'posted' and ${mine}`, ids); if (x) await call(b.admin, "void_customer_payment", x, "x"); }
            else if (what === 1) { const x = await pick(`select id from public.customer_notes where status = 'posted' and ${mine}`, ids); if (x) await call(b.admin, "void_customer_note", x, "x"); }
            else if (what === 2) { const x = await pick(`select id from public.sales_orders where status::text in ('submitted', 'approved', 'picking') and ${mine}`, ids); if (x) await call(b.admin, "cancel_sales_order", x, "x"); }
            else { const x = await pick(`select id from public.sales_orders where status = 'partially_dispatched' and ${mine}`, ids); if (x) await call(b.admin, "close_sales_order", x, "x"); }
          }
        }
        done++;
      } catch (error) {
        // Refusing is right for many random inputs; anything that is not a rule is a defect.
        if (!["23514", "22023", "P0002", "42501"].includes((error as { code?: string }).code ?? "")) throw error;
        refused++;
      }
      if (i % 50 === 49) await invariants();
    }
    expect(done).toBeGreaterThan(300);
    expect(refused).toBeGreaterThan(0);
    const states = await db.sql(`select status::text s, count(*)::int n from public.sales_orders where ${mine} group by 1`, ids);
    for (const s of ["completed", "delivered", "cancelled"]) expect(states.map((x) => x.s)).toContain(s);
    await invariants();
    const [from, to] = [day(-400), today];
    const sum = (list: Row[], k: string) => list.reduce((n, r) => n + paisa(r[k]), 0);
    expect(sum(await rows(b.admin, "report_sales", from, to, "day"), "net_sales")).toBe(-(await gl("SALES") + await gl("SALES_RETURNS")));
    expect(sum(await rows(b.admin, "report_receivables", to, null), "balance")).toBe(await gl("AR"));
  }, 120_000);
});
