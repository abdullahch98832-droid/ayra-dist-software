// Phase 8: SOL jobs, deliveries, costs and payments; vehicles and drivers; their accounting.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, one, type Row, type TestDb } from "./helpers";
import { basics, cashAccount, customer, employee, glBalance, openingStock, product, stock, type Basics } from "./fixtures";

let db: TestDb;
let b: Basics;
let today: string;
let cash: string;
let bank: string;
let type: string;
let cats: Record<string, string>;

beforeAll(async () => {
  db = await createTestDb();
  b = await basics(db);
  today = one(await db.sql("select private.business_today()::text as d")).d as string;
  cash = await cashAccount(db);
  bank = one(await db.sql("insert into public.financial_accounts (name, account_type) values ('HBL', 'bank') returning id")).id as string;
  await db.sql("insert into public.financial_account_bank_details (financial_account_id, bank_name, account_number) values ($1, 'HBL', '0123-4567 8901234')", [bank]);
  type = one(await db.sql("select id from public.sol_job_types where name_en = 'General'")).id as string;
  cats = Object.fromEntries((await db.sql("select code, id from public.expense_categories")).map((r) => [r.code, r.id])) as Record<string, string>;
});
afterAll(() => db.close());

const json = (value: unknown) => JSON.stringify(value);
const call = async (user: string, fn: string, ...args: unknown[]) =>
  one(await db.as(user, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args))).r as string;
const rows = (user: string, fn: string, ...args: unknown[]) =>
  db.as(user, (q) => q(`select * from public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")})`, args));
const paisa = (v: unknown) => Math.round(Number(v) * 100);
const gl = async (key: string) => paisa(await glBalance(db, key));
const report = async (job: string, user = b.admin) => one(await rows(user, "report_sol_jobs", null, null, null, null, null, job));
const status = async (job: string) => one(await db.sql("select status::text s from public.sol_jobs where id = $1", [job])).s;
const balance = async (c: string) => one(await db.sql("select private.customer_balance($1)::numeric(18,2)::text v", [c])).v;
const refused = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: "42501" });

interface Line { id?: string; kind: string; service_id?: string; product_id?: string; unit_id?: string; description?: string; quantity: number; unit_price?: string; unit_cost?: string }
const save = (user: string, c: string, value: string, lines: Line[] = [], extra: Record<string, unknown> = {}, id: string | null = null) =>
  call(user, "save_sol_job", id, json({ customer_id: c, job_type_id: type, contract_value: value, address: "Shop 5, Lahore", ...extra }), json(lines));
async function confirmed(c: string, value: string, lines: Line[] = [], extra: Record<string, unknown> = {}) {
  const job = await save(b.admin, c, value, lines, extra);
  await call(b.admin, "set_sol_job_status", job, "confirmed");
  return job;
}
const items = (job: string) => db.sql("select id, quantity::float, delivered_quantity::float as delivered, kind from public.sol_job_items where sol_job_id = $1 order by line_no", [job]);
const plan = (user: string, job: string, lines: [string, number][], extra: Record<string, unknown> = {}) =>
  call(user, "save_sol_delivery", null, job, json({ destination: "Gulberg", warehouse_id: b.mainWarehouse, ...extra }), json(lines.map(([job_item_id, quantity]) => ({ job_item_id, quantity }))));
const deliveryItems = async (d: string) => db.sql("select id, quantity::float, returned_quantity::float as returned from public.sol_delivery_items where sol_delivery_id = $1 order by id", [d]);
const pay = (user: string, job: string, amount: string, extra: Record<string, unknown> = {}) =>
  call(user, "record_sol_payment", job, json({ amount, method: "cash", financial_account_id: cash, client_request_id: randomUUID(), ...extra }));
const expense = (user: string, category: string, amount: string, extra: Record<string, unknown> = {}) =>
  call(user, "record_expense", json({ category_id: cats[category], amount, financial_account_id: cash, method: "cash", payee: "Vendor", description: "Test", no_receipt_reason: "None", client_request_id: randomUUID(), ...extra }));
let plate = 0;
const vehicle = async (driver: string | null = null) =>
  one(await db.sql("insert into public.vehicles (registration_no, name, driver_id) values ($1, 'Shehzore', $2) returning id", [`LEA-${++plate}`, driver])).id as string;
async function driver() {
  const user = await db.createUser("driver");
  const e = await employee(db);
  await db.sql("update public.profiles set employee_id = $1 where id = $2", [e, user]);
  return { user, employee: e, id: one(await db.sql("insert into public.drivers (employee_id) values ($1) returning id", [e])).id as string };
}

/** What must hold after any sequence of operations. */
async function invariants() {
  const r = one(await db.sql(`select
    (select coalesce(sum(debit - credit), 0) from public.journal_entry_lines) as journal,
    (select coalesce(sum(total_value), 0) from public.inventory_valuation) - (select coalesce(sum(l.debit - l.credit), 0) from public.journal_entry_lines l join public.chart_of_accounts a on a.id = l.account_id and a.system_key = 'INVENTORY') as inventory,
    (select count(*) from public.stock_balances sb where sb.on_hand <> (select coalesce(sum(quantity), 0) from public.stock_movements m where m.product_id = sb.product_id and m.warehouse_id = sb.warehouse_id)) as stock,
    (select coalesce(sum(contract_value), 0) from public.sol_jobs where status = 'completed') + (select coalesce(sum(l.debit - l.credit), 0) from public.journal_entry_lines l join public.chart_of_accounts a on a.id = l.account_id and a.system_key = 'SOL_REVENUE') as revenue,
    (select coalesce(sum(products), 0) from private.sol_job_costs()) - (select coalesce(sum(l.debit - l.credit), 0) from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id
       join public.chart_of_accounts a on a.id = l.account_id and a.system_key = 'SOL_COSTS' where e.source_type in ('sol_delivery', 'sol_return')) as costs,
    (select count(*) from public.sol_jobs j where private.sol_job_received(j.id) > j.contract_value) as overpaid,
    (select count(*) from public.sol_job_items i where i.delivered_quantity <> (select coalesce(sum(di.quantity - di.returned_quantity), 0) from public.sol_delivery_items di
       join public.sol_deliveries d on d.id = di.sol_delivery_id and d.status in ('dispatched', 'delivered') where di.sol_job_item_id = i.id)) as delivered,
    (select count(*) from public.customer_payments p where p.status = 'posted' and private.payment_unallocated(p.id) < 0) as over_allocated,
    (select count(*) from public.expenses x where x.status = 'posted' and not exists (select 1 from public.journal_entries e where e.source_type = 'expense' and e.source_id = x.id and e.reversed_by is null and e.reversal_of is null)) as unposted`));
  expect(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)])))
    .toEqual({ journal: 0, inventory: 0, stock: 0, revenue: 0, costs: 0, overpaid: 0, delivered: 0, over_allocated: 0, unposted: 0 });
}

describe("the complete SOL workflow", () => {
  it("from draft through advance, delivery, costs and final payment to profit", async () => {
    const c = await customer(db);
    const p = await product(db, b);
    await openingStock(db, b, p, 100, "40.00");
    const responsible = await employee(db);
    const d = await driver();
    const v = await vehicle(d.id);
    const service = one(await db.as(b.admin, (q) => q("insert into public.sol_services (name_en, unit_label, default_price) values ('Installation', 'visit', 1500) returning id"))).id as string;
    const start = { ar: await gl("AR"), revenue: await gl("SOL_REVENUE"), costs: await gl("SOL_COSTS"), inventory: await gl("INVENTORY") };
    const job = await save(b.admin, c, "10000.00", [
      { kind: "service", service_id: service, quantity: 2.5, unit_price: "1500.00", unit_cost: "300.00" },
      { kind: "product", product_id: p, unit_id: b.units.PCS, quantity: 30, unit_price: "200.00", unit_cost: "40.00" },
      { kind: "other", description: "Permit", quantity: 1, unit_price: "250.00" },
    ], { contact_name: "Bilal", contact_phone: "0300-1234567", description: "Fit out", responsible_employee_id: responsible, date: today, start_date: today, due_date: today });
    const saved = one(await db.as(b.admin, (q) => q("select doc_no, contact_name, contact_phone, address, description, contract_value::text, responsible_employee_id, status::text from public.sol_jobs where id = $1", [job])));
    expect(saved).toEqual({ doc_no: expect.stringMatching(/^SOLJ-\d{6}$/), contact_name: "Bilal", contact_phone: "0300-1234567", address: "Shop 5, Lahore", description: "Fit out", contract_value: "10000.00", responsible_employee_id: responsible, status: "draft" });
    expect(one(await db.sql("select sum(line_total)::text t from public.sol_job_items where sol_job_id = $1", [job])).t).toBe("10000.00");
    await expect(pay(b.admin, job, "100")).rejects.toThrow(/is draft/);
    await expect(plan(b.admin, job, [])).rejects.toThrow(/is draft/);
    await call(b.admin, "set_sol_job_status", job, "confirmed");

    // Advance: money in, the client is in credit, no revenue yet.
    const advance = await pay(b.admin, job, "3000.00", { method: "bank_transfer", financial_account_id: bank, reference: "TXN-1", payer_account: "PK36 SCBL 0000 0011 2345 6702" });
    expect(one(await db.sql("select method::text, reference, payer_account, financial_account_id, status::text from public.customer_payments where id = $1", [advance])))
      .toEqual({ method: "bank_transfer", reference: "TXN-1", payer_account: "****6702", financial_account_id: bank, status: "posted" });
    expect([await balance(c), await gl("SOL_REVENUE") - start.revenue, (await report(job)).received, (await report(job)).pending]).toEqual(["-3000.00", 0, "3000.00", "7000.00"]);

    // Two deliveries, the second brings goods back.
    const [svc, prod] = await items(job) as { id: string }[];
    const d1 = await plan(b.admin, job, [[prod!.id, 20], [svc!.id, 1]], { vehicle_id: v, driver_id: d.id, odometer_start: 1000 });
    expect(await stock(db, p, b.mainWarehouse)).toMatchObject({ onHand: 100 });
    await call(b.admin, "dispatch_sol_delivery", d1);
    expect([await status(job), (await stock(db, p, b.mainWarehouse)).onHand, await gl("SOL_COSTS") - start.costs, await gl("INVENTORY") - start.inventory]).toEqual(["in_progress", 80, 80000, -80000]);
    await expect(call(b.admin, "complete_sol_job", job, null)).rejects.toThrow(/planned or on the way/);
    await expect(call(b.admin, "cancel_sol_job", job, "x")).rejects.toThrow(/on the way/);
    await expect(call(d.user, "complete_sol_delivery", d1, "{}", json([{ delivery_item_id: (await deliveryItems(d1))[0]!.id, quantity: 1 }]))).rejects.toMatchObject({ code: "42501" });
    await call(d.user, "complete_sol_delivery", d1, json({ received_by: "Guard", odometer_end: 1042 }), "[]");
    const d2 = await plan(b.admin, job, [[prod!.id, 10]], { vehicle_id: v, driver_id: d.id, odometer_start: 1042 });
    await expect(plan(b.admin, job, [[prod!.id, 11]]).then((x) => call(b.admin, "dispatch_sol_delivery", x))).rejects.toThrow(/More than the job still needs/);
    await db.sql("update public.sol_deliveries set status = 'cancelled' where sol_job_id = $1 and status = 'draft' and id <> $2", [job, d2]);
    await call(b.admin, "dispatch_sol_delivery", d2);
    const [line] = await deliveryItems(d2);
    await call(b.admin, "complete_sol_delivery", d2, json({ return_reason: "Broken", odometer_end: 1060 }), json([{ delivery_item_id: line!.id, quantity: 4 }]));
    expect([(await stock(db, p, b.mainWarehouse)).onHand, await gl("SOL_COSTS") - start.costs, (await items(job))[1]!.delivered]).toEqual([74, 104000, 26]);

    // Costs: an expense of the job and a vehicle expense for the job.
    await expense(b.admin, "SOL_DIRECT", "500.00", { sol_job_id: job, payee: "Permit office", method: "cash", reference: "R-1" });
    const fuel = await expense(b.admin, "FUEL", "760.00", { sol_job_id: job, vehicle_id: v, litres: "2.75", odometer: 1060 });
    expect(await report(job)).toMatchObject({ estimated_cost: "1950.00", product_costs: "1040.00", other_costs: "500.00", direct_costs: "1540.00", vehicle_expenses: "760.00", profit: null });
    await expect(pay(b.admin, job, "7000.01")).rejects.toThrow(/exceeds the job balance/);
    await pay(b.admin, job, "2000.00", { method: "cheque", reference: "CHQ 55" });

    await call(b.admin, "complete_sol_job", job, null);
    expect([await status(job), await gl("SOL_REVENUE") - start.revenue, await balance(c)]).toEqual(["completed", -1000000, "5000.00"]);
    expect(await report(job)).toMatchObject({ received: "5000.00", pending: "5000.00", profit: "7700.00" });
    await pay(b.admin, job, "5000.00", { method: "other", reference: "Wallet 9" });
    expect([await balance(c), (await report(job)).pending, await gl("AR") - start.ar]).toEqual(["0.00", "0.00", 0]);
    // Goods that come back after completion still reduce its costs; a voided expense too.
    await call(b.admin, "return_sol_goods", d1, json({ warehouse_id: b.mainWarehouse, reason: "Surplus" }), json([{ delivery_item_id: (await db.sql("select di.id from public.sol_delivery_items di where di.sol_delivery_id = $1 and di.sol_job_item_id = $2", [d1, prod!.id]))[0]!.id, quantity: 1 }]));
    await call(b.admin, "void_expense", fuel, "Wrong vehicle");
    expect(await report(job)).toMatchObject({ direct_costs: "1500.00", vehicle_expenses: "0", profit: "8500.00" });
    await invariants();
  });
});

describe("jobs", () => {
  it("follow their type's configuration and validate their lines", async () => {
    const c = await customer(db);
    const p = await product(db, b);
    const only = one(await db.as(b.admin, (q) => q("insert into public.sol_job_types (name_en, uses_products, uses_deliveries) values ('Consulting', false, false) returning id"))).id as string;
    await expect(save(b.admin, c, "10", [{ kind: "product", product_id: p, unit_id: b.units.PCS, quantity: 1 }], { job_type_id: only })).rejects.toThrow(/does not use products/);
    const job = await confirmed(c, "10", [{ kind: "other", description: "Advice", quantity: 1 }], { job_type_id: only });
    await expect(plan(b.admin, job, [])).rejects.toThrow(/does not use deliveries/);
    await expect(save(b.admin, c, "10", [{ kind: "product", product_id: p, unit_id: b.units.PCS, quantity: 1.5 }])).rejects.toMatchObject({ code: "23514" });
    await expect(save(b.admin, c, "10", [{ kind: "other", quantity: 1 }])).rejects.toMatchObject({ code: "23514" });
    await expect(save(b.admin, c, "-1")).rejects.toThrow(/contract amount/);
    await expect(save(b.admin, c, "1", [], { job_type_id: null })).rejects.toThrow(/job type/);
    await expect(save(b.admin, c, "1", [], { start_date: "2026-02-02", due_date: "2026-02-01" })).rejects.toMatchObject({ code: "23514" });
    const request = randomUUID();
    expect(await save(b.admin, c, "1", [], { client_request_id: request })).toBe(await save(b.admin, c, "1", [], { client_request_id: request }));
    expect(one(await db.sql("select is_sol_client v from public.customers where id = $1", [c])).v).toBe(true);
  });

  it("can be changed until completed, but never below what was delivered or received", async () => {
    const c = await customer(db);
    const p = await product(db, b);
    await openingStock(db, b, p, 10, "5.00");
    const job = await confirmed(c, "100.00", [{ kind: "product", product_id: p, unit_id: b.units.PCS, quantity: 8, unit_price: "10", unit_cost: "5" }]);
    const [line] = await items(job) as { id: string }[];
    await call(b.admin, "dispatch_sol_delivery", await plan(b.admin, job, [[line!.id, 5]]));
    const edit = (value: string, l: Line[]) => save(b.admin, c, value, l, {}, job);
    const same = { id: line!.id, kind: "product", product_id: p, unit_id: b.units.PCS };
    await expect(edit("100", [{ ...same, quantity: 4 }])).rejects.toThrow(/below what was already delivered/);
    await expect(edit("100", [])).rejects.toThrow(/cannot be removed/);
    await expect(edit("100", [{ id: line!.id, kind: "other", description: "x", quantity: 8 }])).rejects.toThrow(/only change its quantity and price/);
    await edit("120", [{ ...same, quantity: 6, unit_price: "11", unit_cost: "6" }, { kind: "other", description: "Extra", quantity: 1 }]);
    await pay(b.admin, job, "60");
    await expect(edit("59.99", [{ ...same, quantity: 6 }])).rejects.toThrow(/below what was already received/);
    await expect(save(b.admin, await customer(db), "120", [{ ...same, quantity: 6 }], {}, job)).rejects.toThrow(/client of a confirmed job/);
    await expect(save(b.admin, c, "120", [{ ...same, id: randomUUID(), quantity: 6 }], {}, job)).rejects.toThrow(/does not belong/);
    // Someone without costs.view keeps the estimate that is there.
    const role = one(await db.sql("insert into public.roles (code, name_en, name_ur) values ('sol_desk', 'SOL desk', 'x') returning id")).id;
    await db.sql("insert into public.role_permissions (role_id, permission_code) select $1, unnest(array['dashboard.view', 'sol.view', 'sol.view_all', 'sol.manage'])", [role]);
    const desk = await db.createUser("sol_desk");
    await save(desk, c, "120", [{ ...same, quantity: 7, unit_cost: "0" }], {}, job);
    expect(one(await db.sql("select unit_cost::text v from public.sol_job_items where id = $1", [line!.id])).v).toBe("6.00");
    await refused(db.as(desk, (q) => q("select unit_cost from public.sol_job_items")));
    expect(await db.as(desk, (q) => q("select * from public.secure_sol_item_costs"))).toEqual([]);
    expect(await report(job, desk)).toMatchObject({ received: null, pending: null, direct_costs: null, vehicle_expenses: null, profit: null, estimated_cost: null });
    await invariants();
  });

  it("keep a due date that has passed when work starts late", async () => {
    const job = await confirmed(await customer(db), "10", [], { due_date: "2026-01-31" });
    await call(b.admin, "dispatch_sol_delivery", await plan(b.admin, job, []));
    expect(one(await db.sql("select due_date::text d, start_date s, status::text from public.sol_jobs where id = $1", [job]))).toEqual({ d: "2026-01-31", s: null, status: "in_progress" });
    const other = await confirmed(await customer(db), "10");
    await call(b.admin, "set_sol_job_status", other, "in_progress");
    expect(one(await db.sql("select start_date::text s from public.sol_jobs where id = $1", [other])).s).toBe(today);
  });

  it("can be reopened, corrected and completed again with one entry in force", async () => {
    const c = await customer(db);
    const before = await gl("SOL_REVENUE");
    const job = await confirmed(c, "900.00");
    await call(b.admin, "complete_sol_job", job, null);
    await expect(save(b.admin, c, "800", [], {}, job)).rejects.toThrow(/is completed/);
    await expect(call(b.admin, "reopen_sol_job", job, " ")).rejects.toThrow(/reason is required/);
    await call(b.admin, "reopen_sol_job", job, "Wrong amount");
    expect([await status(job), await gl("SOL_REVENUE"), await balance(c)]).toEqual(["in_progress", before, "0.00"]);
    await save(b.admin, c, "800.00", [], {}, job);
    await call(b.admin, "complete_sol_job", job, today);
    expect([await gl("SOL_REVENUE") - before, await balance(c)]).toEqual([-80000, "800.00"]);
    await expect(call(b.admin, "complete_sol_job", job, today)).rejects.toThrow(/is completed/);
    await expect(call(b.admin, "complete_sol_job", await confirmed(c, "1"), "2099-01-01")).rejects.toThrow(/future/);
    const ledger = await rows(b.admin, "customer_statement", c, "2020-01-01", today);
    expect(ledger.filter((r) => r.kind === "sol_job").map((r) => r.balance)).toEqual(["900.00", "0.00", "800.00"]);
    await invariants();
  });

  it("cancelled with money received leave it on the client's account", async () => {
    const c = await customer(db);
    const job = await confirmed(c, "500.00");
    const p = await pay(b.admin, job, "200.00");
    await plan(b.admin, job, []);
    await expect(call(b.admin, "cancel_sol_job", job, "")).rejects.toThrow(/reason is required/);
    await call(b.admin, "cancel_sol_job", job, "Client withdrew");
    expect([await status(job), await balance(c), one(await db.sql("select private.payment_unallocated($1)::text v", [p])).v]).toEqual(["cancelled", "-200.00", "200.00"]);
    expect(await db.sql("select distinct status::text from public.sol_deliveries where sol_job_id = $1", [job])).toEqual([{ status: "cancelled" }]);
    await expect(expense(b.admin, "SOL_DIRECT", "5", { sol_job_id: job })).rejects.toThrow(/is cancelled/);
    const other = await confirmed(c, "150.00");
    await call(b.admin, "allocate_payment_to_sol_job", p, other, "150.00");
    await expect(call(b.admin, "allocate_payment_to_sol_job", p, other, "1.00")).rejects.toThrow(/job balance/);
    await call(b.admin, "release_sol_payment", p, other);
    expect((await report(other)).received).toBe("0");
    const draft = await save(b.admin, c, "5");
    await call(b.admin, "delete_sol_job", draft);
    await expect(call(b.admin, "delete_sol_job", other)).rejects.toThrow(/Only draft/);
    await invariants();
  });
});

describe("payments", () => {
  it("by someone who may not post wait for the office and reserve the balance", async () => {
    const entry = await db.createUser("data_entry");
    const c = await customer(db);
    const job = await confirmed(c, "1000.00");
    const request = randomUUID();
    const p = await pay(entry, job, "700.00", { client_request_id: request, payer_account: "12" });
    expect(await pay(entry, job, "700.00", { client_request_id: request })).toBe(p);
    expect([one(await db.sql("select status::text s from public.customer_payments where id = $1", [p])).s, await balance(c)]).toEqual(["draft", "0.00"]);
    await expect(pay(entry, job, "300.01")).rejects.toThrow(/exceeds the job balance \(300.00\)/);
    await refused(call(entry, "post_customer_payment", p));
    await call(b.admin, "post_customer_payment", p);
    expect([await balance(c), (await report(job)).received]).toEqual(["-700.00", "700.00"]);
    await call(b.admin, "void_customer_payment", p, "Bounced");
    expect([await balance(c), (await report(job)).received]).toEqual(["0.00", "0"]);
    await expect(pay(b.admin, job, "10", { financial_account_id: null })).rejects.toThrow(/account that received/);
    await expect(pay(b.admin, job, "0")).rejects.toThrow(/positive/);
    await refused(pay(await db.createUser("viewer"), job, "1"));
    await invariants();
  });

  it("never exceed the contract when recorded at the same time", async () => {
    const job = await confirmed(await customer(db), "100.00");
    const r = await Promise.allSettled([1, 2, 3, 4].map(() => pay(b.admin, job, "40.00")));
    expect(r.filter((x) => x.status === "fulfilled").length).toBe(2);
    await invariants();
  });

  it("show accounts by their last four characters only", async () => {
    const entry = await db.createUser("data_entry");
    const list = await rows(entry, "list_payment_accounts");
    expect(list.find((r) => r.account_id === bank)).toMatchObject({ name: "HBL", masked: "****1234" });
    expect(list.find((r) => r.account_id === cash)).toMatchObject({ masked: null });
    expect(await db.as(entry, (q) => q("select * from public.financial_account_bank_details"))).toEqual([]);
    await refused(rows(await db.createUser("driver"), "list_payment_accounts"));
    await refused(call(entry, "save_financial_account", null, json({ name: "Mine", account_type: "cash" })));
    const id = await call(b.admin, "save_financial_account", null, json({ name: "MCB", account_type: "bank", bank_name: "MCB Bank", account_number: "999988887777" }));
    expect((await rows(entry, "list_payment_accounts")).find((r) => r.account_id === id)).toMatchObject({ masked: "****7777" });
    await call(b.admin, "save_financial_account", id, json({ name: "MCB Gulberg", bank_name: "MCB Bank", account_number: "111122223333", is_active: false }));
    expect((await rows(b.admin, "list_payment_accounts")).find((r) => r.account_id === id)).toMatchObject({ name: "MCB Gulberg", masked: "****3333", is_active: false });
  });
});

describe("deliveries and stock", () => {
  it("refuse what is not in stock, reserved or not in service", async () => {
    const c = await customer(db);
    const p = await product(db, b);
    await openingStock(db, b, p, 3, "5.00");
    const job = await confirmed(c, "10", [{ kind: "product", product_id: p, unit_id: b.units.PCS, quantity: 5 }]);
    const [line] = await items(job) as { id: string }[];
    const d = await plan(b.admin, job, [[line!.id, 4]]);
    await db.sql("update public.app_settings set value = 'true' where key = 'allow_negative_stock'");
    await expect(call(b.admin, "dispatch_sol_delivery", d)).rejects.toThrow(/Insufficient stock/);
    await db.sql("update public.app_settings set value = 'false' where key = 'allow_negative_stock'");
    await expect(plan(b.admin, job, [[randomUUID(), 1]])).rejects.toMatchObject({ code: "23502" });
    const noWarehouse = await plan(b.admin, job, [[line!.id, 1]], { warehouse_id: null });
    await expect(call(b.admin, "dispatch_sol_delivery", noWarehouse)).rejects.toThrow(/Choose the warehouse/);
    const v = await vehicle();
    const planned = await plan(b.admin, job, [], { vehicle_id: v });
    await db.sql("update public.vehicles set status = 'maintenance' where id = $1", [v]);
    expect(one(await db.sql("select is_active from public.vehicles where id = $1", [v])).is_active).toBe(false);
    await expect(call(b.admin, "dispatch_sol_delivery", planned)).rejects.toThrow(/not in service/);
    await expect(plan(b.admin, job, [], { vehicle_id: v })).rejects.toThrow(/not in service/);
    await call(b.admin, "cancel_sol_delivery", planned);
    await expect(call(b.admin, "dispatch_sol_delivery", planned)).rejects.toThrow(/already cancelled/);
    const ok = await plan(b.admin, job, [[line!.id, 3]]);
    await call(b.admin, "dispatch_sol_delivery", ok);
    await expect(call(b.admin, "dispatch_sol_delivery", ok)).rejects.toThrow(/already dispatched/);
    await expect(call(b.admin, "complete_sol_delivery", ok, json({ odometer_end: 5, return_reason: "x" }), json([{ delivery_item_id: (await deliveryItems(ok))[0]!.id, quantity: 4 }]))).rejects.toThrow(/More is returned/);
    await expect(call(b.admin, "complete_sol_delivery", ok, "{}", json([{ delivery_item_id: (await deliveryItems(ok))[0]!.id, quantity: 1 }]))).rejects.toThrow(/reason is required/);
    await call(b.admin, "complete_sol_delivery", ok, "{}", "[]");
    await invariants();
  });

  it("return the exact cost however it is split", async () => {
    const c = await customer(db);
    const p = await product(db, b);
    await openingStock(db, b, p, 7, "3.33");
    await db.sql("select 1");
    const job = await confirmed(c, "10", [{ kind: "product", product_id: p, unit_id: b.units.PCS, quantity: 7 }]);
    const [line] = await items(job) as { id: string }[];
    const d = await plan(b.admin, job, [[line!.id, 7]]);
    await call(b.admin, "dispatch_sol_delivery", d);
    const cost = (await report(job)).product_costs;
    expect(cost).toBe("23.31");
    await call(b.admin, "complete_sol_delivery", d, "{}", "[]");
    const [di] = await deliveryItems(d);
    for (const q of [1, 2, 4]) await call(b.admin, "return_sol_goods", d, json({ warehouse_id: b.mainWarehouse, reason: "Back" }), json([{ delivery_item_id: di!.id, quantity: q }]));
    expect(paisa((await report(job)).product_costs)).toBe(0);
    await expect(call(b.admin, "return_sol_goods", d, json({ warehouse_id: b.mainWarehouse, reason: "Back" }), json([{ delivery_item_id: di!.id, quantity: 1 }]))).rejects.toThrow(/More is returned/);
    expect((await rows(b.admin, "report_stock_movements", today, today, p)).map((r) => [r.movement_type, r.doc_no !== null])).toEqual(
      [["sol_return", true], ["sol_return", true], ["sol_return", true], ["sol_issue", true], ["opening", true]]);
    await invariants();
  });

  it("cannot send the same remaining quantity twice", async () => {
    const p = await product(db, b);
    await openingStock(db, b, p, 50, "2.00");
    const job = await confirmed(await customer(db), "10", [{ kind: "product", product_id: p, unit_id: b.units.PCS, quantity: 10 }]);
    const [line] = await items(job) as { id: string }[];
    const ds = await Promise.all([1, 2, 3].map(() => plan(b.admin, job, [[line!.id, 6]])));
    const r = await Promise.allSettled(ds.map((d) => call(b.admin, "dispatch_sol_delivery", d)));
    expect(r.filter((x) => x.status === "fulfilled").length).toBe(1);
    await invariants();
  });
});

describe("who sees and does what", () => {
  it("shows drivers and responsible employees only their jobs", async () => {
    const d = await driver();
    const c = await customer(db);
    const mine = await confirmed(c, "10");
    const other = await confirmed(await customer(db), "20");
    await plan(b.admin, mine, [], { driver_id: d.id });
    const seen = await db.as(d.user, (q) => q("select id from public.sol_jobs"));
    expect(seen).toEqual([{ id: mine }]);
    expect((await rows(d.user, "report_sol_jobs")).map((r) => r.job_id)).toEqual([mine]);
    expect((await db.as(d.user, (q) => q("select id from public.customers where id in ($1, (select customer_id from public.sol_jobs where id = $2))", [c, other]))).length).toBe(1);
    expect((await db.as(d.user, (q) => q("select id from public.sol_deliveries"))).length).toBe(1);
    await refused(call(d.user, "set_sol_job_status", mine, "in_progress"));
    await refused(call(d.user, "dispatch_sol_delivery", one(await db.sql("select id from public.sol_deliveries where sol_job_id = $1", [mine])).id));
    expect(await rows(d.user, "dashboard_open_work")).toContainEqual({ scope: "assigned", kind: "sol_delivery", waiting: "1" });
    const viewer = await db.createUser("viewer");
    expect((await db.as(viewer, (q) => q("select id from public.sol_jobs where id = any($1)", [[mine, other]]))).length).toBe(2);
    for (const fn of [["save_sol_job", null, "{}", "[]"], ["delete_sol_job", mine], ["cancel_sol_job", mine, "x"], ["complete_sol_job", mine, null], ["reopen_sol_job", mine, "x"], ["save_sol_delivery", null, mine, "{}", "[]"],
      ["return_sol_goods", randomUUID(), "{}", "[]"], ["release_sol_payment", randomUUID(), mine], ["record_expense", "{}"], ["record_sol_payment", mine, "{}"]] as [string, ...unknown[]][]) {
      await refused(call(viewer, ...fn));
    }
    await refused(db.as(b.admin, (q) => q("insert into public.sol_jobs (customer_id, contract_value) values ($1, 1)", [c])));
    await refused(db.as(b.admin, (q) => q("update public.sol_jobs set contract_value = 1 where id = $1", [mine])));
    await refused(db.as(b.admin, (q) => q("select cost_total from public.sol_deliveries")));
    for (const t of ["sol_job_items", "sol_deliveries", "sol_delivery_items", "sol_returns", "sol_return_items"]) await refused(db.as(b.admin, (q) => q(`delete from public.${t}`)));
    await refused(db.as(viewer, (q) => q("insert into public.sol_services (name_en) values ('x')")));
  });

  it("keeps expenses of someone who may not post as drafts", async () => {
    const entry = await db.createUser("data_entry");
    const job = await confirmed(await customer(db), "100");
    const x = await expense(entry, "SOL_DIRECT", "25.00", { sol_job_id: job });
    expect([one(await db.sql("select status::text s from public.expenses where id = $1", [x])).s, (await report(job)).direct_costs]).toEqual(["draft", "0"]);
    await refused(call(entry, "post_expense", x));
    await call(b.admin, "post_expense", x);
    expect((await report(job)).direct_costs).toBe("25.00");
    await expect(expense(b.admin, "FUEL", "0")).rejects.toMatchObject({ code: "23514" });
    await expect(expense(b.admin, "FUEL", "5", { financial_account_id: null })).rejects.toThrow(/account that paid/);
    await expect(expense(b.admin, "FUEL", "5", { date: "2099-01-01" })).rejects.toThrow(/future/);
    await expect(call(b.admin, "void_expense", x, "")).rejects.toThrow(/reason is required/);
    await invariants();
  });
});

describe("vehicles", () => {
  it("report their use and running costs", async () => {
    const d = await driver();
    const v = await vehicle(d.id);
    const job = await confirmed(await customer(db), "100");
    const del = await plan(b.admin, job, [], { vehicle_id: v, driver_id: d.id, odometer_start: 500, destination: "Sialkot" });
    await call(b.admin, "dispatch_sol_delivery", del);
    await expect(call(b.admin, "complete_sol_delivery", del, json({ odometer_end: 499 }), "[]")).rejects.toMatchObject({ code: "23514" });
    await call(b.admin, "complete_sol_delivery", del, json({ odometer_end: 640 }), "[]");
    await expense(b.admin, "FUEL", "1000.00", { vehicle_id: v, litres: "3.5", sol_job_id: job });
    await expense(b.admin, "FUEL", "500.50", { vehicle_id: v, litres: "1.75" });
    await expense(b.admin, "VEHICLE_MAINTENANCE", "300.00", { vehicle_id: v });
    await expense(b.admin, "VEHICLE_REPAIRS", "200.00", { vehicle_id: v });
    await expense(b.admin, "VEHICLE_OTHER", "50.00", { vehicle_id: v });
    await expense(b.admin, "MISC", "25.00", { vehicle_id: v });
    const r = one(await rows(b.admin, "report_vehicles", today, today, v));
    expect(r).toMatchObject({ jobs: "1", sol_deliveries: "1", sales_deliveries: "0", distance: "140", fuel: "1500.50", litres: "5.25", maintenance: "300.00", repairs: "200.00", other: "75.00", total: "2075.50", for_jobs: "1000.00" });
    expect(await rows(d.user, "report_vehicles", today, today, v)).toEqual([expect.objectContaining({ total: null, fuel: null, jobs: "1" })]);
    expect(await rows(d.user, "report_vehicle_log", today, today, null)).toEqual([expect.objectContaining({ kind: "sol", destination: "Sialkot", odometer_end: "640" })]);
    expect(await rows(await db.createUser("driver"), "report_vehicle_log", today, today, v)).toEqual([]);
    const manager = await db.createUser("manager");
    const id = one(await db.as(manager, (q) => q("insert into public.vehicles (registration_no, name, vehicle_type, make, model, fuel_type, ownership, driver_id, status) values ('LEC-9', 'Suzuki', 'Pickup', 'Suzuki', 'Ravi', 'petrol', 'owned', $1, 'out_of_service') returning id, is_active", [d.id])));
    expect(id.is_active).toBe(false);
    await refused(db.as(manager, (q) => q("update public.vehicles set is_active = true where id = $1", [id.id])));
    expect((await rows(d.user, "list_drivers")).find((x) => x.driver_id === d.id)).toMatchObject({ is_active: true });
    await invariants();
  });
});

describe("reports", () => {
  it("agree with the ledgers", async () => {
    const all = await rows(b.admin, "report_sol_jobs");
    const sum = (list: Row[], k: string) => list.reduce((n, r) => n + paisa(r[k]), 0);
    const done = all.filter((r) => r.status === "completed");
    expect(sum(done, "contract_value")).toBe(-(await gl("SOL_REVENUE")));
    const jobExpenses = paisa(one(await db.sql("select coalesce(sum(amount), 0) v from public.expenses where status = 'posted' and sol_job_id is not null")).v);
    const products = paisa(one(await db.sql("select coalesce(sum(l.debit - l.credit), 0) v from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id join public.chart_of_accounts a on a.id = l.account_id and a.system_key = 'SOL_COSTS' where e.source_type in ('sol_delivery', 'sol_return')")).v);
    expect(sum(all, "direct_costs") + sum(all, "vehicle_expenses")).toBe(jobExpenses + products);
    const s = JSON.parse(json((await call(b.admin, "sol_summary", "2020-01-01", "2100-01-01")))) as Record<string, string | number>;
    expect(s).toMatchObject({
      total_jobs: all.filter((r) => r.status !== "draft").length, completed_jobs: done.length, pending_jobs: all.filter((r) => ["confirmed", "in_progress"].includes(r.status as string)).length,
    });
    expect([paisa(s.received), paisa(s.pending_payments), paisa(s.direct_costs), paisa(s.vehicle_expenses), paisa(s.profit)])
      .toEqual([sum(all, "received"), sum(all, "pending"), sum(all, "direct_costs"), sum(all, "vehicle_expenses"), sum(all, "profit")]);
    expect(paisa(s.contract_value)).toBe(paisa(s.received) + paisa(s.pending_payments));
    expect((await rows(b.admin, "report_sol_jobs", null, null, "pending")).every((r) => ["confirmed", "in_progress"].includes(r.status as string))).toBe(true);
    const position = JSON.parse(json(await call(b.admin, "dashboard_position"))) as { sol_pending: { amount: string } };
    expect(paisa(position.sol_pending.amount)).toBe(paisa(s.due_now));
    const viewer = JSON.parse(json(await call(await db.createUser("viewer"), "sol_summary", "2020-01-01", "2100-01-01"))) as object;
    expect(Object.keys(viewer).sort()).toEqual(["cancelled_jobs", "completed_jobs", "contract_value", "draft_jobs", "overdue_jobs", "pending_jobs", "total_jobs"]);
    await refused(rows(await db.createUser("order_taker"), "report_sol_jobs"));
  });

  it("stay correct through random operations", async () => {
    let seed = Number(process.env.SEED ?? 20261127);
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor((seed / 2147483648) * n); };
    const pick = <T,>(list: T[]): T => {
      if (list.length === 0) throw Object.assign(new Error("nothing to pick"), { code: "P0002" });
      return list[rnd(list.length)]!;
    };
    const clients = [await customer(db), await customer(db)];
    const ps = [await product(db, b), await product(db, b)];
    for (const p of ps) await openingStock(db, b, p, 400, `${3 + rnd(20)}.${10 + rnd(89)}`);
    const v = await vehicle();
    const jobs: string[] = [];
    const count: Record<string, number> = {};
    const attempt = async (name: string, f: () => Promise<unknown>) => {
      try { await f(); count[name] = (count[name] ?? 0) + 1; } catch (e) {
        // Only refusals by the rules; anything else is a bug.
        if (!["23514", "22023", "P0002", "23502"].includes((e as { code?: string }).code ?? "")) throw e;
      }
    };
    for (let i = 0; i < 400; i++) {
      const job = jobs.length ? pick(jobs) : "";
      const op = jobs.length < 4 ? 0 : rnd(12);
      if (op === 0) await attempt("job", async () => { jobs.push(await confirmed(pick(clients), `${rnd(3000)}.${10 + rnd(89)}`, ps.map((p) => ({ kind: "product", product_id: p, unit_id: b.units.PCS, quantity: 1 + rnd(20), unit_price: "9.99" })))); });
      else if (op <= 3) await attempt("plan", async () => {
        const list = await items(job) as unknown as { id: string; quantity: number }[];
        await call(b.admin, "dispatch_sol_delivery", await plan(b.admin, job, list.map((l) => [l.id, rnd(Math.max(2, l.quantity))] as [string, number]), { vehicle_id: v }));
      });
      else if (op <= 5) await attempt("deliver", async () => {
        const d = pick(await db.sql("select id from public.sol_deliveries where status = 'dispatched'") as { id: string }[]);
        const back = rnd(2) ? (await deliveryItems(d.id)).map((x) => ({ delivery_item_id: x.id, quantity: rnd(Number(x.quantity) + 1) })).filter((x) => x.quantity > 0) : [];
        await call(b.admin, "complete_sol_delivery", d.id, json({ return_reason: "back" }), json(back));
      });
      else if (op === 6) await attempt("return", async () => {
        const d = pick(await db.sql("select id from public.sol_deliveries where status = 'delivered'") as { id: string }[]);
        await call(b.admin, "return_sol_goods", d.id, json({ warehouse_id: b.mainWarehouse, reason: "back" }), json([{ delivery_item_id: pick(await deliveryItems(d.id)).id, quantity: 1 + rnd(4) }]));
      });
      else if (op === 7) await attempt("pay", () => pay(b.admin, job, `${1 + rnd(900)}.${10 + rnd(89)}`));
      else if (op === 8) await attempt("expense", () => expense(b.admin, pick(["FUEL", "SOL_DIRECT", "VEHICLE_REPAIRS"]), `${1 + rnd(300)}.50`, { sol_job_id: job, vehicle_id: rnd(2) ? v : null }));
      else if (op === 9) await attempt("complete", async () => {
        for (const d of await db.sql("select id from public.sol_deliveries where sol_job_id = $1 and status = 'draft'", [job])) await call(b.admin, "cancel_sol_delivery", d.id);
        await call(b.admin, "complete_sol_job", job, null);
      });
      else if (op === 10) await attempt("reopen", () => call(b.admin, rnd(4) ? "reopen_sol_job" : "cancel_sol_job", job, "test"));
      else await attempt("void", async () => {
        if (rnd(2)) await call(b.admin, "void_expense", pick(await db.sql("select id from public.expenses where status = 'posted' and sol_job_id = any($1)", [jobs]) as { id: string }[]).id, "x");
        else await call(b.admin, "void_customer_payment", pick(await db.sql("select id from public.customer_payments where status = 'posted' and sol_job_id = any($1)", [jobs]) as { id: string }[]).id, "x");
      });
      if (i % 100 === 99) await invariants();
    }
    expect(Object.keys(count).length).toBeGreaterThan(6);
    for (const r of await rows(b.admin, "report_sol_jobs")) {
      if (r.status === "completed") expect(paisa(r.profit)).toBe(paisa(r.contract_value) - paisa(r.direct_costs) - paisa(r.vehicle_expenses));
      expect(paisa(r.direct_costs)).toBeGreaterThanOrEqual(0);
    }
  }, 120_000);
});
