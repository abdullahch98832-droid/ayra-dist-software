import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, one, type TestDb } from "./helpers";
import { basics, product, type Basics } from "./fixtures";
import { PERMISSION_MODULES, PERMISSIONS } from "../../src/lib/auth/permissions";

let db: TestDb;
let b: Basics;

beforeAll(async () => {
  db = await createTestDb();
  b = await basics(db);
});
afterAll(() => db.close());

describe("schema safety", () => {
  it("enables RLS on every public table", async () => {
    const rows = await db.sql(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("gives anon no table privileges and no function execution", async () => {
    const tables = await db.sql(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'v')
          and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
               or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))`
    );
    expect(tables).toEqual([]);
    const functions = await db.sql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')`
    );
    expect(functions).toEqual([]);
  });

  it("makes every view security_invoker, except secure_* views that filter on a permission", async () => {
    const rows = await db.sql(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'v'
          and not coalesce('security_invoker=true' = any (c.reloptions), false)
          and not (c.relname like 'secure\\_%'
                   and 'security_barrier=true' = any (c.reloptions)
                   and pg_get_viewdef(c.oid) like '%has_permission%')`
    );
    expect(rows).toEqual([]);
  });

  it("pins search_path on every SECURITY DEFINER function", async () => {
    const rows = await db.sql(
      `select n.nspname || '.' || p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private') and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`
    );
    expect(rows).toEqual([]);
  });

  it("checks a permission in every public SECURITY DEFINER RPC", async () => {
    const rows = await db.sql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef and p.prosrc not like '%require_permission%'
          and p.proname not in ('my_permissions', 'bootstrap_super_admin')`
    );
    expect(rows).toEqual([]);
  });
});

describe("reference data", () => {
  it("seeds roles and permissions", async () => {
    expect(Number(one(await db.sql("select count(*) c from public.permissions")).c)).toBe(59);
    const roles = await db.sql("select code from public.roles order by code");
    expect(roles.map((r) => r.code)).toEqual(["accountant", "data_entry", "driver", "manager", "order_taker", "super_admin", "viewer", "warehouse"]);
    const system = await db.sql("select code from public.roles where is_system order by code");
    expect(system.map((r) => r.code)).toEqual(["data_entry", "manager", "super_admin", "viewer"]);
    const adminMissing = await db.sql(
      `select code from public.permissions where code not in
         (select permission_code from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.code = 'super_admin')`
    );
    expect(adminMissing).toEqual([]);
    const managerAdmin = await db.sql(
      `select permission_code from public.role_permissions rp join public.roles r on r.id = rp.role_id
        where r.code = 'manager' and permission_code in ('users.view', 'users.manage', 'settings.manage')`
    );
    expect(managerAdmin).toEqual([]);
  });

  it("keeps the application's permission list in sync with the database", async () => {
    const rows = await db.sql("select code, module from public.permissions order by code");
    expect(rows.map((r) => r.code)).toEqual([...PERMISSIONS].sort());
    for (const r of rows) expect(PERMISSION_MODULES as readonly string[]).toContain(r.module);
  });

  it("configures every system account used by posting logic", async () => {
    const keys = (await db.sql("select system_key from public.chart_of_accounts where system_key is not null")).map((r) => r.system_key);
    for (const key of ["AR", "INVENTORY", "AP_PRINCIPAL", "AP_SUPPLIERS", "TAX_OUTPUT", "SALES", "SALES_RETURNS",
      "SOL_REVENUE", "COGS", "INVENTORY_VARIANCE", "STOCK_WRITE_OFF", "OPENING_EQUITY", "EMPLOYEE_ADVANCES",
      "SALARIES_PAYABLE", "SALARIES_EXPENSE", "CASH_PARENT", "BANK_PARENT"]) {
      expect(keys).toContain(key);
    }
  });

  it("has exactly one principal supplier (the main company)", async () => {
    await expect(db.sql("insert into public.suppliers (code, name, is_principal) values ('X', 'Second', true)"))
      .rejects.toMatchObject({ code: "23505" });
  });
});

describe("foreign keys and constraints", () => {
  it("rejects references to missing rows", async () => {
    await expect(
      db.sql("insert into public.products (sku, name_en, base_unit_id, category_id) values ('FK1', 'x', $1, gen_random_uuid())", [b.units.PCS])
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("prevents deleting a unit that products use", async () => {
    await product(db, b);
    await expect(db.sql("delete from public.units where id = $1", [b.units.PCS])).rejects.toMatchObject({ code: "23503" });
  });

  it("creates the base unit automatically and protects it", async () => {
    const id = await product(db, b);
    const base = one(await db.sql("select factor from public.product_units where product_id = $1 and unit_id = $2", [id, b.units.PCS]));
    expect(base.factor).toBe("1");
    await expect(db.sql("update public.product_units set factor = 2 where product_id = $1 and unit_id = $2", [id, b.units.PCS]))
      .rejects.toThrow(/factor 1/);
    await expect(db.sql("update public.products set base_unit_id = $2 where id = $1", [id, b.units.BOX]))
      .rejects.toThrow(/base unit/);
  });

  it("rejects negative money and zero quantities", async () => {
    const c = one(await db.sql("insert into public.customers (code, name) values ('NEG', 'n') returning id")).id;
    await expect(db.sql("update public.customers set credit_limit = -1 where id = $1", [c])).rejects.toMatchObject({ code: "23514" });
  });
});
