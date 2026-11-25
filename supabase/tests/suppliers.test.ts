// Suppliers are staff who take the goods to the shops and receive the money; extra payments to the Ayra company.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, one, type TestDb } from "./helpers";
import { basics, cashAccount, customer, employee, glBalance, openingStock, product, type Basics } from "./fixtures";

let db: TestDb;
let b: Basics;
let cash: string;
let today: string;
beforeAll(async () => {
  db = await createTestDb();
  b = await basics(db);
  cash = await cashAccount(db);
  today = one(await db.sql("select private.business_today()::text d")).d as string;
});
afterAll(() => db.close());

const json = (v: unknown) => JSON.stringify(v);
const call = async (user: string, fn: string, ...args: unknown[]) => one(await db.as(user, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args))).r;
const paisa = (v: unknown) => Math.round(Number(v) * 100);
const gl = async (key: string) => paisa(await glBalance(db, key));
const denied = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: "42501" });
const money = async (user: string, delivery: string) => (await call(user, "delivery_money", delivery)) as { total: string; outstanding: string; received: string; waiting: string };
async function sound() {
  expect(Number(one(await db.sql("select coalesce(sum(debit - credit), 0) v from public.journal_entry_lines")).v)).toBe(0);
  for (const r of await db.as(b.admin, (q) => q("select * from public.ledger_checks()"))) expect([r.check_code, Number(r.ledger)]).toEqual([r.check_code, Number(r.documents)]);
}
/** A supplier with a login. */
async function supplier() {
  const e = await employee(db);
  await call(b.admin, "save_supply_staff", e, json({ is_active: true }));
  const user = await db.createUser("supplier");
  await db.sql("update public.profiles set employee_id = $1 where id = $2", [e, user]);
  return { e, user };
}
/** An order of 10 pieces at 100, on its way with a supplier. */
async function onTheWay(suppliedBy: string | null, taker: string | null = null) {
  const p = await product(db, b);
  await openingStock(db, b, p, 50, "60");
  const shop = await customer(db, taker ? { orderTakerId: taker } : {});
  return db.as(b.admin, async (q) => {
    const so = one(await q("insert into public.sales_orders (customer_id, warehouse_id, order_taker_id) values ($1, $2, $3) returning id", [shop, b.mainWarehouse, taker])).id;
    const item = one(await q("insert into public.sales_order_items (sales_order_id, product_id, unit_id, quantity, unit_price) values ($1, $2, $3, 10, 100) returning id", [so, p, b.units.PCS])).id;
    await q("select public.submit_sales_order($1)", [so]);
    await q("select public.approve_sales_order($1)", [so]);
    await q("select public.start_picking($1)", [so]);
    const d = one(await q("select public.save_delivery($1, $2, $3) id", [so, json({ supplied_by: suppliedBy, date: today, client_request_id: randomUUID() }), json([{ sales_order_item_id: item, quantity: 10 }])])).id as string;
    const invoice = one(await q("select public.dispatch_delivery($1) id", [d])).id as string;
    return { d, so: so as string, shop, invoice };
  });
}

describe("suppliers", () => {
  it("take the order to the shop, and their receipt and cash are recorded at once", async () => {
    const s = await supplier();
    const x = await onTheWay(s.e);
    expect(await money(s.user, x.d)).toMatchObject({ total: "1000.00", outstanding: "1000.00", received: "0.00" });
    // They see only their own deliveries, with the order and the shop.
    expect((await db.as(s.user, (q) => q("select id from public.deliveries"))).map((r) => r.id)).toEqual([x.d]);
    expect((await db.as(s.user, (q) => q("select id from public.customers"))).map((r) => r.id)).toEqual([x.shop]);
    expect((await db.as(s.user, (q) => q("select id from public.sales_orders"))).map((r) => r.id)).toEqual([x.so]);
    const held = await gl("CASH_WITH_COLLECTORS");
    await call(s.user, "complete_delivery", x.d, json({ received_by: "AM Mart", amount: "600" }), json([]));
    expect(one(await db.sql("select status::text s, received_by r, supplied_by b from public.deliveries where id = $1", [x.d]))).toEqual({ s: "delivered", r: "AM Mart", b: s.e });
    expect(one(await db.sql("select amount::text a, status::text s, collected_by c, method::text m from public.customer_payments where delivery_id = $1", [x.d]))).toEqual({ a: "600.00", s: "posted", c: s.e, m: "cash" });
    expect(await money(s.user, x.d)).toMatchObject({ outstanding: "400.00", received: "600.00" });
    expect((await gl("CASH_WITH_COLLECTORS")) - held).toBe(60000);
    // The cash is handed over like that of an order taker.
    expect((await db.as(s.user, (q) => q("select employee_id, held::text from public.collector_cash()"))).map((r) => [r.employee_id, r.held])).toEqual([[s.e, "600.00"]]);
    await call(b.admin, "record_cash_deposit", json({ employee_id: s.e, amount: "600", financial_account_id: cash, client_request_id: randomUUID() }));
    expect((await gl("CASH_WITH_COLLECTORS")) - held).toBe(0);
    const work = one((await db.as(b.admin, (q) => q("select * from public.report_suppliers_work($1, $1)", [today]))).filter((r) => r.employee_id === s.e));
    expect([work.deliveries, work.delivered, work.shops, paisa(work.amount), paisa(work.money_received), paisa(work.cash_held)]).toEqual(["1", "1", "1", 100000, 60000, 0]);
    const line = one((await db.as(b.admin, (q) => q("select * from public.report_supply($1, $1, $2)", [today, s.e]))));
    expect([line.received_by, paisa(line.amount), paisa(line.money_received), paisa(line.outstanding)]).toEqual(["AM Mart", 100000, 60000, 40000]);
    await sound();
  });

  it("keep more than the invoice on account, and only after what came back", async () => {
    const s = await supplier();
    const x = await onTheWay(s.e);
    const di = one(await db.sql("select id from public.delivery_items where delivery_id = $1", [x.d])).id;
    await call(b.admin, "complete_delivery", x.d, json({ received_by: "Shop", amount: "900", return_reason: "Broken" }), json([{ delivery_item_id: di, quantity: 2 }]));
    expect(await money(b.admin, x.d)).toMatchObject({ outstanding: "0.00", received: "900.00" });
    expect(one(await db.sql("select private.customer_balance($1)::text v", [x.shop])).v).toBe("-100.00");
    await sound();
  });

  it("cannot act for others, and others cannot act for them", async () => {
    const s = await supplier();
    const other = await supplier();
    const x = await onTheWay(s.e);
    await denied(call(other.user, "complete_delivery", x.d, json({ amount: "10" }), json([])));
    await denied(call(other.user, "delivery_money", x.d));
    // They cannot move the delivery to someone else's name or bank account without the office.
    await call(s.user, "complete_delivery", x.d, json({ supplied_by: other.e, amount: "100", method: "bank_transfer", financial_account_id: cash, reference: "T1" }), json([]));
    expect(one(await db.sql("select d.supplied_by b, p.status::text s, p.financial_account_id a from public.deliveries d join public.customer_payments p on p.delivery_id = d.id where d.id = $1", [x.d]))).toEqual({ b: s.e, s: "draft", a: cash });
    expect(await money(b.admin, x.d)).toMatchObject({ received: "0.00", waiting: "100.00" });
    await db.as(b.admin, (q) => q("select public.post_customer_payment((select id from public.customer_payments where delivery_id = $1))", [x.d]));
    expect(await money(b.admin, x.d)).toMatchObject({ received: "100.00", outstanding: "900.00" });
    const warehouse = await db.createUser("warehouse");
    const y = await onTheWay(s.e);
    await denied(call(warehouse, "complete_delivery", y.d, json({ amount: "10" }), json([])));
    await call(warehouse, "complete_delivery", y.d, json({ received_by: "Shop" }), json([]));
    await denied(db.as(s.user, (q) => q("update public.customer_payments set delivery_id = null where delivery_id is not null")));
    await denied(db.as(s.user, (q) => q("update public.customer_payments set sol_job_id = null")));
    await sound();
  });

  it("are assigned by the office, only while the goods are on the way", async () => {
    const s = await supplier();
    const x = await onTheWay(null);
    await expect(call(b.admin, "complete_delivery", x.d, json({ amount: "5" }), json([]))).rejects.toThrow(/supplier who holds the cash/);
    await expect(call(b.admin, "assign_supplier", x.d, await employee(db))).rejects.toThrow(/Supplier not found/);
    await call(b.admin, "assign_supplier", x.d, s.e);
    await call(b.admin, "complete_delivery", x.d, json({ amount: "-1" }), json([])).then(() => expect.fail("negative"), () => undefined);
    await call(b.admin, "complete_delivery", x.d, json({ amount: "1000" }), json([]));
    await expect(call(b.admin, "assign_supplier", x.d, null)).rejects.toThrow(/on the way/);
    await denied(call(s.user, "assign_supplier", x.d, s.e));
    await denied(call(s.user, "save_supply_staff", s.e, json({ is_active: false })));
  });

  it("are not order takers unless they take orders too", async () => {
    const s = await supplier();
    const ids = async (fn: string) => (await db.as(b.admin, (q) => q(`select employee_id from public.${fn}`))).map((r) => r.employee_id);
    expect(await ids("list_supply_staff()")).toContain(s.e);
    expect(await ids("list_order_takers()")).not.toContain(s.e);
    expect(await ids(`report_order_takers('${today}', '${today}')`)).not.toContain(s.e);
    await call(b.admin, "save_order_taker", s.e, json({ territory: "North", is_active: true }));
    expect(await ids("list_order_takers()")).toContain(s.e);
    expect(await ids("list_supply_staff()")).toContain(s.e);
    const created = (await call(b.admin, "save_supply_staff", null, json({ full_name: "Akram", phone: "0300", is_active: true }))) as string;
    expect(one(await db.sql("select e.full_name n, e.job_title j from public.employees e where id = $1", [created]))).toEqual({ n: "Akram", j: "Supplier" });
  });

  it("leave the companies we buy from under the name vendor", async () => {
    expect(Number(one(await db.sql("select count(*) n from public.permissions where description_en ilike '%supplier%'")).n)).toBe(0);
    expect(one(await db.sql("select name_en n from public.chart_of_accounts where system_key = 'AP_SUPPLIERS'")).n).toBe("Payable — Vendors");
  });
});

describe("extra payments to the Ayra company", () => {
  const doc = (extra: Record<string, unknown> = {}) => json({ name: "Advertising boards", paid_at: `${today}T10:30:00+05:00`, amount: "2500.50", kind: "extra", financial_account_id: cash, method: "cash", client_request_id: randomUUID(), ...extra });
  const save = async (id: string | null, d: string, user = b.admin) => (await call(user, "save_company_extra_payment", id, d)) as string;
  const total = async () => (await db.as(b.admin, (q) => q("select coalesce(sum(amount), 0)::text v from public.report_company_extra('2020-01-01', $1)", [today])))[0]?.v;
  const cashBalance = async () => paisa(one(await db.sql("select private.gl_balance(gl_account_id)::text v from public.financial_accounts where id = $1", [cash])).v);

  it("are a cost, or part of what is owed, and leave the account that paid them", async () => {
    const [extra, owed, c] = [await gl("AYRA_EXTRA"), await gl("AP_PRINCIPAL"), await cashBalance()];
    await save(null, doc());
    await save(null, doc({ kind: "account", amount: "1000", name: "Part of old balance" }));
    expect([(await gl("AYRA_EXTRA")) - extra, (await gl("AP_PRINCIPAL")) - owed, (await cashBalance()) - c]).toEqual([250050, 100000, -350050]);
    expect(await total()).toBe("3500.50");
    await sound();
  });

  it("can be corrected: name, time, amount, date, account and kind", async () => {
    const id = await save(null, doc());
    const entries = async () => Number(one(await db.sql("select count(*) n from public.journal_entries where source_id = $1", [id])).n);
    await save(id, doc({ name: "Banners", paid_at: `${today}T18:00:00+05:00`, notes: "By hand" }));
    expect(await entries()).toBe(1); // nothing in the accounts changed
    expect(one(await db.sql("select name n, (paid_at at time zone 'Asia/Karachi')::text t from public.company_extra_payments where id = $1", [id]))).toEqual({ n: "Banners", t: `${today} 18:00:00` });
    const before = [await gl("AYRA_EXTRA"), await gl("AP_PRINCIPAL")];
    await save(id, doc({ name: "Banners", amount: "3000" }));
    expect([await entries(), (await gl("AYRA_EXTRA")) - (before[0] ?? 0)]).toEqual([3, 49950]);
    await save(id, doc({ name: "Banners", amount: "3000", kind: "account", paid_at: "2026-01-15T09:00:00+05:00" }));
    expect([(await gl("AYRA_EXTRA")) - (before[0] ?? 0), (await gl("AP_PRINCIPAL")) - (before[1] ?? 0)]).toEqual([-250050, 300000]);
    const rows = (await db.as(b.admin, (q) => q("select entry_date::text d, amount::text a from public.report_company_extra('2020-01-01', $1) where payment_id = $2", [today, id])));
    expect(rows.map((r) => [r.d, r.a])).toEqual([["2026-01-15", "3000.00"]]);
    expect(Number(one(await db.sql("select count(*) n from public.audit_logs where table_name = 'company_extra_payments' and record_id = $1", [id])).n)).toBeGreaterThan(3);
    await sound();
  });

  it("are recorded once, voided with a reason, and refuse what cannot be right", async () => {
    const d = doc();
    const id = await save(null, d);
    expect(await save(null, d)).toBe(id);
    for (const bad of [{ amount: "0" }, { amount: "-5" }, { name: " " }, { paid_at: "2999-01-01T00:00:00+05:00" }, { paid_at: null }, { kind: "gift" }, { financial_account_id: randomUUID() }]) await expect(save(null, doc(bad))).rejects.toThrow();
    await expect(call(b.admin, "void_company_extra_payment", id, " ")).rejects.toThrow(/reason/);
    const before = await gl("AYRA_EXTRA");
    await call(b.admin, "void_company_extra_payment", id, "Entered twice");
    expect((await gl("AYRA_EXTRA")) - before).toBe(-250050);
    await expect(save(id, doc())).rejects.toThrow(/voided/);
    await sound();
  });

  it("need the permissions of the Ayra account", async () => {
    const viewer = await db.createUser("viewer");
    await denied(save(null, doc(), viewer));
    await denied(db.as(viewer, (q) => q("select * from public.report_company_extra('2020-01-01', '2026-12-31')")));
    expect((await db.as(viewer, (q) => q("select id from public.company_extra_payments"))).length).toBe(0);
    await denied(db.as(b.admin, (q) => q("insert into public.company_extra_payments (name, paid_at, amount, kind, financial_account_id) values ('x', now(), 1, 'extra', $1)", [cash])));
  });
});
