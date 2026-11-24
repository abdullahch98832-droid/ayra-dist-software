// Real concurrent transactions on separate connections against Postgres 17.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, one, type TestDb } from "./helpers";
import { basics, cashAccount, customer, directSale, glBalance, openingStock, product, stock, valuation, type Basics } from "./fixtures";

let db: TestDb;
let b: Basics;

beforeAll(async () => {
  db = await createTestDb();
  b = await basics(db);
});
afterAll(() => db.close());

async function draftInvoice(customerId: string, productId: string, qty: number) {
  const inv = one(await db.sql("insert into public.sales_invoices (customer_id, warehouse_id) values ($1, $2) returning id", [customerId, b.mainWarehouse])).id as string;
  await db.sql("insert into public.sales_invoice_items (sales_invoice_id, product_id, unit_id, quantity, unit_price) values ($1, $2, $3, $4, 10)", [inv, productId, b.units.PCS, qty]);
  return inv;
}

const settle = <T>(promises: Promise<T>[]) => Promise.allSettled(promises);
const fulfilled = (r: PromiseSettledResult<unknown>[]) => r.filter((x) => x.status === "fulfilled").length;

describe("concurrent stock updates", () => {
  it("blocks a second sale of the last units until the first commits, then rejects it", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 10, "5.00");
    const [inv1, inv2] = [await draftInvoice(c, p, 10), await draftInvoice(c, p, 10)];

    const first = await db.pool.connect();
    const second = await db.pool.connect();
    try {
      const auth = JSON.stringify({ sub: b.admin, role: "authenticated" });
      for (const client of [first, second]) {
        await client.query("begin");
        await client.query("set local role authenticated");
        await client.query("select set_config('request.jwt.claims', $1, true)", [auth]);
      }
      await first.query("select public.post_sales_invoice($1)", [inv1]);

      let secondDone = false;
      const secondAttempt = second.query("select public.post_sales_invoice($1)", [inv2]).finally(() => { secondDone = true; });
      secondAttempt.catch(() => undefined);
      await new Promise((r) => setTimeout(r, 300));
      expect(secondDone).toBe(false); // waiting on the stock row lock

      await first.query("commit");
      await expect(secondAttempt).rejects.toThrow(/Insufficient stock/);
      await second.query("rollback");
    } finally {
      first.release();
      second.release();
    }
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 0, reserved: 0 });
    expect(await valuation(db, p)).toMatchObject({ quantity: 0, value: "0.00" });
  });

  it("never oversells under many parallel sales", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 50, "3.00");
    const invoices = await Promise.all(Array.from({ length: 10 }, () => draftInvoice(c, p, 10)));
    const results = await settle(invoices.map((id) => db.as(b.admin, (q) => q("select public.post_sales_invoice($1)", [id]))));
    expect(fulfilled(results)).toBe(5);
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 0, reserved: 0 });
    expect(one(await db.sql("select count(*) c from public.sales_invoices where id = any($1) and status = 'posted'", [invoices])).c).toBe("5");
    const total = String(one(await db.sql("select coalesce(sum(total_value), 0)::numeric(18,2) v from public.inventory_valuation")).v);
    expect(await glBalance(db, "INVENTORY")).toBe(total);
  });

  it("never reserves more than is available under parallel approvals", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 100, "3.00");
    const orders = await Promise.all(Array.from({ length: 4 }, async () => {
      const so = one(await db.sql("insert into public.sales_orders (customer_id, warehouse_id) values ($1, $2) returning id", [c, b.mainWarehouse])).id as string;
      await db.sql("insert into public.sales_order_items (sales_order_id, product_id, unit_id, quantity, unit_price) values ($1, $2, $3, 30, 10)", [so, p, b.units.PCS]);
      await db.as(b.admin, (q) => q("select public.submit_sales_order($1)", [so]));
      return so;
    }));
    const results = await settle(orders.map((id) => db.as(b.admin, (q) => q("select public.approve_sales_order($1)", [id]))));
    expect(fulfilled(results)).toBe(3);
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 100, reserved: 90 });
  });

  it("posts a document only once when posted in parallel", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 100, "3.00");
    const inv = await draftInvoice(c, p, 5);
    const results = await settle(Array.from({ length: 5 }, () => db.as(b.admin, (q) => q("select public.post_sales_invoice($1)", [inv]))));
    expect(fulfilled(results)).toBe(1);
    expect(one(await db.sql("select count(*) c from public.journal_entries where source_type = 'sales_invoice' and source_id = $1", [inv])).c).toBe("1");
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 95, reserved: 0 });
  });
});

describe("concurrent numbering and allocations", () => {
  it("issues unique, gap-free document numbers in parallel", async () => {
    const c = await customer(db);
    const rows = await Promise.all(Array.from({ length: 20 }, () =>
      db.as(b.admin, async (q) => one(await q("insert into public.sales_orders (customer_id, warehouse_id) values ($1, $2) returning doc_no", [c, b.mainWarehouse])).doc_no as string)));
    const numbers = rows.map((n) => Number(n.replace("SO-", ""))).sort((x, y) => x - y);
    expect(new Set(numbers).size).toBe(20);
    expect(numbers.at(-1)! - numbers[0]!).toBe(19);
  });

  it("does not over-allocate a payment under parallel allocations", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    const cash = await cashAccount(db);
    await openingStock(db, b, p, 100, "3.00");
    const invoices = await Promise.all([1, 2, 3, 4].map(async () => {
      const id = await directSale(db, b, c, p, 10, b.units.PCS, "10.00"); // 100.00 each
      return id;
    }));
    const pay = await db.as(b.admin, async (q) => {
      const id = one(await q("insert into public.customer_payments (customer_id, amount, financial_account_id, method) values ($1, 250, $2, 'cash') returning id", [c, cash])).id;
      await q("select public.post_customer_payment($1)", [id]);
      return id;
    });
    const results = await settle(invoices.map((inv) => db.as(b.admin, (q) => q("select public.allocate_customer_payment($1, $2, 100)", [pay, inv]))));
    expect(fulfilled(results)).toBe(2);
    expect(one(await db.sql("select sum(amount) s from public.customer_payment_allocations where customer_payment_id = $1", [pay])).s).toBe("200.00");
  });
});
