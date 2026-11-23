import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDb, one, type TestDb } from "./helpers";
import { basics, cashAccount, glBalance, product, receive, stock, supplier, valuation, type Basics } from "./fixtures";

let db: TestDb;
let b: Basics;
let cash: string;

beforeAll(async () => {
  db = await createTestDb();
  b = await basics(db);
  cash = await cashAccount(db);
});
afterAll(() => db.close());

const supplierBalance = async (id: string) =>
  String(one(await db.sql("select balance from public.v_supplier_balances where supplier_id = $1", [id])).balance);

describe("purchase orders and receipts", () => {
  it("tracks partial and full receipt against a purchase order", async () => {
    const p = await product(db, b);
    const { po, line } = await db.as(b.admin, async (q) => {
      const po = one(await q("insert into public.purchase_orders (supplier_id, warehouse_id) values ($1, $2) returning id", [b.principal, b.mainWarehouse])).id as string;
      const line = one(await q("insert into public.purchase_order_items (purchase_order_id, product_id, unit_id, quantity, unit_price) values ($1, $2, $3, 10, 720) returning id", [po, p, b.units.CTN])).id as string;
      await q("select public.approve_purchase_order($1)", [po]);
      return { po, line };
    });
    expect(one(await db.sql("select total_amount from public.purchase_orders where id = $1", [po])).total_amount).toBe("7200.00");

    const receiveAgainstPo = (cartons: number) => db.as(b.admin, async (q) => {
      const grn = one(await q("insert into public.goods_receipts (supplier_id, warehouse_id, purchase_order_id) values ($1, $2, $3) returning id", [b.principal, b.mainWarehouse, po])).id;
      await q("insert into public.goods_receipt_items (goods_receipt_id, purchase_order_item_id, product_id, unit_id, expected_quantity, quantity, unit_cost) values ($1, $2, $3, $4, $5, $5, 720)", [grn, line, p, b.units.CTN, cartons]);
      await q("select public.post_goods_receipt($1)", [grn]);
    });

    await receiveAgainstPo(4);
    expect(one(await db.sql("select status from public.purchase_orders where id = $1", [po])).status).toBe("partially_received");
    await receiveAgainstPo(6);
    expect(one(await db.sql("select status from public.purchase_orders where id = $1", [po])).status).toBe("received");
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 720, reserved: 0 });
  });

  it("records quantity discrepancies against the supplier's document", async () => {
    const p = await product(db, b);
    const grn = await db.as(b.admin, async (q) => {
      const grn = one(await q("insert into public.goods_receipts (supplier_id, warehouse_id, supplier_reference) values ($1, $2, 'DC-881') returning id", [b.principal, b.mainWarehouse])).id;
      await q("insert into public.goods_receipt_items (goods_receipt_id, product_id, unit_id, expected_quantity, quantity, unit_cost) values ($1, $2, $3, 12, 10, 100)", [grn, p, b.units.BOX]);
      await q("select public.post_goods_receipt($1)", [grn]);
      return grn;
    });
    const d = one(await db.sql("select difference from public.v_purchase_receipt_discrepancies where goods_receipt_id = $1", [grn]));
    expect(d.difference).toBe("-2");
  });
});

describe("main company and supplier ledgers", () => {
  it("keeps the main company payable separate from other suppliers", async () => {
    const p = await product(db, b);
    const s = await supplier(db);
    const principalBefore = Number(await glBalance(db, "AP_PRINCIPAL"));
    const suppliersBefore = Number(await glBalance(db, "AP_SUPPLIERS"));
    await receive(db, b, b.principal, p, 1, b.units.CTN, "1000.00");
    await receive(db, b, s, p, 1, b.units.CTN, "300.00");
    expect(Number(await glBalance(db, "AP_PRINCIPAL")) - principalBefore).toBe(-1000);
    expect(Number(await glBalance(db, "AP_SUPPLIERS")) - suppliersBefore).toBe(-300);
    expect(await supplierBalance(s)).toBe("300.00");
    const ledger = await db.sql("select distinct payable_account from public.v_company_ledger");
    expect(ledger.map((r) => r.payable_account)).toEqual(["AP_PRINCIPAL"]);
  });
});

describe("supplier invoices and partial payments", () => {
  it("posts invoice differences, allocates partial payments and prevents over-allocation", async () => {
    const p = await product(db, b);
    const s = await supplier(db);
    const grn = await receive(db, b, s, p, 10, b.units.BOX, "100.00"); // 1000.00
    const invoice = await db.as(b.admin, async (q) => {
      const inv = one(await q("insert into public.supplier_invoices (supplier_id, invoice_number, invoice_date, amount) values ($1, 'B-1', '2026-03-10', 1010) returning id", [s])).id as string;
      await q("insert into public.supplier_invoice_receipts (supplier_invoice_id, goods_receipt_id) values ($1, $2)", [inv, grn]);
      await q("select public.post_supplier_invoice($1)", [inv]);
      return inv;
    });
    expect(one(await db.sql("select variance from public.supplier_invoices where id = $1", [invoice])).variance).toBe("10.00");
    expect(await supplierBalance(s)).toBe("1010.00");

    const pay = (amount: string, requestId = randomUUID()) => db.as(b.admin, async (q) => {
      const id = one(await q("insert into public.supplier_payments (supplier_id, amount, financial_account_id, method, client_request_id) values ($1, $2, $3, 'cash', $4) returning id", [s, amount, cash, requestId])).id as string;
      await q("select public.post_supplier_payment($1)", [id]);
      return id;
    });
    const allocate = (paymentId: string, amount: string) =>
      db.as(b.admin, (q) => q("select public.allocate_supplier_payment($1, $2, $3)", [paymentId, invoice, amount]));
    const status = async () => one(await db.sql("select payment_status, outstanding from public.v_supplier_invoice_balances where supplier_invoice_id = $1", [invoice]));

    const p1 = await pay("400.00");
    await allocate(p1, "400.00");
    expect(await status()).toEqual({ payment_status: "partially_paid", outstanding: "610.00" });
    await expect(allocate(p1, "0.01")).rejects.toThrow(/unallocated payment amount/);

    const p2 = await pay("700.00");
    await expect(allocate(p2, "620.00")).rejects.toThrow(/invoice balance/);
    await allocate(p2, "610.00");
    expect(await status()).toEqual({ payment_status: "paid", outstanding: "0.00" });
    expect(await supplierBalance(s)).toBe("-90.00");

    await db.as(b.admin, (q) => q("select public.void_supplier_payment($1, 'entered twice')", [p2]));
    expect(await status()).toEqual({ payment_status: "partially_paid", outstanding: "610.00" });
    expect(await supplierBalance(s)).toBe("610.00");
  });

  it("rejects posting the same document twice and duplicate client requests", async () => {
    const s = await supplier(db);
    const requestId = randomUUID();
    const id = await db.as(b.admin, async (q) => {
      const id = one(await q("insert into public.supplier_payments (supplier_id, amount, financial_account_id, method, client_request_id) values ($1, 50, $2, 'cash', $3) returning id", [s, cash, requestId])).id;
      await q("select public.post_supplier_payment($1)", [id]);
      return id;
    });
    await expect(db.as(b.admin, (q) => q("select public.post_supplier_payment($1)", [id]))).rejects.toThrow(/already posted/);
    await expect(db.as(b.admin, (q) =>
      q("insert into public.supplier_payments (supplier_id, amount, financial_account_id, method, client_request_id) values ($1, 50, $2, 'cash', $3)", [s, cash, requestId])
    )).rejects.toMatchObject({ code: "23505" });
    expect(await supplierBalance(s)).toBe("-50.00");
  });
});

describe("supplier returns", () => {
  it("removes stock at average cost and books the agreed credit", async () => {
    const p = await product(db, b);
    const s = await supplier(db);
    await receive(db, b, s, p, 10, b.units.PCS, "10.00");
    await receive(db, b, s, p, 10, b.units.PCS, "14.00"); // avg 12.00
    const varianceBefore = Number(await glBalance(db, "INVENTORY_VARIANCE"));
    await db.as(b.admin, async (q) => {
      const r = one(await q("insert into public.supplier_returns (supplier_id, warehouse_id) values ($1, $2) returning id", [s, b.mainWarehouse])).id;
      await q("insert into public.supplier_return_items (supplier_return_id, product_id, unit_id, quantity, unit_price) values ($1, $2, $3, 5, 14)", [r, p, b.units.PCS]);
      await q("select public.post_supplier_return($1)", [r]);
    });
    expect(await valuation(db, p)).toMatchObject({ quantity: 15, value: "180.00" });
    expect(await supplierBalance(s)).toBe("170.00"); // 240 - 70
    expect(Number(await glBalance(db, "INVENTORY_VARIANCE")) - varianceBefore).toBe(-10); // credit 70 vs cost 60
  });
});
