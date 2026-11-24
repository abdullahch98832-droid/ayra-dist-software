import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createMigratedDatabase } from "../../scripts/db/local-db.mjs";

// Table access must come from the migrations, not from Supabase's "automatically expose new
// tables" setting. The other database tests already run without it; this compares both.
const PRIVILEGES = `
  select r.rolname as role, c.relname as rel, a.attname as col, p.priv,
         has_column_privilege(r.rolname, c.oid, a.attnum, p.priv) as granted
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
   cross join (values ('SELECT'), ('INSERT'), ('UPDATE')) p(priv)
   cross join (select rolname from pg_roles where rolname in ('authenticated', 'anon')) r
   where c.relkind in ('r', 'v')
   union all
  select r.rolname, c.relname, '*', 'DELETE', has_table_privilege(r.rolname, c.oid, 'DELETE')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   cross join (select rolname from pg_roles where rolname in ('authenticated', 'anon')) r
   where c.relkind in ('r', 'v')`;

describe("API grants", () => {
  const connection = inject("pgConnection");
  const names = { exposed: `g_${randomUUID().slice(0, 8)}`, explicit: `g_${randomUUID().slice(0, 8)}` };

  const query = async (database: string, sql: string) => {
    const client = new pg.Client({ ...connection, database });
    await client.connect();
    try {
      return (await client.query(sql)).rows;
    } finally {
      await client.end();
    }
  };

  beforeAll(async () => {
    await createMigratedDatabase(connection, names.exposed, { autoExpose: true });
    await createMigratedDatabase(connection, names.explicit, { autoExpose: false });
  });

  afterAll(async () => {
    for (const name of Object.values(names)) await query("postgres", `drop database if exists ${name} with (force)`);
  });

  it("are the same whether or not the project exposes new tables automatically", async () => {
    const granted = async (database: string) =>
      (await query(database, PRIVILEGES)).filter((r) => r.granted).map((r) => `${r.role} ${r.priv} ${r.rel}.${r.col}`).sort();
    expect(await granted(names.explicit)).toEqual(await granted(names.exposed));
  });

  it("give anonymous visitors no access to any table", async () => {
    const rows = await query(names.explicit, PRIVILEGES);
    expect(rows.filter((r) => r.role === "anon" && r.granted)).toEqual([]);
  });

  it("let a signed-in user read their own profile and role, which sign-in depends on", async () => {
    const [row] = await query(names.explicit, `
      select has_table_privilege('authenticated', 'public.profiles', 'SELECT') as profiles,
             has_table_privilege('authenticated', 'public.roles', 'SELECT') as roles,
             has_function_privilege('authenticated', 'public.my_permissions()', 'EXECUTE') as permissions`);
    expect(row).toEqual({ profiles: true, roles: true, permissions: true });
  });

  it("still hide confidential columns", async () => {
    const [row] = await query(names.explicit, `
      select has_column_privilege('authenticated', 'public.product_units', 'purchase_price', 'SELECT') as price,
             has_column_privilege('authenticated', 'public.sales_invoices', 'cost_total', 'SELECT') as cost,
             has_column_privilege('authenticated', 'public.stock_movements', 'value_change', 'SELECT') as value`);
    expect(row).toEqual({ price: false, cost: false, value: false });
  });
});
