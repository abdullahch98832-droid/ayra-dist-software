// Orders of distributors of other cities: the call, the goods from Ayra at their own price, supply, payment and profit.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, one, type TestDb } from "./helpers";
import { basics, cashAccount, customer, glBalance, openingStock, product, type Basics } from "./fixtures";

let db: TestDb;
let b: Basics;
let cash: string;
let ayra: string;
beforeAll(async () => {
  db = await createTestDb();
  b = await basics(db);
  cash = await cashAccount(db);
  ayra = one(await db.sql("select id from public.suppliers where is_principal")).id as string;
});
afterAll(() => db.close());

const json = (v: unknown) => JSON.stringify(v);
const call = async (user: string, fn: string, ...args: unknown[]) => one(await db.as(user, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args))).r as string;
const paisa = (v: unknown) => Math.round(Number(v) * 100);
const gl = async (key: string) => paisa(await glBalance(db, key));
interface Line { product_id: string; unit_id: string; quantity: number; unit_price: string; unit_cost?: string }
const save = (user: string, c: string, lines: Line[], id: string | null = null) => call(user, "save_sol_order", id, json({ customer_id: c, contact_name: "Caller", contact_phone: "03001234567", address: "Multan", client_request_id: id ? null : randomUUID() }), json(lines));
const confirm = (job: string) => call(b.admin, "set_sol_job_status", job, "confirmed");
const order = async (c: string, lines: Line[]) => { const job = await save(b.admin, c, lines); await confirm(job); return job; };
const line = (p: string, quantity: number, price: string): Line => ({ product_id: p, unit_id: b.units.PCS, quantity, unit_price: price });
const buy = (user: string, job: string, lines: Line[], request = randomUUID()) => call(user, "order_sol_goods", job, json({ warehouse_id: b.mainWarehouse, client_request_id: request }), json(lines));
async function receive(po: string, quantities: Record<string, number>) {
  return db.as(b.admin, async (q) => {
    if (one(await q("select status::text s from public.purchase_orders where id = $1", [po])).s === "draft") await q("select public.approve_purchase_order($1)", [po]);
    const g = one(await q("insert into public.goods_receipts (supplier_id, purchase_order_id, warehouse_id) values ($1, $2, $3) returning id", [ayra, po, b.mainWarehouse])).id;
    for (const i of await q("select id, product_id, unit_id, unit_price from public.purchase_order_items where purchase_order_id = $1", [po])) {
      const n = quantities[String(i.product_id)];
      if (n) await q("insert into public.goods_receipt_items (goods_receipt_id, purchase_order_item_id, product_id, unit_id, quantity, unit_cost) values ($1, $2, $3, $4, $5, $6)", [g, i.id, i.product_id, i.unit_id, n, i.unit_price]);
    }
    await q("select public.post_goods_receipt($1)", [g]);
  });
}
async function supply(job: string, quantities: number[]) {
  const items = await db.sql("select id from public.sol_job_items where sol_job_id = $1 order by line_no", [job]);
  const d = await call(b.admin, "save_sol_delivery", null, job, json({ destination: "Multan", warehouse_id: b.mainWarehouse }), json(items.map((i, n) => ({ job_item_id: i.id, quantity: quantities[n] ?? 0 }))));
  await call(b.admin, "dispatch_sol_delivery", d);
  await call(b.admin, "complete_sol_delivery", d, json({ received_by: "Store" }), json([]));
  return d;
}
const report = async (job: string, user = b.admin) => one(await db.as(user, (q) => q("select * from public.report_sol_orders(null, null, null, $1)", [job])));
const value = async (p: string) => one(await db.sql("select quantity::int q, total_value::numeric(18,2)::text v from public.inventory_valuation where product_id = $1", [p]));
async function sound() {
  expect(await gl("INVENTORY")).toBe(paisa(one(await db.sql("select coalesce(sum(total_value), 0) v from public.inventory_valuation")).v));
  expect(Number(one(await db.sql("select coalesce(sum(debit - credit), 0) v from public.journal_entry_lines")).v)).toBe(0);
  for (const r of await db.as(b.admin, (q) => q("select * from public.ledger_checks()"))) expect([r.check_code, Number(r.ledger)]).toEqual([r.check_code, Number(r.documents)]);
  expect(Number(one(await db.sql(`select (select coalesce(sum(products), 0) from private.sol_job_costs()) - (select coalesce(sum(l.debit - l.credit), 0) from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id
    join public.chart_of_accounts a on a.id = l.account_id and a.system_key = 'SOL_COSTS' where e.source_type in ('sol_delivery', 'sol_return')) as v`)).v)).toBe(0);
}

describe("a distributor order", () => {
  it("goes from the call to the profit, at the price Ayra charged for it", async () => {
    const p = await product(db, b);
    await openingStock(db, b, p, 10, "10"); // own stock at another price
    const c = await customer(db);
    const job = await order(c, [line(p, 20, "70")]);
    expect(await report(job)).toMatchObject({ step: "call", needed: "20", ordered: "0" });
    const po = await buy(b.admin, job, [line(p, 20, "50.25")]);
    expect(one(await db.sql("select supplier_id, sol_job_id, total_amount::text t, status::text s from public.purchase_orders where id = $1", [po]))).toEqual({ supplier_id: ayra, sol_job_id: job, t: "1005.00", s: "draft" });
    expect((await report(job)).step).toBe("call"); // a draft is not an order yet
    await receive(po, { [p]: 8 });
    expect(await report(job)).toMatchObject({ step: "ordered", received: "8" });
    await receive(po, { [p]: 12 });
    expect((await report(job)).step).toBe("received");
    await supply(job, [20]);
    expect(await value(p)).toEqual({ q: 10, v: "100.00" }); // the own stock keeps its value
    expect((await report(job)).step).toBe("supplied");
    const fuel = one(await db.sql("select id from public.expense_categories where code = 'FUEL'")).id;
    await call(b.admin, "record_expense", json({ category_id: fuel, amount: "95.50", financial_account_id: cash, method: "cash", payee: "Truck", description: "Freight", no_receipt_reason: "None", sol_job_id: job, client_request_id: randomUUID() }));
    await call(b.admin, "complete_sol_job", job, null);
    const r = await report(job);
    expect([paisa(r.sale), paisa(r.goods_cost), paisa(r.other_costs), paisa(r.profit)]).toEqual([140000, 100500, 9550, 29950]);
    await call(b.admin, "record_sol_payment", job, json({ amount: "1400", method: "cash", financial_account_id: cash, client_request_id: randomUUID() }));
    expect(await report(job)).toMatchObject({ step: "paid" });
    await sound();
  });

  it("uses stock at average cost for what Ayra did not deliver, and gives everything back exactly", async () => {
    const p = await product(db, b);
    await openingStock(db, b, p, 10, "10");
    const before = [await gl("SOL_COSTS"), await gl("INVENTORY"), await gl("INVENTORY_VARIANCE")];
    const job = await order(await customer(db), [line(p, 8, "90")]);
    await receive(await buy(b.admin, job, [line(p, 5, "40")]), { [p]: 5 });
    const received = await gl("INVENTORY");
    const d = await supply(job, [8]);
    expect(await value(p)).toEqual({ q: 7, v: "70.00" });
    expect((await gl("SOL_COSTS")) - (before[0] ?? 0)).toBe(23000); // 5 × 40 + 3 × 10
    const item = one(await db.sql("select id, order_quantity::int q, order_cost::text c from public.sol_delivery_items where sol_delivery_id = $1", [d]));
    expect([item.q, item.c]).toEqual([5, "200.00"]);
    for (const n of [3, 5]) await call(b.admin, "return_sol_goods", d, json({ warehouse_id: b.mainWarehouse, reason: "Sent back", client_request_id: randomUUID() }), json([{ delivery_item_id: item.id, quantity: n }]));
    expect([await gl("SOL_COSTS"), await gl("INVENTORY"), await gl("INVENTORY_VARIANCE")]).toEqual([before[0], received, before[2]]);
    expect(one(await db.sql("select * from private.sol_order_goods($1, $2)", [job, p]))).toMatchObject({ quantity: "5", value: "200.00" });
    await sound();
  });

  it("keeps the ledger exact when shops bought part of the goods meanwhile", async () => {
    const p = await product(db, b);
    await openingStock(db, b, p, 10, "10");
    const job = await order(await customer(db), [line(p, 10, "90")]);
    await receive(await buy(b.admin, job, [line(p, 10, "50")]), { [p]: 10 });
    // 10 at 10 and 10 at 50: a shop takes 9 at the average of 30, so 11 units worth 330 are left.
    await db.as(b.admin, async (q) => {
      const a = one(await q("insert into public.stock_adjustments (warehouse_id, kind, reason) values ($1, 'write_off', 'Lost') returning id", [b.mainWarehouse])).id;
      await q("insert into public.stock_adjustment_items (stock_adjustment_id, product_id, unit_id, quantity) values ($1, $2, $3, -9)", [a, p, b.units.PCS]);
      await q("select public.post_stock_adjustment($1)", [a]);
    });
    expect(await value(p)).toEqual({ q: 11, v: "330.00" });
    const variance = await gl("INVENTORY_VARIANCE");
    await supply(job, [10]);
    // No more value leaves than there is; the order still costs what was paid, the rest is a variance.
    expect(await value(p)).toEqual({ q: 1, v: "0.00" });
    expect(paisa((await report(job)).goods_cost)).toBe(50000);
    expect((await gl("INVENTORY_VARIANCE")) - variance).toBe(-17000);
    await sound();
  });

  it("is an order of products with one price each, and stays one", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    const type = one(await db.sql("select id from public.sol_job_types where name_en = 'General'")).id;
    for (const bad of [[], [line(p, 0, "5")], [line(p, 1, "0")], [{ ...line(p, 1, "5"), unit_id: randomUUID() }]]) await expect(save(b.admin, c, bad)).rejects.toThrow();
    const job = await save(b.admin, c, [line(p, 3, "33.33")]);
    expect(one(await db.sql("select contract_value::text v from public.sol_jobs where id = $1", [job])).v).toBe("99.99");
    await expect(call(b.admin, "save_sol_job", job, json({ customer_id: c, job_type_id: type, contract_value: "1" }), json([]))).rejects.toThrow(/order cannot become a job/);
    const orderType = one(await db.sql("select id from public.sol_job_types where is_order")).id;
    await call(b.admin, "save_sol_job", job, json({ customer_id: c, job_type_id: orderType, contract_value: "500" }), json([]));
    await expect(confirm(job)).rejects.toThrow(/no products/);
    await save(b.admin, c, [line(p, 3, "10")], job);
    await confirm(job);
    const general = await call(b.admin, "save_sol_job", null, json({ customer_id: c, job_type_id: type, contract_value: "10" }), json([]));
    await expect(save(b.admin, c, [line(p, 1, "5")], general)).rejects.toThrow(/Order not found/);
    await expect(db.as(b.admin, (q) => q("update public.sol_job_types set is_active = false where id = $1", [orderType]))).rejects.toThrow(/fixed/);
    await expect(db.as(b.admin, (q) => q("update public.sol_job_types set is_order = true where id = $1", [type]))).rejects.toMatchObject({ code: "42501" });
  });

  it("is ordered from Ayra once per request, only with its own products, by those who may buy", async () => {
    const p = await product(db, b);
    const other = await product(db, b);
    const draft = await save(b.admin, await customer(db), [line(p, 4, "20")]);
    await expect(buy(b.admin, draft, [line(p, 4, "10")])).rejects.toThrow(/draft/);
    await confirm(draft);
    const request = randomUUID();
    expect(await buy(b.admin, draft, [line(p, 4, "10")], request)).toBe(await buy(b.admin, draft, [line(p, 4, "10")], request));
    await expect(buy(b.admin, draft, [line(other, 1, "10")])).rejects.toThrow(/does not belong/);
    const role = one(await db.sql("insert into public.roles (code, name_en, name_ur) values ('solonly', 'S', 'S') returning id")).id;
    for (const x of ["sol.view", "sol.view_all", "sol.manage"]) await db.sql("insert into public.role_permissions (role_id, permission_code) values ($1, $2)", [role, x]);
    const user = await db.createUser("solonly");
    await expect(buy(user, draft, [line(p, 1, "10")])).rejects.toMatchObject({ code: "42501" });
    expect(await report(draft, user)).toMatchObject({ goods_cost: null, profit: null, paid: null });
    await expect(db.as(await db.createUser("driver"), (q) => q("insert into public.purchase_orders (supplier_id, warehouse_id, sol_job_id) values ($1, $2, $3)", [ayra, b.mainWarehouse, draft]))).rejects.toMatchObject({ code: "42501" });
    await expect(db.as(b.admin, (q) => q("select order_cost from public.sol_delivery_items"))).rejects.toMatchObject({ code: "42501" });
  });

  it("names Ayra as the company the goods are bought from", async () => {
    expect(Number(one(await db.sql("select count(*) n from public.permissions where description_en ilike '%main company%' or description_ur like '%مرکزی کمپنی%'")).n)).toBe(0);
    expect(one(await db.sql("select name_en from public.chart_of_accounts where system_key = 'AP_PRINCIPAL'")).name_en).toBe("Payable — Ayra company");
  });
});
