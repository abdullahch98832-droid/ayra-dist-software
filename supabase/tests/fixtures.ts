import { one, type TestDb } from "./helpers";

export interface Basics {
  admin: string;
  mainWarehouse: string;
  damagedWarehouse: string;
  principal: string;
  units: Record<"PCS" | "PKT" | "BOX" | "CTN", string>;
}

export async function basics(db: TestDb): Promise<Basics> {
  const admin = await db.createUser("super_admin");
  const wh = await db.sql("select id, code from public.warehouses");
  const units = await db.sql("select id, code from public.units");
  const principal = one(await db.sql("select id from public.suppliers where is_principal")).id as string;
  const byCode = (rows: typeof wh, code: string) => rows.find((r) => r.code === code)!.id as string;
  return {
    admin,
    mainWarehouse: byCode(wh, "MAIN"),
    damagedWarehouse: byCode(wh, "DAMAGED"),
    principal,
    units: {
      PCS: byCode(units, "PCS"),
      PKT: byCode(units, "PKT"),
      BOX: byCode(units, "BOX"),
      CTN: byCode(units, "CTN"),
    },
  };
}

let counter = 0;
const seq = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Product in pieces, with Box = 12 pcs and Carton = 6 boxes = 72 pcs. */
export async function product(db: TestDb, b: Basics, options: { taxRate?: number } = {}) {
  const id = one(
    await db.sql(
      "insert into public.products (sku, name_en, base_unit_id, tax_rate) values ($1, $1, $2, $3) returning id",
      [`SKU-${seq()}`, b.units.PCS, options.taxRate ?? 0]
    )
  ).id as string;
  await db.sql(
    "insert into public.product_units (product_id, unit_id, factor) values ($1, $2, 12), ($1, $3, 72)",
    [id, b.units.BOX, b.units.CTN]
  );
  return id;
}

export async function customer(db: TestDb, options: { creditLimit?: string; orderTakerId?: string } = {}) {
  return one(
    await db.sql(
      "insert into public.customers (code, name, credit_limit, order_taker_id) values ($1, $1, $2, $3) returning id",
      [`C-${seq()}`, options.creditLimit ?? null, options.orderTakerId ?? null]
    )
  ).id as string;
}

export async function supplier(db: TestDb) {
  return one(
    await db.sql("insert into public.suppliers (code, name) values ($1, $1) returning id", [`S-${seq()}`])
  ).id as string;
}

export async function cashAccount(db: TestDb) {
  return one(
    await db.sql("insert into public.financial_accounts (name, account_type) values ($1, 'cash') returning id", [
      `Cash ${seq()}`,
    ])
  ).id as string;
}

export async function employee(db: TestDb) {
  return one(
    await db.sql("insert into public.employees (employee_code, full_name) values ($1, $1) returning id", [
      `E-${seq()}`,
    ])
  ).id as string;
}

/** Posts opening stock (base units) at a per-piece cost. */
export async function openingStock(db: TestDb, b: Basics, productId: string, pieces: number, unitCost: string, warehouseId = b.mainWarehouse) {
  return db.as(b.admin, async (q) => {
    const adj = one(
      await q("insert into public.stock_adjustments (warehouse_id, kind) values ($1, 'opening') returning id", [warehouseId])
    ).id;
    await q(
      "insert into public.stock_adjustment_items (stock_adjustment_id, product_id, unit_id, quantity, unit_cost) values ($1, $2, $3, $4, $5)",
      [adj, productId, b.units.PCS, pieces, unitCost]
    );
    await q("select public.post_stock_adjustment($1)", [adj]);
    return adj as string;
  });
}

/** Creates and posts a goods receipt for one line. */
export async function receive(
  db: TestDb, b: Basics, supplierId: string, productId: string,
  quantity: number, unitId: string, unitCost: string, warehouseId = b.mainWarehouse
) {
  return db.as(b.admin, async (q) => {
    const grn = one(
      await q("insert into public.goods_receipts (supplier_id, warehouse_id) values ($1, $2) returning id", [supplierId, warehouseId])
    ).id as string;
    await q(
      "insert into public.goods_receipt_items (goods_receipt_id, product_id, unit_id, quantity, unit_cost) values ($1, $2, $3, $4, $5)",
      [grn, productId, unitId, quantity, unitCost]
    );
    await q("select public.post_goods_receipt($1)", [grn]);
    return grn;
  });
}

/** Direct (non-order) sales invoice for one line, posted. */
export async function directSale(
  db: TestDb, b: Basics, customerId: string, productId: string,
  quantity: number, unitId: string, unitPrice: string, warehouseId = b.mainWarehouse
) {
  return db.as(b.admin, async (q) => {
    const inv = one(
      await q("insert into public.sales_invoices (customer_id, warehouse_id) values ($1, $2) returning id", [customerId, warehouseId])
    ).id as string;
    await q(
      "insert into public.sales_invoice_items (sales_invoice_id, product_id, unit_id, quantity, unit_price) values ($1, $2, $3, $4, $5)",
      [inv, productId, unitId, quantity, unitPrice]
    );
    await q("select public.post_sales_invoice($1)", [inv]);
    return inv;
  });
}

export async function stock(db: TestDb, productId: string, warehouseId: string) {
  const row = (await db.sql(
    "select on_hand, reserved from public.stock_balances where product_id = $1 and warehouse_id = $2",
    [productId, warehouseId]
  ))[0];
  return { onHand: Number(row?.on_hand ?? 0), reserved: Number(row?.reserved ?? 0) };
}

export async function valuation(db: TestDb, productId: string) {
  const row = (await db.sql("select quantity, total_value, avg_unit_cost from public.inventory_valuation where product_id = $1", [productId]))[0];
  return { quantity: Number(row?.quantity ?? 0), value: String(row?.total_value ?? "0.00"), avg: String(row?.avg_unit_cost ?? "0") };
}

/** GL balance (debit - credit) of a system account. */
export async function glBalance(db: TestDb, systemKey: string) {
  return String(
    one(await db.sql(
      `select coalesce(sum(l.debit - l.credit), 0)::numeric(18,2) as b
         from public.journal_entry_lines l
         join public.journal_entries e on e.id = l.journal_entry_id and e.status = 'posted'
         join public.chart_of_accounts a on a.id = l.account_id
        where a.system_key = $1`, [systemKey])).b
  );
}
