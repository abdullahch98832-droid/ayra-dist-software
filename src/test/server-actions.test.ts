import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./fake-supabase";

// Server-level enforcement: actions must reject callers lacking the permission
// BEFORE touching the database or the secret-key admin client.
let current = fakeSupabase([]);
const adminClient = { auth: { admin: { inviteUserByEmail: vi.fn(), updateUserById: vi.fn(), deleteUser: vi.fn(), getUserById: vi.fn() } } };

vi.mock("@/lib/supabase/env", () => ({ getSupabasePublicEnv: () => ({ url: "http://x", publishableKey: "k" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => current.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminClient) }));
vi.mock("@/lib/site-url", () => ({ getSiteUrl: async () => "http://localhost:3000" }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const { inviteUserAction, setUserStatusAction, assignRoleAction } = await import("@/app/(dashboard)/admin/users/actions");
const { createRoleAction, setRolePermissionAction } = await import("@/app/(dashboard)/admin/roles/actions");
const { saveEmployeeAction } = await import("@/app/(dashboard)/employees/actions");

const UUID = "00000000-0000-4000-8000-000000000002";
const employee = {
  employeeCode: "", fullName: "Ali", fullNameUr: "", fatherName: "", cnic: "", phone: "", whatsapp: "", email: "",
  address: "", department: "", jobTitle: "", hireDate: "", status: "active", emergencyContact: "", notes: "", salary: "",
};

beforeEach(() => vi.clearAllMocks());

describe("user administration actions", () => {
  it.each([[["employees.manage"]], [["users.view"]], [[]]])("refuse a caller with %j and never use the secret key", async (perms) => {
    current = fakeSupabase(perms);
    const results = await Promise.all([
      inviteUserAction({ email: "a@b.co", fullName: "A", roleId: UUID, employeeId: "" }),
      setUserStatusAction({ userId: UUID, status: "suspended", roleId: "" }),
      assignRoleAction(UUID, UUID),
      createRoleAction({ code: "x_role", nameEn: "X", nameUr: "X", description: "" }),
      setRolePermissionAction(UUID, "costs.view", true),
    ]);
    for (const r of results) expect(r).toEqual({ ok: false, code: "permissionDenied" });
    expect(adminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(adminClient.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(current.touched.rpcs).toEqual([]);
    expect(current.touched.tables).toEqual([]);
  });

  it("validates input on the server even for administrators", async () => {
    current = fakeSupabase(["users.manage"]);
    const r = await inviteUserAction({ email: "not-an-email", fullName: "", roleId: "x", employeeId: "" });
    expect(r).toMatchObject({ ok: false, code: "validation" });
    expect(adminClient.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("refuses to change the caller's own access", async () => {
    current = fakeSupabase(["users.manage"]);
    const r = await setUserStatusAction({ userId: "00000000-0000-4000-8000-000000000001", status: "suspended", roleId: "" });
    expect(r).toMatchObject({ ok: false, code: "rule" });
    expect(current.touched.rpcs).toEqual([]);
  });
});

describe("employee actions", () => {
  it("refuse callers without employees.manage", async () => {
    current = fakeSupabase(["employees.view"]);
    expect(await saveEmployeeAction(null, employee)).toEqual({ ok: false, code: "permissionDenied" });
    expect(current.touched.tables).toEqual([]);
  });

  it("refuse setting a salary without payroll.manage", async () => {
    current = fakeSupabase(["employees.manage"]);
    expect(await saveEmployeeAction(null, { ...employee, salary: "50000" })).toEqual({ ok: false, code: "permissionDenied" });
    expect(current.touched.tables).toEqual([]);
  });

  it("save an employee and salary for a payroll manager", async () => {
    current = fakeSupabase(["employees.manage", "payroll.manage"]);
    expect(await saveEmployeeAction(null, { ...employee, salary: "50000.50" })).toMatchObject({ ok: true });
    expect(current.touched.tables).toEqual(["employees", "employee_salaries"]);
  });
});
