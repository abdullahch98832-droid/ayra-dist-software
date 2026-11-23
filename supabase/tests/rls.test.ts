import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, one, type TestDb } from "./helpers";
import { basics, customer, employee, openingStock, product, type Basics } from "./fixtures";

let db: TestDb;
let b: Basics;
let p: string;

beforeAll(async () => {
  db = await createTestDb();
  b = await basics(db);
  p = await product(db, b);
  await openingStock(db, b, p, 100, "5.00");
});
afterAll(() => db.close());

describe("anonymous and unassigned users", () => {
  it("denies anon all table access", async () => {
    await expect(db.asAnon((q) => q("select * from public.customers"))).rejects.toMatchObject({ code: "42501" });
    await expect(db.asAnon((q) => q("select public.my_permissions()"))).rejects.toMatchObject({ code: "42501" });
  });

  it("gives a signed-in user without a role nothing", async () => {
    const u = await db.createUser(null);
    await customer(db);
    const seen = await db.as(u, async (q) => ({
      customers: (await q("select id from public.customers")).length,
      products: (await q("select id from public.products")).length,
      permissions: (await q("select * from public.my_permissions()")).length,
      settings: (await q("select key from public.app_settings")).length,
    }));
    expect(seen).toEqual({ customers: 0, products: 0, permissions: 0, settings: 0 });
    await expect(db.as(u, (q) => q("select public.create_manual_journal(current_date, 'x', '[]')"))).rejects.toThrow(/Permission denied/);
  });

  it("stops deactivated users", async () => {
    const u = await db.createUser("super_admin");
    await db.sql("update public.profiles set is_active = false where id = $1", [u]);
    expect(await db.as(u, (q) => q("select id from public.customers"))).toEqual([]);
  });
});

describe("profile privilege escalation", () => {
  it("lets users edit their own name but not their role", async () => {
    const u = await db.createUser("viewer");
    await db.as(u, (q) => q("update public.profiles set full_name = 'Ali' where id = (select auth.uid())"));
    await expect(db.as(u, (q) => q("update public.profiles set role_id = (select id from public.roles where code = 'admin') where id = (select auth.uid())")))
      .rejects.toThrow(/Only administrators/);
    await expect(db.as(u, (q) => q("insert into public.role_permissions (role_id, permission_code) select role_id, 'users.manage' from public.profiles where id = (select auth.uid())")))
      .rejects.toMatchObject({ code: "42501" });
  });
});

describe("order takers", () => {
  it("see and create only their own orders, cannot approve, and see stock but not cost", async () => {
    const meEmp = await employee(db);
    const otherEmp = await employee(db);
    const me = await db.createUser("order_taker", { employeeId: meEmp });
    const c = await customer(db, { orderTakerId: meEmp });
    await db.sql("insert into public.sales_orders (customer_id, warehouse_id, order_taker_id) values ($1, $2, $3)", [c, b.mainWarehouse, otherEmp]);

    const mine = await db.as(me, async (q) => {
      const so = one(await q("insert into public.sales_orders (customer_id, warehouse_id, order_taker_id) values ($1, $2, $3) returning id", [c, b.mainWarehouse, meEmp])).id;
      await q("insert into public.sales_order_items (sales_order_id, product_id, unit_id, quantity, unit_price) values ($1, $2, $3, 1, 100)", [so, p, b.units.BOX]);
      await q("select public.submit_sales_order($1)", [so]);
      return so;
    });
    const visible = await db.as(me, (q) => q("select id, status from public.sales_orders"));
    expect(visible).toEqual([{ id: mine, status: "submitted" }]);

    await expect(db.as(me, (q) => q("insert into public.sales_orders (customer_id, warehouse_id, order_taker_id) values ($1, $2, $3)", [c, b.mainWarehouse, otherEmp])))
      .rejects.toMatchObject({ code: "42501" });
    await expect(db.as(me, (q) => q("select public.approve_sales_order($1)", [mine]))).rejects.toThrow(/Permission denied: sales.approve/);

    const stockRow = one(await db.as(me, (q) => q("select available, avg_unit_cost from public.v_stock_on_hand where product_id = $1", [p])));
    expect(stockRow).toEqual({ available: "100", avg_unit_cost: "0" });
    expect(await db.as(me, (q) => q("select * from public.inventory_valuation"))).toEqual([]);
  });
});

describe("system-managed data", () => {
  it("refuses client writes to ledgers", async () => {
    const admin = b.admin;
    await expect(db.as(admin, (q) => q("insert into public.stock_movements (movement_date, product_id, warehouse_id, movement_type, quantity, balance_after, source_type, source_id) values (current_date, $1, $2, 'opening', 1, 1, 'x', gen_random_uuid())", [p, b.mainWarehouse])))
      .rejects.toMatchObject({ code: "42501" });
    await expect(db.as(admin, (q) => q("update public.stock_balances set on_hand = 999"))).rejects.toMatchObject({ code: "42501" });
    await expect(db.as(admin, (q) => q("insert into public.journal_entries (entry_date, description) values (current_date, 'x')"))).rejects.toMatchObject({ code: "42501" });
    await expect(db.as(admin, (q) => q("delete from public.audit_logs"))).rejects.toMatchObject({ code: "42501" });
  });

  it("refuses client writes to status, totals and costs", async () => {
    const c = await customer(db);
    await expect(db.as(b.admin, (q) => q("insert into public.sales_invoices (customer_id, warehouse_id, status) values ($1, $2, 'posted')", [c, b.mainWarehouse])))
      .rejects.toMatchObject({ code: "42501" });
    const inv = await db.as(b.admin, async (q) => one(await q("insert into public.sales_invoices (customer_id, warehouse_id) values ($1, $2) returning id", [c, b.mainWarehouse])).id);
    await expect(db.as(b.admin, (q) => q("update public.sales_invoices set total_amount = 1 where id = $1", [inv]))).rejects.toMatchObject({ code: "42501" });
    await expect(db.as(b.admin, (q) => q("update public.sales_invoices set status = 'posted' where id = $1", [inv]))).rejects.toMatchObject({ code: "42501" });
  });

  it("makes posted documents read-only", async () => {
    const c = await customer(db);
    const inv = await db.as(b.admin, async (q) => {
      const inv = one(await q("insert into public.sales_invoices (customer_id, warehouse_id) values ($1, $2) returning id", [c, b.mainWarehouse])).id;
      await q("insert into public.sales_invoice_items (sales_invoice_id, product_id, unit_id, quantity, unit_price) values ($1, $2, $3, 1, 10)", [inv, p, b.units.PCS]);
      await q("select public.post_sales_invoice($1)", [inv]);
      return inv;
    });
    const updated = await db.as(b.admin, (q) => q("update public.sales_invoices set notes = 'edited' where id = $1 returning id", [inv]));
    expect(updated).toEqual([]);
    const lines = await db.as(b.admin, (q) => q("update public.sales_invoice_items set unit_price = 1 where sales_invoice_id = $1 returning id", [inv]));
    expect(lines).toEqual([]);
    const deleted = await db.as(b.admin, (q) => q("delete from public.sales_invoices where id = $1 returning id", [inv]));
    expect(deleted).toEqual([]);
  });
});

describe("role separation", () => {
  it("lets warehouse staff transfer and count but not post adjustments", async () => {
    const wh = await db.createUser("warehouse");
    await expect(db.as(wh, async (q) => {
      const adj = one(await q("insert into public.stock_adjustments (warehouse_id, kind) values ($1, 'other') returning id", [b.mainWarehouse])).id;
      await q("select public.post_stock_adjustment($1)", [adj]);
    })).rejects.toMatchObject({ code: "42501" });
    await db.as(wh, async (q) => {
      const t = one(await q("insert into public.stock_transfers (from_warehouse_id, to_warehouse_id) values ($1, $2) returning id", [b.mainWarehouse, b.damagedWarehouse])).id;
      await q("insert into public.stock_transfer_items (stock_transfer_id, product_id, unit_id, quantity) values ($1, $2, $3, 1)", [t, p, b.units.PCS]);
      await q("select public.post_stock_transfer($1)", [t]);
    });
  });

  it("shows drivers only deliveries assigned to them", async () => {
    const drvEmp = await employee(db);
    const driverUser = await db.createUser("driver", { employeeId: drvEmp });
    const driverId = one(await db.sql("insert into public.drivers (employee_id) values ($1) returning id", [drvEmp])).id;
    const c = await customer(db);
    const so = one(await db.sql("insert into public.sales_orders (customer_id, warehouse_id) values ($1, $2) returning id", [c, b.mainWarehouse])).id;
    const mine = one(await db.sql("insert into public.deliveries (sales_order_id, driver_id) values ($1, $2) returning id", [so, driverId])).id;
    await db.sql("insert into public.deliveries (sales_order_id) values ($1)", [so]);
    expect(await db.as(driverUser, (q) => q("select id from public.deliveries"))).toEqual([{ id: mine }]);
  });
});

describe("audit log", () => {
  it("records who changed what, visible only with audit.view", async () => {
    const c = await customer(db);
    await db.as(b.admin, (q) => q("update public.customers set phone = '0300-1234567' where id = $1", [c]));
    const log = one(await db.sql("select user_id, old_data ->> 'phone' old_phone, new_data ->> 'phone' new_phone from public.audit_logs where table_name = 'customers' and record_id = $1 and action = 'UPDATE'", [c]));
    expect(log).toEqual({ user_id: b.admin, old_phone: null, new_phone: "0300-1234567" });

    const accountant = await db.createUser("accountant");
    const viewer = await db.createUser("viewer");
    expect((await db.as(accountant, (q) => q("select id from public.audit_logs limit 1"))).length).toBe(1);
    expect(await db.as(viewer, (q) => q("select id from public.audit_logs limit 1"))).toEqual([]);
  });
});

describe("storage", () => {
  it("limits attachment folders by module permission", async () => {
    const accountant = await db.createUser("accountant");
    const orderTaker = await db.createUser("order_taker");
    await db.as(accountant, (q) => q("insert into storage.objects (bucket_id, name) values ('attachments', 'expenses/receipt-1.pdf')"));
    await expect(db.as(orderTaker, (q) => q("insert into storage.objects (bucket_id, name) values ('attachments', 'expenses/receipt-2.pdf')")))
      .rejects.toMatchObject({ code: "42501" });
    await expect(db.as(accountant, (q) => q("insert into storage.objects (bucket_id, name) values ('attachments', 'unknown/x.pdf')")))
      .rejects.toMatchObject({ code: "42501" });
    expect(await db.as(orderTaker, (q) => q("select name from storage.objects"))).toEqual([]);
  });
});
