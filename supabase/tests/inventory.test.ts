import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, one, type TestDb } from "./helpers";
import {
  basics, customer, directSale, glBalance, openingStock, product, receive, stock, valuation, type Basics,
} from "./fixtures";

let db: TestDb;
let b: Basics;

beforeAll(async () => {
  db = await createTestDb();
  b = await basics(db);
});
afterAll(() => db.close());

async function inventoryMatchesLedger() {
  const total = String(one(await db.sql("select coalesce(sum(total_value), 0)::numeric(18,2) v from public.inventory_valuation")).v);
  expect(await glBalance(db, "INVENTORY")).toBe(total);
  const mismatch = await db.sql(
    `select v.product_id from public.inventory_valuation v
      left join (select product_id, sum(on_hand) q from public.stock_balances group by product_id) s on s.product_id = v.product_id
     where v.quantity <> coalesce(s.q, 0)`
  );
  expect(mismatch).toEqual([]);
}

describe("units and conversion", () => {
  it("converts cartons and boxes to base pieces", async () => {
    const p = await product(db, b);
    await receive(db, b, b.principal, p, 2, b.units.CTN, "720.00");
    await receive(db, b, b.principal, p, 3, b.units.BOX, "120.00");
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 2 * 72 + 3 * 12, reserved: 0 });
    expect(await valuation(db, p)).toMatchObject({ quantity: 180, value: "1800.00", avg: "10.000000" });
    await inventoryMatchesLedger();
  });

  it("rejects a unit the product is not configured for", async () => {
    const p = await product(db, b);
    await expect(receive(db, b, b.principal, p, 1, b.units.PKT, "1.00")).rejects.toThrow(/Unit is not configured/);
  });

  it("always takes the conversion factor from the product, not the client", async () => {
    const p = await product(db, b);
    const grn = one(await db.sql("insert into public.goods_receipts (supplier_id, warehouse_id) values ($1, $2) returning id", [b.principal, b.mainWarehouse])).id;
    const item = one(await db.sql(
      "insert into public.goods_receipt_items (goods_receipt_id, product_id, unit_id, factor, quantity, unit_cost) values ($1, $2, $3, 999, 1, 1) returning factor, base_quantity",
      [grn, p, b.units.BOX]));
    expect(item).toEqual({ factor: "12", base_quantity: "12" });
  });
});

describe("weighted average costing", () => {
  it("averages receipts and costs issues at the running average", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 100, "10.00");
    await receive(db, b, b.principal, p, 1, b.units.CTN, "1008.00"); // 72 pcs @ 14.00
    expect(await valuation(db, p)).toMatchObject({ quantity: 172, value: "2008.00", avg: "11.674419" });

    const inv1 = await directSale(db, b, c, p, 50, b.units.PCS, "20.00");
    expect(one(await db.sql("select cost_total from public.sales_invoices where id = $1", [inv1])).cost_total).toBe("583.72");
    expect(await valuation(db, p)).toMatchObject({ quantity: 122, value: "1424.28" });

    // Selling the last units takes the remaining value exactly: no rounding residue.
    const inv2 = await directSale(db, b, c, p, 122, b.units.PCS, "20.00");
    expect(one(await db.sql("select cost_total from public.sales_invoices where id = $1", [inv2])).cost_total).toBe("1424.28");
    expect(await valuation(db, p)).toMatchObject({ quantity: 0, value: "0.00" });
    await inventoryMatchesLedger();
  });

  it("rejects issuing more than is on hand and leaves no partial changes", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 10, "5.00");
    const before = Number(one(await db.sql("select count(*) c from public.stock_movements where product_id = $1", [p])).c);
    await expect(directSale(db, b, c, p, 11, b.units.PCS, "9.00")).rejects.toThrow(/Insufficient stock/);
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 10, reserved: 0 });
    expect(Number(one(await db.sql("select count(*) c from public.stock_movements where product_id = $1", [p])).c)).toBe(before);
  });

  it("requires a value for stock increases when there is no average cost", async () => {
    const p = await product(db, b);
    await expect(
      db.as(b.admin, async (q) => {
        const adj = one(await q("insert into public.stock_adjustments (warehouse_id, kind) values ($1, 'other') returning id", [b.mainWarehouse])).id;
        await q("insert into public.stock_adjustment_items (stock_adjustment_id, product_id, unit_id, quantity) values ($1, $2, $3, 5)", [adj, p, b.units.PCS]);
        await q("select public.post_stock_adjustment($1)", [adj]);
      })
    ).rejects.toThrow(/No average cost/);
  });
});

describe("transfers, counts and write-offs", () => {
  it("moves stock between warehouses without changing value", async () => {
    const p = await product(db, b);
    await openingStock(db, b, p, 40, "3.00");
    const before = await valuation(db, p);
    await db.as(b.admin, async (q) => {
      const t = one(await q("insert into public.stock_transfers (from_warehouse_id, to_warehouse_id) values ($1, $2) returning id", [b.mainWarehouse, b.damagedWarehouse])).id;
      await q("insert into public.stock_transfer_items (stock_transfer_id, product_id, unit_id, quantity) values ($1, $2, $3, 15)", [t, p, b.units.PCS]);
      await q("select public.post_stock_transfer($1)", [t]);
    });
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 25, reserved: 0 });
    expect(await stock(db, p, b.damagedWarehouse)).toEqual({ onHand: 15, reserved: 0 });
    expect(await valuation(db, p)).toEqual(before);
  });

  it("writes off damaged stock to expense", async () => {
    const p = await product(db, b);
    await openingStock(db, b, p, 20, "4.00", b.damagedWarehouse);
    const expenseBefore = Number(await glBalance(db, "STOCK_WRITE_OFF"));
    await db.as(b.admin, async (q) => {
      const adj = one(await q("insert into public.stock_adjustments (warehouse_id, kind) values ($1, 'write_off') returning id", [b.damagedWarehouse])).id;
      await q("insert into public.stock_adjustment_items (stock_adjustment_id, product_id, unit_id, quantity) values ($1, $2, $3, -5)", [adj, p, b.units.PCS]);
      await q("select public.post_stock_adjustment($1)", [adj]);
    });
    expect(Number(await glBalance(db, "STOCK_WRITE_OFF")) - expenseBefore).toBe(20);
    expect(await stock(db, p, b.damagedWarehouse)).toEqual({ onHand: 15, reserved: 0 });
    await inventoryMatchesLedger();
  });

  it("posts physical count differences as an adjustment", async () => {
    const p = await product(db, b);
    await openingStock(db, b, p, 100, "2.00");
    const adjustmentId = await db.as(b.admin, async (q) => {
      const cnt = one(await q("insert into public.stock_counts (warehouse_id) values ($1) returning id", [b.mainWarehouse])).id;
      const item = one(await q("insert into public.stock_count_items (stock_count_id, product_id, counted_quantity) values ($1, $2, 90) returning system_quantity", [cnt, p]));
      expect(item.system_quantity).toBe("100");
      return one(await q("select public.post_stock_count($1) as id", [cnt])).id;
    });
    expect(adjustmentId).not.toBeNull();
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 90, reserved: 0 });
    expect(await valuation(db, p)).toMatchObject({ quantity: 90, value: "180.00" });
    await inventoryMatchesLedger();
  });

  it("keeps the movement ledger immutable, even for the owner", async () => {
    await expect(db.sql("update public.stock_movements set quantity = 1")).rejects.toThrow(/immutable/);
    await expect(db.sql("delete from public.stock_movements")).rejects.toThrow(/immutable/);
  });
});
