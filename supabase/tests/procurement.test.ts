// Phase 6: receiving, payables, negative-stock override, stock reports and their accounting.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, one, type Row, type TestDb } from "./helpers";
import { basics, cashAccount, customer, directSale, employee, glBalance, openingStock, product, receive, stock, supplier, valuation, type Basics } from "./fixtures";

let db: TestDb;
let b: Basics;
let today: string;

beforeAll(async () => {
  db = await createTestDb();
  b = await basics(db);
  today = one(await db.sql("select private.business_today()::text as d")).d as string;
});
afterAll(() => db.close());

const call = async (user: string, fn: string, ...args: unknown[]) =>
  one(await db.as(user, (q) => q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args))).r as string;
const rows = (user: string, fn: string, ...args: unknown[]) =>
  db.as(user, (q) => q(`select * from public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")})`, args));
/** Account balance in paisa, so differences are exact. */
const glPaisa = async (key: string) => Math.round(Number(await glBalance(db, key)) * 100);
const json = (value: unknown) => JSON.stringify(value);
const day = (offset: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const setOverride = (on: boolean) => db.sql("update public.app_settings set value = $1 where key = 'allow_negative_stock'", [String(on)]);

/** Every rule that must hold after any sequence of documents. */
async function invariants() {
  const r = JSON.parse(json(one(await db.as(b.admin, (q) => q("select public.inventory_reconciliation() as r"))).r));
  expect(r).toMatchObject({ difference: "0.00", quantity_mismatches: 0 });
  expect(await db.sql("select product_id from public.inventory_valuation where (quantity = 0 and total_value <> 0)")).toEqual([]);
  expect(await db.sql(`select sb.product_id from public.stock_balances sb
     left join (select product_id, warehouse_id, sum(quantity) q from public.stock_movements group by 1, 2) m using (product_id, warehouse_id)
    where sb.on_hand <> coalesce(m.q, 0) or sb.reserved < 0`)).toEqual([]);
  expect(await db.sql(`select iv.product_id from public.inventory_valuation iv
     left join (select product_id, sum(value_change) v from public.stock_movements group by 1) m using (product_id)
    where iv.total_value <> coalesce(m.v, 0)`)).toEqual([]);
  expect(one(await db.sql(`select coalesce(sum(l.debit - l.credit), 0)::text d from public.journal_entry_lines l
     join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'`)).d).toMatch(/^0(\.00)?$/);
}

describe("products", () => {
  it("saves every detail with configurable units and assigns a SKU", async () => {
    const category = one(await db.sql("insert into public.product_categories (name_en) values ('Soap') returning id")).id;
    const brand = one(await db.sql("insert into public.brands (name_en) values ('Ayra') returning id")).id;
    const id = await call(b.admin, "save_product", null,
      json({ name_en: "Soap 100g", name_ur: "صابن", barcode: "8961", category_id: category, brand_id: brand, default_supplier_id: b.principal, base_unit_id: b.units.PCS, reorder_level: 24 }),
      json([{ unit_id: b.units.PCS, factor: 1, sale_price: "60.00", purchase_price: "48.50" },
        { unit_id: b.units.PKT, factor: 6, sale_price: "350.00" }, { unit_id: b.units.BOX, factor: 48 }, { unit_id: b.units.CTN, factor: 288, barcode: "CTN-8961" }]));
    expect(one(await db.sql("select sku, name_ur, barcode, reorder_level, brand_id, default_supplier_id from public.products where id = $1", [id])))
      .toMatchObject({ sku: expect.stringMatching(/^SKU-\d{5}$/), name_ur: "صابن", barcode: "8961", reorder_level: "24", brand_id: brand, default_supplier_id: b.principal });
    const units = await db.sql("select factor, sale_price, purchase_price from public.product_units where product_id = $1 order by factor", [id]);
    expect(units).toEqual([
      { factor: "1", sale_price: "60.00", purchase_price: "48.50" }, { factor: "6", sale_price: "350.00", purchase_price: null },
      { factor: "48", sale_price: null, purchase_price: null }, { factor: "288", sale_price: null, purchase_price: null }]);

    // A user without costs.view edits the product: the purchase price survives; a removed unit goes.
    await call(b.admin, "save_product", id, json({ name_en: "Soap 100 g", base_unit_id: b.units.PCS }), json([{ unit_id: b.units.PCS, factor: 1, sale_price: "62.00" }, { unit_id: b.units.CTN, factor: 300 }]));
    expect(await db.sql("select factor, sale_price, purchase_price from public.product_units where product_id = $1 order by factor", [id]))
      .toEqual([{ factor: "1", sale_price: "62.00", purchase_price: "48.50" }, { factor: "300", sale_price: null, purchase_price: null }]);
  });

  it("is limited to product managers, and saves nothing when a unit is wrong", async () => {
    const viewer = await db.createUser("viewer");
    await expect(call(viewer, "save_product", null, json({ name_en: "X", base_unit_id: b.units.PCS }), json([]))).rejects.toMatchObject({ code: "42501" });
    const before = one(await db.sql("select count(*) c from public.products")).c;
    await expect(call(b.admin, "save_product", null, json({ name_en: "Y", base_unit_id: b.units.PCS }), json([{ unit_id: b.units.BOX, factor: 1 }]))).rejects.toThrow(/factor 1/);
    expect(one(await db.sql("select count(*) c from public.products")).c).toBe(before);
  });
});

describe("suppliers", () => {
  it("saves a supplier with contacts atomically and assigns a code", async () => {
    const id = await call(b.admin, "save_supplier", null, json({ name: "Karachi Plastics", payment_terms_days: 30 }), json([{ name: "Asif", phone: "0300", is_primary: true }, { name: "Nadia" }]));
    expect(one(await db.sql("select code from public.suppliers where id = $1", [id])).code).toMatch(/^SUP-\d{4}$/);
    await call(b.admin, "save_supplier", id, json({ name: "Karachi Plastics Ltd" }), json([{ name: "Asif" }]));
    expect((await db.sql("select name from public.supplier_contacts where supplier_id = $1", [id])).map((c) => c.name)).toEqual(["Asif"]);
    await expect(call(b.admin, "save_supplier", id, json({ name: "X" }), json([{ name: "A", is_primary: true }, { name: "B", is_primary: true }]))).rejects.toMatchObject({ code: "23505" });
    expect(one(await db.sql("select name from public.suppliers where id = $1", [id])).name).toBe("Karachi Plastics Ltd");
    await expect(call(await db.createUser("data_entry"), "save_supplier", null, json({ name: "No" }), "[]")).rejects.toMatchObject({ code: "42501" });
  });
});

describe("receiving", () => {
  it("splits accepted, damaged and rejected goods, and pays only for what was kept", async () => {
    const p = await product(db, b);
    const s = await supplier(db);
    const po = await call(b.admin, "save_purchase_order", null, json({ supplier_id: s, warehouse_id: b.mainWarehouse, date: today }),
      json([{ product_id: p, unit_id: b.units.CTN, quantity: 10, unit_price: "720.00" }]));
    const line = one(await db.sql("select id from public.purchase_order_items where purchase_order_id = $1", [po])).id;
    await call(b.admin, "approve_purchase_order", po);

    const receipt = (accepted: number, damaged: number, rejected: number) => call(b.admin, "save_goods_receipt", null,
      json({ supplier_id: s, purchase_order_id: po, warehouse_id: b.mainWarehouse, damaged_warehouse_id: b.damagedWarehouse, date: today, supplier_reference: "DC-1" }),
      json([{ purchase_order_item_id: line, product_id: p, unit_id: b.units.CTN, expected_quantity: accepted + damaged + rejected, quantity: accepted, damaged_quantity: damaged, rejected_quantity: rejected, unit_cost: "720.00" }]));

    const first = await receipt(4, 1, 2);
    await call(b.admin, "post_goods_receipt", first);
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 4 * 72, reserved: 0 });
    expect(await stock(db, p, b.damagedWarehouse)).toEqual({ onHand: 72, reserved: 0 });
    expect(one(await db.sql("select total_amount from public.goods_receipts where id = $1", [first])).total_amount).toBe("3600.00"); // 5 kept, 2 rejected
    expect(one(await db.sql("select balance::numeric(18,2) v from public.v_supplier_balances where supplier_id = $1", [s])).v).toBe("3600.00");
    const progress = async () => one(await db.as(b.admin, (q) => q("select ordered_base, accepted_base, damaged_base, rejected_base, remaining_base from public.v_purchase_order_progress where purchase_order_item_id = $1", [line])));
    expect(await progress()).toEqual({ ordered_base: "720", accepted_base: "288", damaged_base: "72", rejected_base: "144", remaining_base: "360" });
    expect(one(await db.sql("select status from public.purchase_orders where id = $1", [po])).status).toBe("partially_received");

    // Short close: the rest will not come.
    await expect(call(b.admin, "close_purchase_order", po, " ")).rejects.toThrow(/reason/);
    await call(b.admin, "close_purchase_order", po, "Supplier out of stock");
    expect(one(await db.sql("select status, close_reason from public.purchase_orders where id = $1", [po]))).toEqual({ status: "received", close_reason: "Supplier out of stock" });
    await expect(receipt(1, 0, 0).then((id) => call(b.admin, "post_goods_receipt", id))).rejects.toThrow(/not open for receiving/);
    await invariants();
  });

  it("records a fully rejected delivery without stock, payable or progress", async () => {
    const p = await product(db, b);
    const s = await supplier(db);
    const po = await call(b.admin, "save_purchase_order", null, json({ supplier_id: s, warehouse_id: b.mainWarehouse, date: today }), json([{ product_id: p, unit_id: b.units.PCS, quantity: 5, unit_price: 10 }]));
    await call(b.admin, "approve_purchase_order", po);
    const line = one(await db.sql("select id from public.purchase_order_items where purchase_order_id = $1", [po])).id;
    const g = await call(b.admin, "save_goods_receipt", null, json({ supplier_id: s, purchase_order_id: po, warehouse_id: b.mainWarehouse, date: today }),
      json([{ purchase_order_item_id: line, product_id: p, unit_id: b.units.PCS, quantity: 0, rejected_quantity: 5, unit_cost: 10 }]));
    await call(b.admin, "post_goods_receipt", g);
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 0, reserved: 0 });
    expect(one(await db.sql("select status, journal_entry_id from public.goods_receipts where id = $1", [g]))).toEqual({ status: "posted", journal_entry_id: null });
    expect(one(await db.sql("select status from public.purchase_orders where id = $1", [po])).status).toBe("approved");
  });

  it("needs a damaged warehouse for damaged goods and a normal one for the rest", async () => {
    const p = await product(db, b);
    const make = (doc: object) => call(b.admin, "save_goods_receipt", null, json({ supplier_id: b.principal, date: today, ...doc }),
      json([{ product_id: p, unit_id: b.units.PCS, quantity: 1, damaged_quantity: 1, unit_cost: 5 }])).then((id) => call(b.admin, "post_goods_receipt", id));
    await expect(make({ warehouse_id: b.mainWarehouse })).rejects.toThrow(/damaged-goods warehouse/);
    await expect(make({ warehouse_id: b.mainWarehouse, damaged_warehouse_id: b.mainWarehouse })).rejects.toThrow(/damaged-goods warehouse/);
    await expect(make({ warehouse_id: b.damagedWarehouse, damaged_warehouse_id: b.damagedWarehouse })).rejects.toThrow(/normal warehouse/);
    await expect(call(b.admin, "save_goods_receipt", null, json({ supplier_id: b.principal, warehouse_id: b.mainWarehouse, date: today }),
      json([{ product_id: p, unit_id: b.units.PCS, quantity: 0, unit_cost: 5 }]))).rejects.toMatchObject({ code: "23514" });
  });

  it("lets a data entry user save receipts but not post them, and never twice for one request", async () => {
    const p = await product(db, b);
    const entry = await db.createUser("data_entry");
    const request = one(await db.sql("select gen_random_uuid()::text id")).id;
    const save = () => call(entry, "save_goods_receipt", null, json({ supplier_id: b.principal, warehouse_id: b.mainWarehouse, date: today, client_request_id: request }),
      json([{ product_id: p, unit_id: b.units.PCS, quantity: 3, unit_cost: "7.00" }]));
    const id = await save();
    expect(await save()).toBe(id);
    await expect(call(entry, "post_goods_receipt", id)).rejects.toThrow(/Permission denied/);
    await call(b.admin, "post_goods_receipt", id);
    await expect(call(entry, "save_goods_receipt", id, json({ supplier_id: b.principal, warehouse_id: b.mainWarehouse, date: today }), json([{ product_id: p, unit_id: b.units.PCS, quantity: 99, unit_cost: 1 }])))
      .rejects.toMatchObject({ code: "P0002" });
    expect((await stock(db, p, b.mainWarehouse)).onHand).toBe(3);
  });
});

describe("bills and payments", () => {
  it("tracks amount paid and remaining payable per bill and per receipt", async () => {
    const p = await product(db, b);
    const s = await supplier(db);
    const cash = await cashAccount(db);
    const g = await receive(db, b, s, p, 10, b.units.PCS, "100.00");
    const bill = await call(b.admin, "save_supplier_invoice", null, json({ supplier_id: s, invoice_number: "B-77", date: today, due_date: day(15), amount: "1020.00" }), json([g]));
    await call(b.admin, "post_supplier_invoice", bill); // 20.00 above the receipts goes to variance
    const request = one(await db.sql("select gen_random_uuid()::text id")).id;
    const pay = () => call(b.admin, "record_supplier_payment", json({ supplier_id: s, date: today, amount: "400.00", financial_account_id: cash, method: "cash", reference: "R1", client_request_id: request }), json([{ invoice_id: bill, amount: "400.00" }]));
    expect(await pay()).toBe(await pay());
    expect(one(await db.as(b.admin, (q) => q("select paid_amount::text, outstanding::text from public.v_supplier_invoice_status where supplier_invoice_id = $1", [bill])))).toEqual({ paid_amount: "400.00", outstanding: "620.00" });
    const [line] = (await rows(b.admin, "report_purchases", today, today, s, null));
    expect(line).toMatchObject({ received_base: "10", accepted_base: "10", total_cost: "1000.00", invoice_no: "B-77", paid_amount: "400.00", remaining: "620.00" });
    expect(one(await db.sql("select balance::numeric(18,2) v from public.v_supplier_balances where supplier_id = $1", [s])).v).toBe("620.00");

    // Over-allocation fails and rolls the whole payment back.
    await expect(call(b.admin, "record_supplier_payment", json({ supplier_id: s, date: today, amount: "700.00", financial_account_id: cash, method: "cash" }), json([{ invoice_id: bill, amount: "700.00" }]))).rejects.toThrow(/exceeds the invoice balance/);
    expect(one(await db.sql("select count(*) c from public.supplier_payments where supplier_id = $1", [s])).c).toBe("1");
    await invariants();
  });

  it("splits one bill over several receipts without counting it twice", async () => {
    const p = await product(db, b);
    const s = await supplier(db);
    const cash = await cashAccount(db);
    const receipts = [await receive(db, b, s, p, 1, b.units.PCS, "100.00"), await receive(db, b, s, p, 1, b.units.PCS, "33.33"), await receive(db, b, s, p, 1, b.units.PCS, "66.68")];
    const bill = await call(b.admin, "save_supplier_invoice", null, json({ supplier_id: s, invoice_number: "B-3R", date: today, amount: "205.00" }), json(receipts));
    await call(b.admin, "post_supplier_invoice", bill);
    await call(b.admin, "record_supplier_payment", json({ supplier_id: s, date: today, amount: "100.00", financial_account_id: cash, method: "cash" }), json([{ invoice_id: bill, amount: "100.00" }]));
    const lines = await rows(b.admin, "report_purchases", today, today, s, null);
    expect(lines).toHaveLength(3);
    const sum = (k: string) => lines.reduce((n, l) => n + Math.round(Number(l[k]) * 100), 0);
    expect([sum("total_cost"), sum("invoice_amount"), sum("paid_amount"), sum("remaining")]).toEqual([20001, 20500, 10000, 10500]);
    await invariants();
  });

  it("lets someone who may pay only the main company choose the paying account", async () => {
    const cash = await cashAccount(db);
    const role = one(await db.sql("insert into public.roles (code, name_en, name_ur) values ('company_payer', 'x', 'x') returning id")).id;
    for (const p of ["purchasing.view", "company.view", "company.pay"]) await db.sql("insert into public.role_permissions values ($1, $2)", [role, p]);
    const payer = await db.createUser("company_payer");
    expect((await db.as(payer, (q) => q("select id from public.financial_accounts where id = $1", [cash]))).length).toBe(1);
    await call(payer, "record_supplier_payment", json({ supplier_id: b.principal, amount: "10.00", financial_account_id: cash, method: "cash" }), "[]");
    await expect(call(payer, "record_supplier_payment", json({ supplier_id: await supplier(db), amount: "10.00", financial_account_id: cash, method: "cash" }), "[]")).rejects.toMatchObject({ code: "42501" });
  });

  it("keeps the main company and external suppliers apart, in permissions and in figures", async () => {
    const cash = await cashAccount(db);
    const role = one(await db.sql("insert into public.roles (code, name_en, name_ur) values ('supplier_payer', 'x', 'x') returning id")).id;
    for (const p of ["purchasing.view", "payables.view", "payables.pay"]) await db.sql("insert into public.role_permissions values ($1, $2)", [role, p]);
    const payer = await db.createUser("supplier_payer");
    const s = await supplier(db);
    await call(payer, "record_supplier_payment", json({ supplier_id: s, amount: "10.00", financial_account_id: cash, method: "cash" }), "[]");
    await expect(call(payer, "record_supplier_payment", json({ supplier_id: b.principal, amount: "10.00", financial_account_id: cash, method: "cash" }), "[]")).rejects.toMatchObject({ code: "42501" });
    const company = one(await db.as(payer, (q) => q("select public.procurement_summary(true) r"))).r as Row;
    const external = one(await db.as(payer, (q) => q("select public.procurement_summary(false) r"))).r as Row;
    expect(company).not.toHaveProperty("balance");
    expect(external).toHaveProperty("balance");
    expect((await rows(payer, "report_suppliers", day(-30), today)).some((r) => r.is_principal)).toBe(false);
    const [own] = await rows(payer, "report_purchases", day(-30), today, b.principal, null);
    expect(own).toMatchObject({ paid_amount: null, remaining: null });
  });

  it("explains every supplier's closing balance", async () => {
    const list = await rows(b.admin, "report_suppliers", day(-365), today);
    for (const r of list) {
      const n = (k: string) => Math.round(Number(r[k]) * 100);
      expect(n("opening") + n("purchases") + n("bill_differences") - n("returns") - n("payments") + n("other")).toBe(n("closing"));
      expect(String(r.closing)).toBe(one(await db.sql("select balance::numeric(18,2)::text v from public.v_supplier_balances where supplier_id = $1", [r.supplier_id])).v === "0.00" ? String(r.closing) : one(await db.sql("select balance::numeric(18,2)::text v from public.v_supplier_balances where supplier_id = $1", [r.supplier_id])).v);
    }
  });

  it("returns damaged goods to the supplier and reduces the payable", async () => {
    const p = await product(db, b);
    const s = await supplier(db);
    const g = await call(b.admin, "save_goods_receipt", null, json({ supplier_id: s, warehouse_id: b.mainWarehouse, damaged_warehouse_id: b.damagedWarehouse, date: today }),
      json([{ product_id: p, unit_id: b.units.PCS, quantity: 8, damaged_quantity: 2, unit_cost: "50.00" }]));
    await call(b.admin, "post_goods_receipt", g);
    const r = await call(b.admin, "save_supplier_return", null, json({ supplier_id: s, warehouse_id: b.damagedWarehouse, goods_receipt_id: g, date: today, reason: "Broken" }), json([{ product_id: p, unit_id: b.units.PCS, quantity: 2, unit_price: "50.00" }]));
    await call(b.admin, "post_supplier_return", r);
    expect(await stock(db, p, b.damagedWarehouse)).toEqual({ onHand: 0, reserved: 0 });
    expect(one(await db.sql("select balance::numeric(18,2) v from public.v_supplier_balances where supplier_id = $1", [s])).v).toBe("400.00");
    const [report] = (await rows(b.admin, "report_damaged_stock", today, today)).filter((x) => x.product_id === p);
    expect(report).toMatchObject({ on_hand: "0", received_damaged: "2", returned_to_supplier: "2", written_off: "0" });
    await invariants();
  });
});

describe("negative-stock override", () => {
  it("stays impossible unless the setting and the permission are both present", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await receive(db, b, b.principal, p, 10, b.units.PCS, "10.00");
    await expect(directSale(db, b, c, p, 11, b.units.PCS, "15.00")).rejects.toThrow(/Insufficient stock/);

    await setOverride(true);
    const manager = await db.createUser("manager"); // not granted by default
    const draft = async (user: string, qty: number) => db.as(user, async (q) => {
      const id = one(await q("insert into public.sales_invoices (customer_id, warehouse_id) values ($1, $2) returning id", [c, b.mainWarehouse])).id as string;
      await q("insert into public.sales_invoice_items (sales_invoice_id, product_id, unit_id, quantity, unit_price) values ($1, $2, $3, $4, 15)", [id, p, b.units.PCS, qty]);
      return id;
    });
    const managerInvoice = await draft(manager, 11);
    await expect(db.as(manager, (q) => q("select public.post_sales_invoice($1)", [managerInvoice]))).rejects.toThrow(/Insufficient stock/);
    await directSale(db, b, c, p, 14, b.units.PCS, "15.00"); // Super Admin holds the permission
    expect((await stock(db, p, b.mainWarehouse)).onHand).toBe(-4);
    expect(await valuation(db, p)).toMatchObject({ quantity: -4, value: "-40.00" });
    expect(await db.as(b.admin, (q) => q("select quantity, negative_override from public.stock_movements where product_id = $1 order by id desc limit 1", [p]))).toEqual([{ quantity: "-14", negative_override: true }]);
    await setOverride(false);
    await expect(directSale(db, b, c, p, 1, b.units.PCS, "15.00")).rejects.toThrow(/Insufficient stock/);
    await invariants();
  });

  it("books the cost difference to variance when the shortage is received at another price", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await receive(db, b, b.principal, p, 10, b.units.PCS, "10.00");
    await setOverride(true);
    await directSale(db, b, c, p, 16, b.units.PCS, "20.00"); // 6 short, issued at 10.00
    const variance = await glPaisa("INVENTORY_VARIANCE");
    await receive(db, b, b.principal, p, 4, b.units.PCS, "12.00"); // still 2 short: settles 4 x 2.00 difference
    expect(await valuation(db, p)).toMatchObject({ quantity: -2, value: "-20.00" });
    expect(await glPaisa("INVENTORY_VARIANCE") - variance).toBe(800);
    await receive(db, b, b.principal, p, 10, b.units.PCS, "13.00"); // 2 settle (2 x 3.00), 8 remain at 13.00
    expect(await valuation(db, p)).toMatchObject({ quantity: 8, value: "104.00" });
    expect(await glPaisa("INVENTORY_VARIANCE") - variance).toBe(1400);
    await setOverride(false);
    await invariants();
  });

  it("never takes reserved stock, and cannot write off goods that do not exist", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 10, "5.00");
    const order = await db.as(b.admin, async (q) => {
      const id = one(await q("insert into public.sales_orders (customer_id, warehouse_id) values ($1, $2) returning id", [c, b.mainWarehouse])).id as string;
      await q("insert into public.sales_order_items (sales_order_id, product_id, unit_id, quantity, unit_price) values ($1, $2, $3, 6, 9)", [id, p, b.units.PCS]);
      await q("select public.submit_sales_order($1)", [id]);
      await q("select public.approve_sales_order($1)", [id]);
      return id;
    });
    await setOverride(true);
    await expect(directSale(db, b, c, p, 11, b.units.PCS, "9.00")).rejects.toThrow(/reserved|Insufficient/);
    const adj = await call(b.admin, "save_stock_adjustment", null, json({ warehouse_id: b.mainWarehouse, date: today, kind: "write_off", reason: "x" }), json([{ product_id: p, unit_id: b.units.PCS, quantity: -11 }]));
    await expect(call(b.admin, "post_stock_adjustment", adj)).rejects.toThrow(/Insufficient/);
    await setOverride(false);

    // Dispatch from the warehouse side releases the reservation.
    const line = one(await db.sql("select id from public.sales_order_items where sales_order_id = $1", [order])).id;
    await call(b.admin, "start_picking", order);
    const delivery = await call(b.admin, "save_delivery", order, json({ date: today }), json([{ sales_order_item_id: line, quantity: 4 }]));
    await call(b.admin, "dispatch_delivery", delivery);
    expect(await stock(db, p, b.mainWarehouse)).toEqual({ onHand: 6, reserved: 2 });
    expect(one(await db.sql("select status from public.sales_orders where id = $1", [order])).status).toBe("partially_dispatched");
    await invariants();
  });
});

describe("transfers, counts and adjustments", () => {
  it("saves, edits and posts each document atomically", async () => {
    const p = await product(db, b);
    const p2 = await product(db, b);
    await openingStock(db, b, p, 100, "4.00");
    const t = await call(b.admin, "save_stock_transfer", null, json({ from_warehouse_id: b.mainWarehouse, to_warehouse_id: b.damagedWarehouse, date: today, notes: "Crushed" }), json([{ product_id: p, unit_id: b.units.PCS, quantity: 5 }]));
    await call(b.admin, "save_stock_transfer", t, json({ from_warehouse_id: b.mainWarehouse, to_warehouse_id: b.damagedWarehouse, date: today }), json([{ product_id: p, unit_id: b.units.PCS, quantity: 7 }]));
    await call(b.admin, "post_stock_transfer", t);
    expect((await stock(db, p, b.damagedWarehouse)).onHand).toBe(7);

    const w = await call(b.admin, "save_stock_adjustment", null, json({ warehouse_id: b.damagedWarehouse, date: today, kind: "write_off", reason: "Expired" }), json([{ product_id: p, unit_id: b.units.PCS, quantity: -7 }]));
    const loss = await glPaisa("STOCK_WRITE_OFF");
    await call(b.admin, "post_stock_adjustment", w);
    expect(await glPaisa("STOCK_WRITE_OFF") - loss).toBe(2800);

    const count = await call(b.admin, "save_stock_count", null, json({ warehouse_id: b.mainWarehouse, date: today }), json([{ product_id: p, counted_quantity: 90 }, { product_id: p2, counted_quantity: 0 }]));
    await call(b.admin, "save_stock_count", count, json({ date: today }), json([{ product_id: p, counted_quantity: 91, notes: "recount" }]));
    expect(await db.sql("select system_quantity, counted_quantity, difference, notes from public.stock_count_items where stock_count_id = $1", [count])).toEqual([{ system_quantity: "93", counted_quantity: "91", difference: "-2", notes: "recount" }]);
    await call(b.admin, "post_stock_count", count);
    expect((await stock(db, p, b.mainWarehouse)).onHand).toBe(91);
    await expect(call(b.admin, "save_stock_count", count, json({ date: today }), json([{ product_id: p, counted_quantity: 1 }]))).rejects.toMatchObject({ code: "P0002" });
    await expect(call(b.admin, "save_stock_transfer", null, json({ from_warehouse_id: b.mainWarehouse, to_warehouse_id: b.damagedWarehouse }), "[]")).rejects.toThrow(/at least one line/);
    await invariants();
  });

  it("refuses a count when stock moved after it was taken, until it is checked and saved again", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 100, "4.00");
    const count = await call(b.admin, "save_stock_count", null, json({ warehouse_id: b.mainWarehouse, date: today }), json([{ product_id: p, counted_quantity: 98 }]));
    await directSale(db, b, c, p, 10, b.units.PCS, "9.00");
    await expect(call(b.admin, "post_stock_count", count)).rejects.toThrow(/Stock moved since it was counted/);
    expect((await stock(db, p, b.mainWarehouse)).onHand).toBe(90);
    // Recounted after the sale: 88 on the shelf against 90 in the system.
    await call(b.admin, "save_stock_count", count, json({ date: today }), json([{ product_id: p, counted_quantity: 88 }]));
    await call(b.admin, "post_stock_count", count);
    expect((await stock(db, p, b.mainWarehouse)).onHand).toBe(88);
    expect(await valuation(db, p)).toMatchObject({ quantity: 88, value: "352.00" });
    await invariants();
  });

  it("values stock found after everything was sold at its last cost", async () => {
    const p = await product(db, b);
    const c = await customer(db);
    await openingStock(db, b, p, 10, "6.00");
    await directSale(db, b, c, p, 10, b.units.PCS, "9.00");
    const count = await call(b.admin, "save_stock_count", null, json({ warehouse_id: b.mainWarehouse, date: today }), json([{ product_id: p, counted_quantity: 2 }]));
    await call(b.admin, "post_stock_count", count);
    expect(await valuation(db, p)).toMatchObject({ quantity: 2, value: "12.00" });
    await invariants();
  });
});

describe("reports", () => {
  it("values stock exactly as the ledger does and hides cost without costs.view", async () => {
    const list = await rows(b.admin, "report_stock", null, null);
    const total = list.reduce((sum, r) => sum + Math.round(Number(r.stock_value) * 100), 0);
    expect(total).toBe(await glPaisa("INVENTORY"));
    const viewer = await db.createUser("viewer");
    for (const r of await rows(viewer, "report_stock", null, null)) expect([r.unit_cost, r.stock_value]).toEqual([null, null]);
    for (const r of await rows(viewer, "report_stock_movements", day(-400), today)) expect(r.value_change).toBeNull();
    for (const r of await rows(viewer, "report_damaged_stock", day(-400), today)) expect(r.stock_value).toBeNull();
    for (const fn of ["report_purchases", "report_suppliers", "report_product_profitability"]) {
      await expect(rows(viewer, fn, day(-30), today, ...(fn === "report_purchases" ? [null, null] : []))).rejects.toMatchObject({ code: "42501" });
    }
    await expect(db.as(viewer, (q) => q("select public.inventory_reconciliation()"))).rejects.toMatchObject({ code: "42501" });
    await expect(db.as(viewer, (q) => q("select public.procurement_summary(true)"))).rejects.toMatchObject({ code: "42501" });
  });

  it("lists every movement with its document, filtered and paged", async () => {
    const p = await product(db, b);
    const g = await receive(db, b, b.principal, p, 20, b.units.PCS, "3.00");
    await directSale(db, b, await customer(db), p, 5, b.units.PCS, "6.00");
    const all = await rows(b.admin, "report_stock_movements", today, today, p);
    expect(all.map((m) => [m.movement_type, m.quantity, m.balance_after, m.value_change])).toEqual([["sale", "-5", "15", "-15.00"], ["purchase_receipt", "20", "20", "60.00"]]);
    expect(all[1]!.doc_no).toBe(one(await db.sql("select doc_no from public.goods_receipts where id = $1", [g])).doc_no);
    expect(await rows(b.admin, "report_stock_movements", today, today, p, null, "sale")).toHaveLength(1);
    const second = await rows(b.admin, "report_stock_movements", today, today, p, null, null, 1, 1);
    expect(second).toMatchObject([{ movement_type: "purchase_receipt", total_count: "2" }]);
  });

  it("reports product profitability that agrees with the ledger", async () => {
    const [from, to] = [day(-400), today];
    const list = await rows(b.admin, "report_product_profitability", from, to);
    const sum = (k: string) => list.reduce((s, r) => s + Math.round(Number(r[k]) * 100), 0);
    const ledger = one(await db.sql(`select sum(case when a.system_key in ('SALES','SALES_RETURNS') then l.credit - l.debit else 0 end)::numeric(18,2) sales,
      sum(case when a.system_key = 'COGS' then l.debit - l.credit else 0 end)::numeric(18,2) cogs
      from public.journal_entry_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
      join public.chart_of_accounts a on a.id = l.account_id where e.entry_date between $1 and $2`, [from, to]));
    expect(sum("net_sales")).toBe(Math.round(Number(ledger.sales) * 100));
    expect(sum("cost")).toBe(Math.round(Number(ledger.cogs) * 100));
    for (const r of list) expect(Math.round(Number(r.gross_profit) * 100)).toBe(Math.round(Number(r.net_sales) * 100) - Math.round(Number(r.cost) * 100));
  });

  it("shows shortages with what is already on order", async () => {
    const p = await product(db, b);
    await db.sql("update public.products set reorder_level = 50, default_supplier_id = $2 where id = $1", [p, b.principal]);
    await receive(db, b, b.principal, p, 20, b.units.PCS, "3.00");
    const po = await call(b.admin, "save_purchase_order", null, json({ supplier_id: b.principal, warehouse_id: b.mainWarehouse, date: today }), json([{ product_id: p, unit_id: b.units.CTN, quantity: 1, unit_price: 200 }]));
    await call(b.admin, "approve_purchase_order", po);
    expect((await rows(b.admin, "report_low_stock")).filter((r) => r.product_id === p)).toMatchObject([{ available: "20", reorder_level: "50", shortage: "30", on_order: "72", supplier_en: "Ayra Happiness" }]);
  });
});

describe("business dates", () => {
  it("dates new documents and SOL completion by the day in Pakistan", async () => {
    const t = await call(b.admin, "save_stock_adjustment", null, json({ warehouse_id: b.mainWarehouse, date: today, kind: "other", reason: "x" }), json([{ product_id: await product(db, b), unit_id: b.units.PCS, quantity: 1, unit_cost: 1 }]));
    expect(t).toBeTruthy();
    const c = await customer(db);
    const job = await db.as(b.admin, async (q) => {
      const id = one(await q("select public.save_sol_job(null, jsonb_build_object('customer_id', $1::uuid, 'job_type_id', (select id from public.sol_job_types limit 1), 'contract_value', 100), '[]') id", [c])).id as string;
      await q("select public.set_sol_job_status($1, 'confirmed')", [id]);
      await q("select public.complete_sol_job($1)", [id]);
      return id;
    });
    const dates = one(await db.sql("select j.job_date::text as job, e.entry_date::text as entry from public.sol_jobs j join public.journal_entries e on e.id = j.journal_entry_id where j.id = $1", [job]));
    expect(dates).toEqual({ job: today, entry: today });
    expect(await employee(db)).toBeTruthy();
  });
});

describe("any sequence of documents", () => {
  it("keeps stock, valuation and the ledger in agreement (600 random operations)", async () => {
    let seed = 20261124;
    // mulberry32: reproducible, and unlike a plain LCG its low bits are random too.
    const rnd = (n: number) => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) % n;
    };
    const seen = { negative: 0, override: 0 };
    const products = [await product(db, b), await product(db, b), await product(db, b)];
    const c = await customer(db);
    const s = await supplier(db);
    const warehouses = [b.mainWarehouse, b.damagedWarehouse];
    let posted = 0;
    let refused = 0;
    for (let i = 0; i < 600; i++) {
      if (i % 50 === 0) await setOverride(rnd(2) === 1);
      const p = products[rnd(3)]!;
      const qty = 1 + rnd(40);
      const unit = [b.units.PCS, b.units.PCS, b.units.BOX][rnd(3)]!;
      const price = `${1 + rnd(90)}.${String(rnd(100)).padStart(2, "0")}`;
      try {
        switch (rnd(8)) {
          case 0: case 1: {
            const id = await call(b.admin, "save_goods_receipt", null, json({ supplier_id: rnd(2) ? s : b.principal, warehouse_id: b.mainWarehouse, damaged_warehouse_id: b.damagedWarehouse, date: day(-rnd(20)) }),
              json([{ product_id: p, unit_id: unit, quantity: qty, damaged_quantity: rnd(4), rejected_quantity: rnd(3), unit_cost: price }]));
            await call(b.admin, "post_goods_receipt", id);
            break;
          }
          case 2: case 3: await directSale(db, b, c, p, qty, unit, price); break;
          case 4: {
            const id = await call(b.admin, "save_stock_transfer", null, json({ from_warehouse_id: warehouses[i % 2], to_warehouse_id: warehouses[(i + 1) % 2], date: today }), json([{ product_id: p, unit_id: b.units.PCS, quantity: 1 + rnd(8) }]));
            await call(b.admin, "post_stock_transfer", id);
            break;
          }
          case 5: {
            const id = await call(b.admin, "save_supplier_return", null, json({ supplier_id: s, warehouse_id: warehouses[rnd(2)], date: today }), json([{ product_id: p, unit_id: b.units.PCS, quantity: 1 + rnd(6), unit_price: price }]));
            await call(b.admin, "post_supplier_return", id);
            break;
          }
          case 6: {
            const id = await call(b.admin, "save_stock_count", null, json({ warehouse_id: warehouses[rnd(2)], date: today }), json([{ product_id: p, counted_quantity: rnd(120) }]));
            await call(b.admin, "post_stock_count", id);
            break;
          }
          default: {
            const up = rnd(2) === 1;
            const id = await call(b.admin, "save_stock_adjustment", null, json({ warehouse_id: warehouses[rnd(2)], date: today, kind: up ? "other" : "write_off", reason: "t" }),
              json([{ product_id: p, unit_id: b.units.PCS, quantity: up ? qty : -(1 + rnd(5)), unit_cost: up && rnd(2) ? price : null }]));
            await call(b.admin, "post_stock_adjustment", id);
          }
        }
        posted++;
      } catch (error) {
        expect(["23514", "22023"], String(error)).toContain((error as { code?: string }).code);
        refused++;
      }
      if (i % 60 === 59) await invariants();
    }
    seen.negative = Number(one(await db.sql("select count(*) c from public.stock_movements where balance_after < 0 and product_id = any($1)", [products])).c);
    seen.override = Number(one(await db.sql("select count(*) c from public.stock_movements where negative_override and product_id = any($1)", [products])).c);
    expect(seen.override).toBeGreaterThan(5);
    expect(seen.negative).toBeGreaterThanOrEqual(seen.override);
    expect(posted).toBeGreaterThan(300);
    expect(refused).toBeGreaterThan(10);
    await setOverride(false);
    await invariants();
  }, 120_000);
});
