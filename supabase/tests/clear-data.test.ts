// The hand-run script that clears all entered data and every login but the Super Admin's.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, one, type TestDb } from "./helpers";
import { basics, cashAccount, customer, employee, openingStock, product, supplier, type Basics } from "./fixtures";

const script = readFileSync(join(import.meta.dirname, "../maintenance/clear-all-data.sql"), "utf8");
const preview = readFileSync(join(import.meta.dirname, "../maintenance/clear-all-data-preview.sql"), "utf8");
const confirmed = script.replace("v_confirm text := ''", "v_confirm text := 'CLEAR'");
const keeping = (email: string) => confirmed.replace("v_keep_email text := ''", `v_keep_email text := '${email}'`);

let db: TestDb;
let b: Basics;
const count = async (table: string) => Number(one(await db.sql(`select count(*) c from ${table}`)).c);
/** Rows of every table that keeps its content. */
const reference = async () => Promise.all(["permissions", "roles", "role_permissions", "units", "expense_categories", "app_settings", "document_sequences", "sol_job_types"].map((t) => count(`public.${t}`)));

beforeEach(async () => {
  db = await createTestDb();
  b = await basics(db);
});
afterEach(() => db.close());

async function fill() {
  const p = await product(db, b);
  await openingStock(db, b, p, 50, "60");
  await cashAccount(db);
  await customer(db);
  await supplier(db);
  await db.createUser("order_taker", { employeeId: await employee(db) });
  await db.createUser("manager");
  await db.createUser(null);
  const driver = one(await db.sql("insert into public.drivers (employee_id, license_number) values ($1, 'LIC-1') returning id", [await employee(db)])).id;
  const vehicle = one(await db.sql("insert into public.vehicles (registration_no, name, driver_id) values ('LES-1', 'Pickup', $1) returning id", [driver])).id;
  await db.sql("insert into public.warehouses (code, name_en, warehouse_type) values ('SHOP2', 'Second', 'main')");
  await db.sql("insert into public.warehouses (code, name_en, warehouse_type, vehicle_id) values ('VAN', 'Van', 'vehicle', $1)", [vehicle]);
}

describe("clearing all data", () => {
  it("changes nothing until it is confirmed, and the preview changes nothing", async () => {
    await fill();
    const before = [await count("auth.users"), await count("public.journal_entries"), await count("public.audit_logs")];
    const rows = await db.sql(preview);
    expect(rows.filter((r) => r.result === "KEEP")).toHaveLength(1);
    await expect(db.sql(script)).rejects.toThrow("Nothing was changed");
    expect([await count("auth.users"), await count("public.journal_entries"), await count("public.audit_logs")]).toEqual(before);
  });

  it("clears the entries, keeps the Super Admin and the settings", async () => {
    const [accounts, kept] = [await count("public.chart_of_accounts"), await reference()];
    await fill();
    expect(await count("public.journal_entries")).toBeGreaterThan(0);
    await db.sql(confirmed);
    const stay = ["app_settings", "chart_of_accounts", "document_sequences", "expense_categories", "permissions", "profiles", "roles", "role_permissions", "sol_job_types", "suppliers", "units", "warehouses"];
    for (const { tablename } of await db.sql("select tablename from pg_tables where schemaname = 'public'")) {
      if (!stay.includes(tablename as string)) expect([tablename, await count(`public.${tablename as string}`)]).toEqual([tablename, 0]);
    }
    expect(await count("public.chart_of_accounts")).toBe(accounts);
    expect(await reference()).toEqual(kept);
    expect(await db.sql("select id, full_name, is_active, employee_id from public.profiles")).toEqual([{ id: b.admin, full_name: "Abdullah Chattha", is_active: true, employee_id: null }]);
    expect(await db.sql("select id from auth.users")).toEqual([{ id: b.admin }]);
    expect(await db.sql("select is_principal from public.suppliers")).toEqual([{ is_principal: true }]);
    expect((await db.sql("select code from public.warehouses order by code")).map((r) => r.code)).toEqual(["DAMAGED", "MAIN"]);
  });

  it("leaves a system that works, with numbers from 1", async () => {
    await fill();
    await db.sql(confirmed);
    const p = await product(db, b);
    await openingStock(db, b, p, 10, "5");
    expect(one(await db.sql("select doc_no from public.journal_entries")).doc_no).toBe("JV-000001");
    for (const r of await db.as(b.admin, (q) => q("select * from public.ledger_checks()"))) expect([r.check_code, Number(r.ledger)]).toEqual([r.check_code, Number(r.documents)]);
    // Rules removed by nobody: posted entries still cannot be changed.
    await expect(db.sql("delete from public.journal_entries")).rejects.toThrow();
    await expect(db.sql("delete from public.audit_logs")).rejects.toThrow();
  });

  it("asks which Super Admin stays when there are two", async () => {
    const second = await db.createUser("super_admin");
    await fill();
    await expect(db.sql(confirmed)).rejects.toThrow("Exactly one active Super Admin");
    expect(await count("auth.users")).toBeGreaterThan(2);
    await expect(db.sql(keeping("nobody@test.local"))).rejects.toThrow("Exactly one active Super Admin");
    await db.sql(keeping(`${second}@test.local`));
    expect(await db.sql("select id from auth.users")).toEqual([{ id: second }]);
  });

  it("stops at a table nobody decided about", async () => {
    await db.sql("create table public.something_new (id int)");
    await expect(db.sql(confirmed)).rejects.toThrow("Unknown tables: something_new");
  });
});
