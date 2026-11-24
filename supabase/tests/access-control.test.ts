// Phase 3 roles, confidential data and user lifecycle. Each role is exercised the
// way PostgREST executes requests: role "authenticated" plus the user's JWT claims.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, one, type TestDb } from "./helpers";
import {
  basics, customer, directSale, employee, openingStock, product, receive, supplier, type Basics,
} from "./fixtures";

let db: TestDb;
let b: Basics;
const users: Record<"superAdmin" | "manager" | "dataEntry" | "viewer", string> = {
  superAdmin: "", manager: "", dataEntry: "", viewer: "",
};
let invoice: string;

const count = async (userId: string, sql: string, params: unknown[] = []) =>
  (await db.as(userId, (q) => q(sql, params))).length;

beforeAll(async () => {
  db = await createTestDb();
  b = await basics(db);
  users.superAdmin = b.admin;
  users.manager = await db.createUser("manager");
  users.dataEntry = await db.createUser("data_entry");
  users.viewer = await db.createUser("viewer");

  const p = await product(db, b);
  await db.sql("update public.product_units set purchase_price = 700 where product_id = $1 and factor = 72", [p]);
  await openingStock(db, b, p, 100, "5.00");
  await receive(db, b, await supplier(db), p, 1, b.units.CTN, "720.00");
  invoice = await directSale(db, b, await customer(db), p, 10, b.units.PCS, "12.00");

  const emp = await employee(db);
  await db.sql("insert into public.employee_salaries (employee_id, base_salary) values ($1, 45000)", [emp]);
  const bank = one(await db.sql("insert into public.financial_accounts (name, account_type) values ('HBL Current', 'bank') returning id")).id;
  await db.sql("insert into public.financial_account_bank_details (financial_account_id, bank_name, account_number) values ($1, 'HBL', '0123456789')", [bank]);
});
afterAll(() => db.close());

describe("confidential data by role", () => {
  const cases: [string, keyof typeof users, boolean][] = [
    ["super admin", "superAdmin", true],
    ["manager", "manager", true],
    ["data entry", "dataEntry", false],
    ["viewer", "viewer", false],
  ];

  it.each(cases)("%s: salaries, bank details, valuation, costs and margins", async (_label, who, allowed) => {
    const u = users[who];
    const expectRows = (n: number) => (allowed ? expect(n).toBeGreaterThan(0) : expect(n).toBe(0));
    expectRows(await count(u, "select * from public.employee_salaries"));
    expectRows(await count(u, "select * from public.financial_account_bank_details"));
    expectRows(await count(u, "select * from public.inventory_valuation"));
    expectRows(await count(u, "select * from public.secure_sales_invoice_costs"));
    expectRows(await count(u, "select * from public.secure_product_unit_costs where purchase_price is not null"));
    expectRows(await count(u, "select * from public.secure_stock_movement_values"));
    expectRows(await count(u, "select * from public.v_account_balances"));
    expectRows(await count(u, "select * from public.journal_entry_lines"));
  });

  it.each(cases)("%s: confidential reports", async (_label, who, allowed) => {
    const run = db.as(users[who], (q) => q("select * from public.trial_balance('2099-12-31')"));
    if (allowed) await expect(run).resolves.not.toHaveLength(0);
    else await expect(run).rejects.toThrow(/Permission denied: reports.financial/);
  });

  it("hides cost columns from direct table reads for every client", async () => {
    for (const u of Object.values(users)) {
      await expect(db.as(u, (q) => q("select cost_total from public.sales_invoices"))).rejects.toMatchObject({ code: "42501" });
      await expect(db.as(u, (q) => q("select purchase_price from public.product_units"))).rejects.toMatchObject({ code: "42501" });
      await expect(db.as(u, (q) => q("select value_change from public.stock_movements"))).rejects.toMatchObject({ code: "42501" });
    }
    // PostgREST "select=*" on a table with hidden columns is rejected, so clients must list columns.
    await expect(db.as(users.dataEntry, (q) => q("select * from public.sales_invoices"))).rejects.toMatchObject({ code: "42501" });
    const visible = await db.as(users.dataEntry, (q) => q("select id, total_amount from public.sales_invoices where id = $1", [invoice]));
    expect(visible).toHaveLength(1);
  });

  it("shows stock quantities to data entry and viewers without cost", async () => {
    for (const u of [users.dataEntry, users.viewer]) {
      const rows = await db.as(u, (q) => q("select available, avg_unit_cost, estimated_value from public.v_stock_on_hand"));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.avg_unit_cost === "0" && r.estimated_value === "0.00")).toBe(true);
    }
  });

  it("keeps posted purchasing documents (with costs) from data entry and viewers", async () => {
    expect(await count(users.manager, "select id from public.goods_receipts")).toBeGreaterThan(0);
    expect(await count(users.dataEntry, "select id from public.goods_receipts")).toBe(0);
    expect(await count(users.viewer, "select id from public.goods_receipts")).toBe(0);
  });

  it("restricts user administration to the super admin", async () => {
    expect(await count(users.superAdmin, "select * from public.admin_list_users()")).toBeGreaterThan(0);
    for (const u of [users.manager, users.dataEntry, users.viewer]) {
      await expect(db.as(u, (q) => q("select * from public.admin_list_users()"))).rejects.toThrow(/Permission denied: users.view/);
      await expect(db.as(u, (q) => q("select public.admin_set_user_status($1, 'suspended')", [users.viewer]))).rejects.toThrow(/Permission denied/);
    }
  });
});

describe("data entry users", () => {
  it("enter records but lose sight of confidential values once posted", async () => {
    const p = await product(db, b);
    const s = await supplier(db);
    const grn = await db.as(users.dataEntry, async (q) => {
      const id = one(await q("insert into public.goods_receipts (supplier_id, warehouse_id) values ($1, $2) returning id", [s, b.mainWarehouse])).id;
      await q("insert into public.goods_receipt_items (goods_receipt_id, product_id, unit_id, quantity, unit_cost) values ($1, $2, $3, 2, 650)", [id, p, b.units.CTN]);
      return id as string;
    });
    expect(await count(users.dataEntry, "select id from public.goods_receipts where id = $1", [grn])).toBe(1);
    await expect(db.as(users.dataEntry, (q) => q("select public.post_goods_receipt($1)", [grn]))).rejects.toThrow(/Permission denied: purchasing.post/);

    await db.as(users.manager, (q) => q("select public.post_goods_receipt($1)", [grn]));
    expect(await count(users.dataEntry, "select id from public.goods_receipts where id = $1", [grn])).toBe(0);
    expect(await count(users.dataEntry, "select id from public.goods_receipt_items where goods_receipt_id = $1", [grn])).toBe(0);
  });

  it("record expenses and collections as drafts only", async () => {
    const cash = one(await db.sql("insert into public.financial_accounts (name, account_type) values ('Till', 'cash') returning id")).id;
    const c = await customer(db);
    const { exp, pay } = await db.as(users.dataEntry, async (q) => {
      const fuel = one(await q("select id from public.expense_categories where code = 'FUEL'")).id;
      const exp = one(await q("insert into public.expenses (category_id, amount, financial_account_id) values ($1, 1500, $2) returning id", [fuel, cash])).id;
      const pay = one(await q("insert into public.customer_payments (customer_id, amount, financial_account_id, method) values ($1, 900, $2, 'cash') returning id", [c, cash])).id;
      return { exp, pay };
    });
    await expect(db.as(users.dataEntry, (q) => q("select public.post_expense($1)", [exp]))).rejects.toThrow(/Permission denied/);
    await expect(db.as(users.dataEntry, (q) => q("select public.post_customer_payment($1)", [pay]))).rejects.toThrow(/Permission denied/);
    await db.as(users.manager, (q) => q("select public.post_expense($1)", [exp]));
    expect(await count(users.dataEntry, "select id from public.expenses where id = $1", [exp])).toBe(0);
    expect(await count(users.dataEntry, "select id from public.customer_payments where id = $1", [pay])).toBe(1);
  });

  it("cannot set salaries", async () => {
    const e = await employee(db);
    await expect(db.as(users.dataEntry, (q) => q("insert into public.employee_salaries (employee_id, base_salary) values ($1, 1)", [e])))
      .rejects.toMatchObject({ code: "42501" });
  });
});

describe("viewers", () => {
  it("are read-only", async () => {
    expect(await count(users.viewer, "select id from public.customers")).toBeGreaterThan(0);
    await expect(db.as(users.viewer, (q) => q("insert into public.customers (code, name) values ('V1', 'x')"))).rejects.toMatchObject({ code: "42501" });
    expect(await db.as(users.viewer, (q) => q("update public.customers set name = 'changed' returning id"))).toEqual([]);
    expect(await db.as(users.viewer, (q) => q("delete from public.products returning id"))).toEqual([]);
    await expect(db.as(users.viewer, (q) => q("insert into public.sales_orders (customer_id, warehouse_id) select id, $1 from public.customers limit 1", [b.mainWarehouse])))
      .rejects.toMatchObject({ code: "42501" });
  });
});

describe("company accounts", () => {
  it("separates the main company account from other suppliers", async () => {
    const clerkRole = one(await db.as(users.superAdmin, (q) => q("insert into public.roles (code, name_en, name_ur) values ('payables_clerk', 'Payables Clerk', 'ادائیگی کلرک') returning id"))).id;
    await db.as(users.superAdmin, (q) => q("insert into public.role_permissions (role_id, permission_code) values ($1, 'payables.view'), ($1, 'payables.pay')", [clerkRole]));
    const clerk = await db.createUser("payables_clerk");
    const cash = one(await db.sql("insert into public.financial_accounts (name, account_type) values ('Petty', 'cash') returning id")).id;
    const s = await supplier(db);

    await db.as(clerk, async (q) => {
      const id = one(await q("insert into public.supplier_payments (supplier_id, amount, financial_account_id, method) values ($1, 100, $2, 'cash') returning id", [s, cash])).id;
      await q("select public.post_supplier_payment($1)", [id]);
    });
    await expect(db.as(clerk, (q) => q("insert into public.supplier_payments (supplier_id, amount, financial_account_id, method) values ($1, 100, $2, 'cash')", [b.principal, cash])))
      .rejects.toMatchObject({ code: "42501" });
    const draft = one(await db.sql("insert into public.supplier_payments (supplier_id, amount, financial_account_id, method) values ($1, 50, $2, 'cash') returning id", [b.principal, cash])).id;
    await expect(db.as(clerk, (q) => q("select public.post_supplier_payment($1)", [draft]))).rejects.toThrow(/Permission denied: company.pay/);

    await receive(db, b, b.principal, await product(db, b), 1, b.units.BOX, "100.00");
    expect(Number(one(await db.sql("select count(*) c from public.journal_entry_lines where supplier_id = $1", [b.principal])).c)).toBeGreaterThan(0);
    const principalLines = await db.as(clerk, (q) => q("select l.id from public.journal_entry_lines l where l.supplier_id = $1", [b.principal]));
    expect(principalLines).toEqual([]);
    expect(await count(users.manager, "select * from public.v_company_ledger")).toBeGreaterThan(0);
  });
});

describe("custom roles and permission changes", () => {
  it("take effect immediately", async () => {
    const roleId = one(await db.as(users.superAdmin, (q) => q("insert into public.roles (code, name_en, name_ur) values ('hr_clerk', 'HR Clerk', 'ایچ آر کلرک') returning id"))).id;
    const hr = await db.createUser("hr_clerk");
    expect(await count(hr, "select id from public.employees")).toBe(0);

    await db.as(users.superAdmin, (q) => q("insert into public.role_permissions (role_id, permission_code) values ($1, 'employees.view')", [roleId]));
    expect(await count(hr, "select id from public.employees")).toBeGreaterThan(0);
    expect(await count(hr, "select * from public.employee_salaries")).toBe(0);

    await db.as(users.superAdmin, (q) => q("delete from public.role_permissions where role_id = $1 and permission_code = 'employees.view'", [roleId]));
    expect(await count(hr, "select id from public.employees")).toBe(0);
  });

  it("protects system roles and the super admin permission set", async () => {
    expect(await db.as(users.superAdmin, (q) => q("update public.roles set name_en = 'Boss' where code = 'manager' returning id"))).toEqual([]);
    expect(await db.as(users.superAdmin, (q) => q("delete from public.roles where code = 'viewer' returning id"))).toEqual([]);
    await expect(db.as(users.superAdmin, (q) => q("delete from public.role_permissions where role_id = (select id from public.roles where code = 'super_admin')")))
      .rejects.toThrow(/Super Admin permissions cannot be changed/);
  });
});

describe("user lifecycle", () => {
  const status = async (id: string) =>
    one(await db.as(users.superAdmin, (q) => q("select status, role_code from public.admin_list_users() where id = $1", [id])));

  it("suspends, reactivates and removes access", async () => {
    const u = await db.createUser("viewer");
    expect(await count(u, "select id from public.customers")).toBeGreaterThan(0);

    await db.as(users.superAdmin, (q) => q("select public.admin_set_user_status($1, 'suspended')", [u]));
    expect(await count(u, "select id from public.customers")).toBe(0);
    expect(await count(u, "select * from public.my_permissions()")).toBe(0);
    expect(await status(u)).toMatchObject({ status: "suspended" });

    await db.as(users.superAdmin, (q) => q("select public.admin_set_user_status($1, 'active')", [u]));
    expect(await count(u, "select id from public.customers")).toBeGreaterThan(0);

    await db.as(users.superAdmin, (q) => q("select public.admin_set_user_status($1, 'removed')", [u]));
    expect(await status(u)).toEqual({ status: "removed", role_code: null });
    expect(await count(u, "select id from public.customers")).toBe(0);
    await expect(db.as(users.superAdmin, (q) => q("select public.admin_set_user_status($1, 'active')", [u]))).rejects.toThrow(/Assign a role/);
    await db.as(users.superAdmin, (q) => q("select public.admin_set_user_status($1, 'active', (select id from public.roles where code = 'viewer'))", [u]));
    expect(await status(u)).toMatchObject({ role_code: "viewer" });
  });

  it("limits managers to two active users, as configured", async () => {
    const limitDb = await createTestDb();
    try {
      const sa = await limitDb.createUser("super_admin");
      const managerRole = one(await limitDb.sql("select id from public.roles where code = 'manager'")).id;
      const [m1, m2, m3] = [await limitDb.createUser(null), await limitDb.createUser(null), await limitDb.createUser(null)];
      const assign = (u: string) => limitDb.as(sa, (q) => q("select public.admin_assign_role($1, $2)", [u, managerRole]));
      await assign(m1);
      await assign(m2);
      await expect(assign(m3)).rejects.toThrow(/limited to 2 active users/);
      await limitDb.as(sa, (q) => q("select public.admin_set_user_status($1, 'suspended')", [m1]));
      await assign(m3);
      await expect(limitDb.as(sa, (q) => q("select public.admin_set_user_status($1, 'active')", [m1]))).rejects.toThrow(/limited to 2/);
    } finally {
      await limitDb.close();
    }
  });

  it("prevents self-lockout and privilege escalation", async () => {
    await expect(db.as(users.superAdmin, (q) => q("select public.admin_set_user_status($1, 'suspended')", [users.superAdmin])))
      .rejects.toThrow(/your own role or access/);
    await expect(db.sql("update public.profiles set is_active = false where id = $1", [users.superAdmin]))
      .rejects.toThrow(/At least one active Super Admin/);

    const roleId = one(await db.as(users.superAdmin, (q) => q("insert into public.roles (code, name_en, name_ur) values ('deputy', 'Deputy', 'نائب') returning id"))).id;
    await db.as(users.superAdmin, (q) => q("insert into public.role_permissions (role_id, permission_code) values ($1, 'users.view'), ($1, 'users.manage')", [roleId]));
    const deputy = await db.createUser("deputy");
    const target = await db.createUser("viewer");
    await expect(db.as(deputy, (q) => q("select public.admin_assign_role($1, (select id from public.roles where code = 'super_admin'))", [target])))
      .rejects.toThrow(/Only a Super Admin/);
    await expect(db.as(users.manager, (q) => q("update public.profiles set role_id = (select id from public.roles where code = 'super_admin') where id = (select auth.uid())")))
      .rejects.toThrow(/Only administrators/);
  });

  it("records access changes in the audit history", async () => {
    const u = await db.createUser("viewer");
    await db.as(users.superAdmin, (q) => q("select public.admin_set_user_status($1, 'suspended')", [u]));
    const rows = await db.as(users.superAdmin, (q) => q(
      "select actor_id, old_data ->> 'is_active' was, new_data ->> 'is_active' now from public.v_access_audit where table_name = 'profiles' and record_id = $1 and action = 'UPDATE'", [u]));
    expect(rows).toContainEqual({ actor_id: users.superAdmin, was: "true", now: "false" });
  });
});

describe("employees and login accounts are separate", () => {
  it("keeps employees without logins and links them optionally", async () => {
    const e = await employee(db);
    const u = await db.createUser("viewer");
    expect(one(await db.sql("select count(*) c from public.profiles where employee_id = $1", [e])).c).toBe("0");
    await db.as(users.superAdmin, (q) => q("select public.admin_link_employee($1, $2)", [u, e]));
    expect(one(await db.sql("select employee_id from public.profiles where id = $1", [u])).employee_id).toBe(e);
    await db.as(users.superAdmin, (q) => q("select public.admin_set_user_status($1, 'removed')", [u]));
    expect(one(await db.sql("select count(*) c from public.employees where id = $1", [e])).c).toBe("1");
  });

  it("limits photo uploads to employee managers", async () => {
    await db.as(users.manager, (q) => q("insert into storage.objects (bucket_id, name) values ('employee-photos', 'e1/photo.jpg')"));
    await expect(db.as(users.dataEntry, (q) => q("insert into storage.objects (bucket_id, name) values ('employee-photos', 'e2/photo.jpg')")))
      .rejects.toMatchObject({ code: "42501" });
  });
});

describe("first administrator provisioning", () => {
  it("works once, only with trusted credentials, and only for an existing user", async () => {
    const fresh = await createTestDb();
    try {
      const u = await fresh.createUser(null);
      const email = one(await fresh.sql("select email from auth.users where id = $1", [u])).email;
      await expect(fresh.as(u, (q) => q("select public.bootstrap_super_admin($1)", [email]))).rejects.toMatchObject({ code: "42501" });
      await expect(fresh.sql("select public.bootstrap_super_admin('nobody@example.com')")).rejects.toThrow(/invite the user first/);
      await fresh.sql("select public.bootstrap_super_admin($1)", [String(email).toUpperCase()]);
      expect((await fresh.as(u, (q) => q("select * from public.my_permissions()"))).length).toBe(64);
      const other = await fresh.createUser(null);
      const otherEmail = one(await fresh.sql("select email from auth.users where id = $1", [other])).email;
      await expect(fresh.sql("select public.bootstrap_super_admin($1)", [otherEmail])).rejects.toThrow(/already exists/);
    } finally {
      await fresh.close();
    }
  });
});
