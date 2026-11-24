import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDb, one, type Query, type TestDb } from "./helpers";
import {
  basics, cashAccount, customer, directSale, employee, glBalance, openingStock, product, stock, type Basics,
} from "./fixtures";

let db: TestDb;
let b: Basics;
let cash: string;

beforeAll(async () => {
  db = await createTestDb();
  b = await basics(db);
  cash = await cashAccount(db);
});
afterAll(() => db.close());

async function order(q: Query, customerId: string, lines: { product: string; unit: string; qty: number; price: string; discount?: string }[]) {
  const so = one(await q("insert into public.sales_orders (customer_id, warehouse_id) values ($1, $2) returning id", [customerId, b.mainWarehouse])).id as string;
  const ids: string[] = [];
  for (const l of lines) {
    ids.push(one(await q(
      "insert into public.sales_order_items (sales_order_id, product_id, unit_id, quantity, unit_price, discount_amount) values ($1, $2, $3, $4, $5, $6) returning id",
      [so, l.product, l.unit, l.qty, l.price, l.discount ?? "0"])).id as string);
  }
  return { so, ids };
}

const approve = async (q: Query, so: string) => {
  await q("select public.submit_sales_order($1)", [so]);
  await q("select public.approve_sales_order($1)", [so]);
};
const pick = (q: Query, so: string) => q("select public.start_picking($1)", [so]);

async function deliver(q: Query, so: string, lines: [string, number][]) {
  const d = one(await q("insert into public.deliveries (sales_order_id) values ($1) returning id", [so])).id;
  for (const [item, qty] of lines) {
    await q("insert into public.delivery_items (delivery_id, sales_order_item_id, quantity) values ($1, $2, $3)", [d, item, qty]);
  }
  return one(await q("select public.dispatch_delivery($1) as invoice", [d])).invoice as string;
}

describe("sales orders, reservations and deliveries", () => {
  it("reserves on approval and converts the reservation on dispatch", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 100, "5.00");
    const { so, ids } = await db.as(b.admin, async (q) => {
      const r = await order(q, c, [{ product: p, unit: b.units.BOX, qty: 2, price: "120.00" }, { product: p, unit: b.units.PCS, qty: 10, price: "11.00" }]);
      await approve(q, r.so);
      return r;
    });
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 100, reserved: 34 });

    await expect(db.as(b.admin, (q) => deliver(q, so, [[ids[0]!, 1]]))).rejects.toThrow(/start picking before dispatch/);
    await db.as(b.admin, (q) => pick(q, so));
    const inv = await db.as(b.admin, (q) => deliver(q, so, [[ids[0]!, 1]]));
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 88, reserved: 22 });
    expect(one(await db.sql("select status from public.sales_orders where id = $1", [so])).status).toBe("partially_dispatched");
    expect(one(await db.sql("select status, total_amount, cost_total from public.sales_invoices where id = $1", [inv])))
      .toEqual({ status: "posted", total_amount: "120.00", cost_total: "60.00" });

    await db.as(b.admin, (q) => deliver(q, so, [[ids[0]!, 1], [ids[1]!, 10]]));
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 66, reserved: 0 });
    expect(one(await db.sql("select status from public.sales_orders where id = $1", [so])).status).toBe("dispatched");
    await expect(db.as(b.admin, (q) => deliver(q, so, [[ids[1]!, 1]]))).rejects.toThrow(/is dispatched; start picking/);
  });

  it("does not let reserved stock be promised twice or written off", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 40, "5.00");
    await db.as(b.admin, async (q) => {
      const { so } = await order(q, c, [{ product: p, unit: b.units.PCS, qty: 34, price: "9.00" }]);
      await approve(q, so);
    });
    await expect(db.as(b.admin, async (q) => {
      const { so } = await order(q, c, [{ product: p, unit: b.units.PCS, qty: 7, price: "9.00" }]);
      await approve(q, so);
    })).rejects.toThrow(/Insufficient available stock/);
    await expect(directSale(db, b, c, p, 7, b.units.PCS, "9.00")).rejects.toThrow(/reserved for approved orders/);
  });

  it("releases the reservation when an order is cancelled", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 10, "5.00");
    await db.as(b.admin, async (q) => {
      const { so } = await order(q, c, [{ product: p, unit: b.units.PCS, qty: 10, price: "9.00" }]);
      await approve(q, so);
      await q("select public.cancel_sales_order($1)", [so]);
    });
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 10, reserved: 0 });
  });

  it("splits a line discount across partial dispatches without losing paisa", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 36, "5.00");
    const discounts = await db.as(b.admin, async (q) => {
      const { so, ids } = await order(q, c, [{ product: p, unit: b.units.BOX, qty: 3, price: "100.00", discount: "10.00" }]);
      await approve(q, so);
      await pick(q, so);
      const out: unknown[] = [];
      for (let i = 0; i < 3; i++) {
        const inv = await deliver(q, so, [[ids[0]!, 1]]);
        out.push(one(await q("select discount_amount from public.sales_invoice_items where sales_invoice_id = $1", [inv])).discount_amount);
      }
      return out;
    });
    expect(discounts).toEqual(["3.33", "3.34", "3.33"]);
  });
});

describe("credit limits and tax", () => {
  it("blocks orders over the credit limit unless overridden with permission", async () => {
    const p = await product(db, b);
    await openingStock(db, b, p, 100, "5.00");
    const c = await customer(db, { creditLimit: "1000.00" });
    const so = await db.as(b.admin, async (q) => (await order(q, c, [{ product: p, unit: b.units.PCS, qty: 60, price: "20.00" }])).so);
    await db.as(b.admin, (q) => q("select public.submit_sales_order($1)", [so]));
    await expect(db.as(b.admin, (q) => q("select public.approve_sales_order($1)", [so]))).rejects.toThrow(/Credit limit exceeded/);
    await db.as(b.admin, (q) => q("select public.approve_sales_order($1, true)", [so]));
    expect(one(await db.sql("select status from public.sales_orders where id = $1", [so])).status).toBe("approved");
  });

  it("charges the product tax rate and credits tax payable", async () => {
    const p = await product(db, b, { taxRate: 18 });
    const c = await customer(db);
    await openingStock(db, b, p, 10, "5.00");
    const before = Number(await glBalance(db, "TAX_OUTPUT"));
    const inv = await directSale(db, b, c, p, 10, b.units.PCS, "10.00");
    expect(one(await db.sql("select subtotal, tax_total, total_amount from public.sales_invoices where id = $1", [inv])))
      .toEqual({ subtotal: "100.00", tax_total: "18.00", total_amount: "118.00" });
    expect(Number(await glBalance(db, "TAX_OUTPUT")) - before).toBe(-18);
  });
});

describe("customer returns and payments", () => {
  it("returns stock at the original cost, routes damaged goods to quarantine and reduces the balance", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 20, "6.00");
    const inv = await directSale(db, b, c, p, 20, b.units.PCS, "10.00");
    await openingStock(db, b, p, 10, "9.00"); // average is now 9.00; returns must still come back at 6.00
    const invItem = one(await db.sql("select id from public.sales_invoice_items where sales_invoice_id = $1", [inv])).id;

    const post = (lines: [number, "saleable" | "damaged"][]) => db.as(b.admin, async (q) => {
      const r = one(await q("insert into public.customer_returns (customer_id, sales_invoice_id, warehouse_id, damaged_warehouse_id) values ($1, $2, $3, $4) returning id", [c, inv, b.mainWarehouse, b.damagedWarehouse])).id;
      for (const [qty, condition] of lines) {
        await q("insert into public.customer_return_items (customer_return_id, sales_invoice_item_id, product_id, unit_id, quantity, unit_price, condition) values ($1, $2, $3, $4, $5, 10, $6)", [r, invItem, p, b.units.PCS, qty, condition]);
      }
      await q("select public.post_customer_return($1)", [r]);
      return r;
    });

    const r = await post([[5, "saleable"], [2, "damaged"]]);
    expect(one(await db.sql("select cost_total, total_amount from public.customer_returns where id = $1", [r])))
      .toEqual({ cost_total: "42.00", total_amount: "70.00" });
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 15, reserved: 0 });
    expect(await stock(db, p, b.damagedWarehouse)).toEqual({ onHand: 2, reserved: 0 });
    expect(one(await db.sql("select outstanding from public.v_sales_invoice_balances where sales_invoice_id = $1", [inv])).outstanding).toBe("130.00");
    await expect(post([[14, "saleable"]])).rejects.toThrow(/exceeds the invoiced quantity/);
  });

  it("allocates partial customer payments", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 100, "5.00");
    const inv = await directSale(db, b, c, p, 100, b.units.PCS, "10.00");
    const collect = (amount: string) => db.as(b.admin, async (q) => {
      const id = one(await q("insert into public.customer_payments (customer_id, amount, financial_account_id, method, client_request_id) values ($1, $2, $3, 'cash', $4) returning id", [c, amount, cash, randomUUID()])).id as string;
      await q("select public.post_customer_payment($1)", [id]);
      await q("select public.allocate_customer_payment($1, $2, $3)", [id, inv, amount]);
      return id;
    });
    const status = async () => one(await db.sql("select payment_status, outstanding from public.v_sales_invoice_balances where sales_invoice_id = $1", [inv]));

    await collect("300.00");
    expect(await status()).toEqual({ payment_status: "partially_paid", outstanding: "700.00" });
    await expect(collect("700.01")).rejects.toThrow(/invoice balance/);
    await collect("700.00");
    expect(await status()).toEqual({ payment_status: "paid", outstanding: "0.00" });
    expect(one(await db.sql("select balance from public.v_customer_balances where customer_id = $1", [c])).balance).toBe("0.00");
  });
});

describe("SOL", () => {
  it("books job revenue on completion and tracks payments and profit", async () => {
    const client = await customer(db);
    const vehicle = one(await db.sql("insert into public.vehicles (registration_no, name) values ('LES-101', 'Truck') returning id")).id;
    const job = await db.as(b.admin, async (q) =>
      one(await q("select public.save_sol_job(null, jsonb_build_object('customer_id', $1::uuid, 'job_type_id', (select id from public.sol_job_types limit 1), 'contract_value', 25000), '[]') id", [client])).id as string);
    await expect(db.as(b.admin, (q) => q("select public.complete_sol_job($1)", [job]))).rejects.toThrow(/is draft/);
    await db.as(b.admin, async (q) => {
      await q("select public.set_sol_job_status($1, 'confirmed')", [job]);
      await q("select public.complete_sol_job($1)", [job]);
      const pay = one(await q("insert into public.customer_payments (customer_id, amount, financial_account_id, method, reference) values ($1, 15000, $2, 'bank_transfer', 'TXN-77') returning id", [client, cash])).id;
      await q("select public.post_customer_payment($1)", [pay]);
      await q("select public.allocate_payment_to_sol_job($1, $2, 15000)", [pay, job]);
      const fuel = one(await q("select id from public.expense_categories where code = 'FUEL'")).id;
      await q("select public.record_expense(jsonb_build_object('category_id', $1::uuid, 'amount', 6000, 'financial_account_id', $2::uuid, 'sol_job_id', $3::uuid, 'vehicle_id', $4::uuid, 'method', 'cash', 'payee', 'Pump', 'description', 'Fuel', 'no_receipt_reason', 'None'))", [fuel, cash, job, vehicle]);
    });
    expect(one(await db.as(b.admin, (q) => q("select received_amount, pending_amount from public.v_sol_job_summary where sol_job_id = $1", [job]))))
      .toEqual({ received_amount: "15000.00", pending_amount: "10000.00" });
    expect(one(await db.as(b.admin, (q) => q("select direct_costs, vehicle_expenses, profit from public.report_sol_jobs(p_job_id => $1)", [job]))))
      .toEqual({ direct_costs: "0", vehicle_expenses: "6000.00", profit: "19000.00" });
    expect(one(await db.sql("select balance from public.v_customer_balances where customer_id = $1", [client])).balance).toBe("10000.00");
  });

  it("sells stock from a vehicle warehouse on a trip", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 50, "4.00");
    const vehicle = one(await db.sql("insert into public.vehicles (registration_no, name) values ('LES-202', 'Van') returning id")).id;
    const van = one(await db.sql("insert into public.warehouses (code, name_en, warehouse_type, vehicle_id) values ('VAN-202', 'Van 202', 'vehicle', $1) returning id", [vehicle])).id as string;
    const trip = await db.as(b.admin, async (q) => {
      const trip = one(await q("insert into public.sol_trips (vehicle_id, warehouse_id, route) values ($1, $2, 'Route A') returning id", [vehicle, van])).id as string;
      const t = one(await q("insert into public.stock_transfers (from_warehouse_id, to_warehouse_id, sol_trip_id) values ($1, $2, $3) returning id", [b.mainWarehouse, van, trip])).id;
      await q("insert into public.stock_transfer_items (stock_transfer_id, product_id, unit_id, quantity) values ($1, $2, $3, 30)", [t, p, b.units.PCS]);
      await q("select public.post_stock_transfer($1)", [t]);
      const inv = one(await q("insert into public.sales_invoices (customer_id, warehouse_id, sol_trip_id) values ($1, $2, $3) returning id", [c, van, trip])).id;
      await q("insert into public.sales_invoice_items (sales_invoice_id, product_id, unit_id, quantity, unit_price) values ($1, $2, $3, 25, 7)", [inv, p, b.units.PCS]);
      await q("select public.post_sales_invoice($1)", [inv]);
      return trip;
    });
    expect(await stock(db, p, van)).toEqual({ onHand: 5, reserved: 0 });
    expect(one(await db.as(b.admin, (q) => q("select sales_amount, cost_of_goods, profit from public.secure_sol_trip_profitability where sol_trip_id = $1", [trip]))))
      .toEqual({ sales_amount: "175.00", cost_of_goods: "100.00", profit: "75.00" });
  });
});

describe("expenses and payroll", () => {
  it("posts and voids an expense", async () => {
    const before = await glBalance(db, "INVENTORY");
    const id = await db.as(b.admin, async (q) => {
      const rent = one(await q("select id from public.expense_categories where code = 'RENT'")).id;
      const id = one(await q("select public.record_expense(jsonb_build_object('category_id', $1::uuid, 'amount', 45000, 'financial_account_id', $2::uuid, 'method', 'cash', 'payee', 'Owner', 'description', 'Rent', 'no_receipt_reason', 'None')) id", [rent, cash])).id;
      await q("select public.void_expense($1, 'wrong month')", [id]);
      return id;
    });
    expect(one(await db.sql("select status from public.expenses where id = $1", [id])).status).toBe("void");
    const rentBalance = one(await db.as(b.admin, (q) => q("select balance from public.v_account_balances where code = '6300'"))).balance;
    expect(rentBalance).toBe("0.00");
    expect(await glBalance(db, "INVENTORY")).toBe(before);
  });

  it("recovers advances through payroll and pays salaries in parts", async () => {
    const e = await employee(db);
    const item = await db.as(b.admin, async (q) => {
      await q("select public.record_advance(jsonb_build_object('employee_id', $1::uuid, 'amount', 5000, 'financial_account_id', $2::uuid, 'method', 'cash'))", [e, cash]);
      const run = one(await q("select public.prepare_payroll('2026-02-01') id")).id;
      await q("select public.save_payroll($1, jsonb_build_array(jsonb_build_object('employee_id', $2::uuid, 'basic_salary', 30000, 'allowances', 2000, 'deductions', 500, 'advance_recovery', 2000)))", [run, e]);
      const item = one(await q("select id, net_pay from public.payroll_items where payroll_run_id = $1", [run]));
      expect(item.net_pay).toBe("29500.00");
      await q("select public.post_payroll_run($1)", [run]);
      return item.id as string;
    });
    expect(one(await db.sql("select advances_outstanding, salary_payable from public.v_employee_balances where employee_id = $1", [e])))
      .toEqual({ advances_outstanding: "3000.00", salary_payable: "29500.00" });

    const paySalary = (amount: string) => db.as(b.admin, async (q) => {
      await q("select public.pay_salaries((select payroll_run_id from public.payroll_items where id = $1), jsonb_build_object('financial_account_id', $3::uuid, 'method', 'cash'), jsonb_build_array(jsonb_build_object('payroll_item_id', $1::uuid, 'amount', $2::numeric)))", [item, amount, cash]);
    });
    await paySalary("10000.00");
    await expect(paySalary("19500.01")).rejects.toThrow(/exceeds the salary due/);
    await paySalary("19500.00");
    expect(one(await db.sql("select due_amount from public.v_salary_balances where payroll_item_id = $1", [item])).due_amount).toBe("0.00");
  });

  it("rejects recovering more than the outstanding advance", async () => {
    const e = await employee(db);
    await expect(db.as(b.admin, async (q) => {
      const run = one(await q("select public.prepare_payroll('2026-03-01') id")).id;
      await q("select public.save_payroll($1, jsonb_build_array(jsonb_build_object('employee_id', $2::uuid, 'basic_salary', 20000, 'advance_recovery', 100)))", [run, e]);
      await q("select public.post_payroll_run($1)", [run]);
    })).rejects.toThrow(/exceeds the outstanding advance/);
  });
});
