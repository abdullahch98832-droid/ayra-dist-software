// Phase 10: what documents say. Every total is compared with sums made here from the saved lines.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, one, type TestDb } from "./helpers";
import { basics, customer, directSale, employee, openingStock, product, receive, supplier, type Basics } from "./fixtures";

let db: TestDb;
let b: Basics;
let today: string;
let cash: string;

beforeAll(async () => {
  db = await createTestDb();
  b = await basics(db);
  today = one(await db.sql("select private.business_today()::text as d")).d as string;
  await db.sql("update public.profiles set full_name = 'Owner' where id = $1", [b.admin]);
  cash = one(await db.sql("insert into public.financial_accounts (name, account_type) values ('Cash in hand', 'cash') returning id")).id as string;
});
afterAll(() => db.close());

/* eslint-disable @typescript-eslint/no-explicit-any */
const doc = async (user: string, kind: string, id: string): Promise<any> => one(await db.as(user, (q) => q("select public.document_data($1, $2) as d", [kind, id]))).d;
const statement = async (user: string, kind: string, id: string, from = "2000-01-01", to = "2999-12-31"): Promise<any> =>
  one(await db.as(user, (q) => q("select public.document_statement($1, $2, $3, $4) as d", [kind, id, from, to]))).d;
const call = async (fn: string, ...args: unknown[]) => one(await db.as(b.admin, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args))).r as string;
const json = (v: unknown) => JSON.stringify(v);
const paisa = (v: string | number) => Math.round(Number(v) * 100);
const sum = (rows: any[], key: string) => rows.reduce((n, r) => n + paisa(r[key]), 0);
const text = (v: unknown) => expect(v).toMatch(/^-?\d+\.\d\d$/);

/** A posted sale with tax and discounts. */
async function invoice(customerId: string) {
  const p = await product(db, b, { taxRate: 17 });
  const p2 = await product(db, b);
  await openingStock(db, b, p, 500, "10.33");
  await openingStock(db, b, p2, 500, "7.10");
  return db.as(b.admin, async (q) => {
    const id = one(await q("insert into public.sales_invoices (customer_id, warehouse_id, due_date) values ($1, $2, current_date + 10) returning id", [customerId, b.mainWarehouse])).id as string;
    await q("insert into public.sales_invoice_items (sales_invoice_id, product_id, unit_id, quantity, unit_price, discount_amount) values ($1, $2, $3, 7, 15.55, 3.33), ($1, $4, $5, 2, 180, 0)", [id, p, b.units.PCS, p2, b.units.BOX]);
    await q("select public.post_sales_invoice($1)", [id]);
    return id;
  });
}
const pay = async (customerId: string, amount: string, invoiceId?: string, part?: string) => {
  const id = await db.as(b.admin, async (q) => one(await q("insert into public.customer_payments (customer_id, amount, financial_account_id, method, reference) values ($1, $2, $3, 'bank_transfer', 'REF-1') returning id", [customerId, amount, cash])).id as string);
  await call("post_customer_payment", id);
  if (invoiceId) await call("allocate_customer_payment", id, invoiceId, part ?? amount);
  return id;
};

describe("sales documents", () => {
  it("an invoice adds up: lines, discounts, tax, total, paid and outstanding", async () => {
    const c = await customer(db);
    const id = await invoice(c);
    await pay(c, "100.50", id);
    const d = await doc(b.admin, "sales_invoice", id);
    expect(d.lines).toHaveLength(2);
    for (const l of d.lines) {
      text(l.total);
      expect(paisa(l.total)).toBe(Math.round(Number(l.quantity) * paisa(l.price)) - paisa(l.discount) + paisa(l.tax));
      expect(l.unit.en).toBeTruthy();
    }
    expect(sum(d.lines, "total")).toBe(paisa(d.totals.total));
    expect(d.totals.lines).toBe(d.totals.total);
    expect(paisa(d.totals.gross) - paisa(d.totals.discount)).toBe(paisa(d.totals.net));
    expect(paisa(d.totals.net) + paisa(d.totals.tax)).toBe(paisa(d.totals.total));
    expect(d.totals.paid).toBe("100.50");
    expect(paisa(d.totals.outstanding)).toBe(paisa(d.totals.total) - 10050);
    expect(d.payments).toEqual([expect.objectContaining({ method: "bank_transfer", amount: "100.50" })]);
    expect(paisa(d.balance)).toBe(paisa(d.totals.outstanding));
    expect(d.due_date).toBeTruthy();
  });

  it("never says what goods cost", async () => {
    const d = await doc(b.admin, "sales_invoice", await invoice(await customer(db)));
    expect(JSON.stringify(d)).not.toMatch(/cost|profit/i);
  });

  it("row security decides: other users get nothing, and paid amounts only with permission", async () => {
    const id = await invoice(await customer(db));
    const stranger = await db.createUser("viewer");
    await db.sql("delete from public.role_permissions where role_id = (select id from public.roles where code = 'viewer') and permission_code = 'receivables.view'");
    const seen = await doc(stranger, "sales_invoice", id);
    if (seen) {
      expect(seen.totals.paid ?? null).toBeNull();
      expect(seen.balance).toBeNull();
    }
    const nobody = await db.createUser(null);
    expect(await doc(nobody, "sales_invoice", id)).toBeNull();
    for (const kind of ["purchase_order", "goods_receipt", "purchase_invoice", "delivery_challan", "sol_invoice", "sol_challan", "customer_receipt", "supplier_receipt", "expense_voucher", "salary_slip", "salary_slips"]) {
      expect(await doc(nobody, kind, randomUUID())).toBeNull();
    }
    await expect(doc(b.admin, "secrets", id)).rejects.toMatchObject({ code: "22023" });
  });

  it("a receipt shows what it settled and what is left", async () => {
    const c = await customer(db);
    const first = await invoice(c);
    const id = await pay(c, "300.00", first, "120.25");
    const d = await doc(b.admin, "customer_receipt", id);
    expect(d.totals).toEqual({ total: "300.00", allocated: "120.25", unallocated: "179.75" });
    expect(d.lines[0]).toMatchObject({ amount: "120.25" });
    expect(d).toMatchObject({ method: "bank_transfer", reference: "REF-1", account: "Cash in hand", status: "posted" });
  });

  it("a challan lists quantities without prices", async () => {
    const c = await customer(db);
    const p = await product(db, b);
    await openingStock(db, b, p, 100, "5.00");
    const so = await db.as(b.admin, async (q) => {
      const id = one(await q("insert into public.sales_orders (customer_id, warehouse_id) values ($1, $2) returning id", [c, b.mainWarehouse])).id as string;
      await q("insert into public.sales_order_items (sales_order_id, product_id, unit_id, quantity, unit_price) values ($1, $2, $3, 24, 9)", [id, p, b.units.PCS]);
      for (const fn of ["submit_sales_order", "approve_sales_order", "start_picking"]) await q(`select public.${fn}($1)`, [id]);
      const item = one(await q("select id from public.sales_order_items where sales_order_id = $1", [id])).id;
      const d = one(await q("insert into public.deliveries (sales_order_id) values ($1) returning id", [id])).id as string;
      await q("insert into public.delivery_items (delivery_id, sales_order_item_id, quantity) values ($1, $2, 10)", [d, item]);
      await q("select public.dispatch_delivery($1)", [d]);
      return d;
    });
    const d = await doc(b.admin, "delivery_challan", so);
    expect(d.lines).toEqual([expect.objectContaining({ quantity: 10, returned: 0 })]);
    expect(JSON.stringify(d.lines)).not.toMatch(/price|total/);
    expect(d.invoice).toBeTruthy();
  });
});

describe("purchase documents", () => {
  it("order, receipt and bill agree with their lines", async () => {
    const s = await supplier(db);
    const p = await product(db, b);
    const po = await db.as(b.admin, async (q) => {
      const id = one(await q("insert into public.purchase_orders (supplier_id, warehouse_id) values ($1, $2) returning id", [s, b.mainWarehouse])).id as string;
      await q("insert into public.purchase_order_items (purchase_order_id, product_id, unit_id, quantity, unit_price) values ($1, $2, $3, 3, 720.55)", [id, p, b.units.CTN]);
      await q("select public.approve_purchase_order($1)", [id]);
      return id;
    });
    const order = await doc(b.admin, "purchase_order", po);
    expect(order.totals).toEqual({ lines: "2161.65", total: "2161.65" });

    const g = await receive(db, b, s, p, 2, b.units.CTN, "720.55");
    const receipt = await doc(b.admin, "goods_receipt", g);
    expect(sum(receipt.lines, "total")).toBe(paisa(receipt.totals.total));

    const bill = await db.as(b.admin, async (q) => {
      const id = one(await q("insert into public.supplier_invoices (supplier_id, invoice_number, invoice_date, amount) values ($1, 'B-77', current_date, 1500) returning id", [s])).id as string;
      await q("insert into public.supplier_invoice_receipts (supplier_invoice_id, goods_receipt_id) values ($1, $2)", [id, g]);
      await q("select public.post_supplier_invoice($1)", [id]);
      const pid = one(await q("insert into public.supplier_payments (supplier_id, amount, financial_account_id, method) values ($1, 700, $2, 'cash') returning id", [s, cash])).id as string;
      await q("select public.post_supplier_payment($1)", [pid]);
      await q("select public.allocate_supplier_payment($1, $2, 650)", [pid, id]);
      return { id, pid };
    });
    const d = await doc(b.admin, "purchase_invoice", bill.id);
    expect(d.totals).toEqual({ lines: "1441.10", difference: "58.90", total: "1500.00", paid: "650.00", outstanding: "850.00" });
    expect(d).toMatchObject({ invoice_number: "B-77", receipts: [expect.stringMatching(/^GRN/)] });
    const paid = await doc(b.admin, "supplier_receipt", bill.pid);
    expect(paid.totals).toEqual({ total: "700.00", allocated: "650.00", unallocated: "50.00" });
    expect(paid.balance).toBe("800.00");
  });
});

describe("SOL, expenses and salaries", () => {
  it("a SOL invoice shows its contract, received and pending amounts", async () => {
    const c = await customer(db);
    const type = one(await db.sql("select id from public.sol_job_types limit 1")).id;
    const id = await call("save_sol_job", null, json({ customer_id: c, job_type_id: type, contract_value: "5000", description: "Transport", address: "Lahore", contact_phone: "0300-1112223" }), json([]));
    await call("set_sol_job_status", id, "confirmed");
    await call("complete_sol_job", id);
    const pid = await db.as(b.admin, async (q) => one(await q("insert into public.customer_payments (customer_id, amount, financial_account_id, method) values ($1, 2000, $2, 'cash') returning id", [c, cash])).id as string);
    await call("post_customer_payment", pid);
    await call("allocate_payment_to_sol_job", pid, id, "1250.75");
    const d = await doc(b.admin, "sol_invoice", id);
    expect(d.totals).toEqual({ lines: "0.00", difference: "5000.00", total: "5000.00", paid: "1250.75", outstanding: "3749.25" });
    expect(d.payments).toEqual([expect.objectContaining({ amount: "1250.75" })]);
    expect((await doc(b.admin, "customer_receipt", pid)).lines).toEqual([expect.objectContaining({ amount: "1250.75", invoice_total: "5000.00" })]);
  });

  it("an expense voucher names who recorded and who approved it", async () => {
    const category = one(await db.sql("select id from public.expense_categories where code = 'RENT'")).id;
    const id = await call("record_expense", json({ category_id: category, amount: "1234.56", financial_account_id: cash, method: "cash", payee: "Landlord", description: "Shop rent", no_receipt_reason: "none", client_request_id: randomUUID() }));
    const d = await doc(b.admin, "expense_voucher", id);
    expect(d).toMatchObject({ payee: "Landlord", status: "posted", receipt: false, no_receipt_reason: "none", totals: { total: "1234.56" }, category: { en: "Rent" } });
    expect([d.recorded_by, d.approved_by]).toEqual(["Owner", "Owner"]);
    const other = await db.createUser("data_entry");
    expect(await doc(other, "expense_voucher", id)).toBeNull();
  });

  it("salary slips add up and only payroll users see them", async () => {
    const [e1, e2] = [await employee(db), await employee(db)];
    await db.sql("insert into public.employee_salaries (employee_id, base_salary) values ($1, 40000), ($2, 25000.50) on conflict (employee_id) do update set base_salary = excluded.base_salary", [e1, e2]);
    await call("record_advance", json({ employee_id: e1, amount: "3000", financial_account_id: cash, method: "cash", client_request_id: randomUUID() }));
    const run = await call("prepare_payroll", today);
    await db.as(b.admin, (q) => q("select public.save_payroll($1, $2::jsonb)", [run, json([
      { employee_id: e1, basic_salary: "40000", allowances: "500", bonus: "1000.25", deductions: "250", advance_recovery: "2000" }, { employee_id: e2, basic_salary: "25000.50" }])]));
    await call("post_payroll_run", run);
    const item = one(await db.sql("select id from public.payroll_items where payroll_run_id = $1 and employee_id = $2", [run, e1])).id as string;
    await db.as(b.admin, (q) => q("select public.pay_salaries($1, $2::jsonb, $3::jsonb)", [run, json({ financial_account_id: cash, method: "cash" }), json([{ payroll_item_id: item, amount: "10000.25" }])]));
    const d = await doc(b.admin, "salary_slip", item);
    expect(d.totals).toEqual({
      basic: "40000.00", allowances: "500.00", bonus: "1000.25", gross: "41500.25", deductions: "250.00", recovery: "2000.00", deducted: "2250.00", total: "39250.25", paid: "10000.25", outstanding: "29250.00",
    });
    expect(d.employee.advances).toBe("1000.00");
    const all = await doc(b.admin, "salary_slips", run);
    expect(all).toHaveLength(2);
    expect(sum(all.map((x: any) => x.totals), "total")).toBe(paisa("39250.25") + paisa("25000.50"));
    const other = await db.createUser("data_entry");
    expect(await doc(other, "salary_slip", item)).toBeNull();
    expect(await doc(other, "salary_slips", run)).toBeNull();
  });
});

describe("statements", () => {
  it("a customer statement runs from opening to closing and agrees with the ledger", async () => {
    const c = await customer(db);
    const p = await product(db, b);
    await openingStock(db, b, p, 1000, "5.00");
    for (const [n, price] of [[10, "12.35"], [3, "99.99"], [7, "8.00"]] as const) await directSale(db, b, c, p, n, b.units.PCS, price);
    await pay(c, "77.77");
    const s = await statement(b.admin, "customer", c);
    expect(s.opening).toBe("0.00");
    let balance = paisa(s.opening);
    for (const l of s.lines) {
      balance += paisa(l.debit) - paisa(l.credit);
      expect(paisa(l.balance)).toBe(balance);
      expect(l.number).toBeTruthy();
    }
    expect(sum(s.lines, "debit")).toBe(paisa(s.totals.debit));
    expect(sum(s.lines, "credit")).toBe(paisa(s.totals.credit));
    expect(paisa(s.totals.closing)).toBe(balance);
    const gl = one(await db.sql("select sum(l.debit - l.credit)::text v from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' where l.customer_id = $1 and l.account_id = private.account_id('AR')", [c])).v as string;
    expect(paisa(s.totals.closing)).toBe(paisa(gl));
    // A later period starts where the earlier one ended.
    const later = await statement(b.admin, "customer", c, "2999-01-01", "2999-12-31");
    expect(later).toMatchObject({ opening: s.totals.closing, lines: [], totals: { debit: "0.00", credit: "0.00", closing: s.totals.closing } });
  });

  it("supplier and main company statements agree with the ledger", async () => {
    for (const s of [await supplier(db), b.principal]) {
      const p = await product(db, b);
      await receive(db, b, s, p, 2, b.units.CTN, "500.25");
      await receive(db, b, s, p, 1, b.units.CTN, "333.33");
      const pid = await db.as(b.admin, async (q) => one(await q("insert into public.supplier_payments (supplier_id, amount, financial_account_id, method) values ($1, 400.10, $2, 'cash') returning id", [s, cash])).id as string);
      await call("post_supplier_payment", pid);
      const d = await statement(b.admin, "supplier", s);
      let balance = paisa(d.opening);
      for (const l of d.lines) {
        balance += paisa(l.credit) - paisa(l.debit);
        expect(paisa(l.balance)).toBe(balance);
      }
      expect(paisa(d.totals.closing)).toBe(balance);
      const gl = one(await db.sql("select sum(l.credit - l.debit)::text v from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted' where l.supplier_id = $1", [s])).v as string;
      expect(paisa(d.totals.closing)).toBe(paisa(gl));
      expect(d.lines.map((l: any) => l.type)).toContain("goods_receipt");
    }
  });

  it("refuses users who may not see the account", async () => {
    const c = await customer(db);
    const entry = await db.createUser("data_entry");
    const result = statement(entry, "customer", c).then((r) => r, (e: { code?: string }) => e.code);
    expect([null, "42501", "P0002"]).toContain(await result);
    expect(await statement(entry, "supplier", b.principal)).toBeNull();
    await expect(statement(b.admin, "nobody", c)).rejects.toMatchObject({ code: "22023" });
  });
});

describe("letterhead", () => {
  it("is saved by administrators only", async () => {
    const user = await db.createUser("manager");
    await db.as(b.admin, (q) => q("select public.save_document_settings($1::jsonb)", [json({ company_address: " 12 Mall Road, Lahore ", company_address_ur: "مال روڈ، لاہور", company_phone: "042-1234567" })]));
    expect(one(await db.sql("select value #>> '{}' v from public.app_settings where key = 'company_address'")).v).toBe("12 Mall Road, Lahore");
    const may = one(await db.sql("select exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.code = 'manager' and rp.permission_code = 'settings.manage') v")).v;
    if (!may) await expect(db.as(user, (q) => q("select public.save_document_settings('{}'::jsonb)"))).rejects.toMatchObject({ code: "42501" });
    await expect(db.as(b.admin, (q) => q("select public.save_document_settings($1::jsonb)", [json({ company_address: "x".repeat(501) })]))).rejects.toMatchObject({ code: "22023" });
  });
});
