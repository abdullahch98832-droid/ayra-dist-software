// Opt-in HTTP tests against a real (non-production) Supabase project:
// every role is exercised through the public REST API with its own JWT.
//
//   API_TEST_SUPABASE_URL=... API_TEST_PUBLISHABLE_KEY=... API_TEST_SECRET_KEY=... npm run test:api
//
// The suite creates throwaway users (and deletes them afterwards). It refuses to
// run against the project configured for the application in .env.local.
import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.API_TEST_SUPABASE_URL ?? "";
const publishable = process.env.API_TEST_PUBLISHABLE_KEY ?? "";
const secret = process.env.API_TEST_SECRET_KEY ?? "";
const configured = !!(url && publishable && secret);

if (configured && url === process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("API tests must not run against the application's own Supabase project. Use a separate test project.");
}

type Role = "super_admin" | "manager" | "data_entry" | "viewer";
const ROLES: Role[] = ["super_admin", "manager", "data_entry", "viewer"];
const tokens = {} as Record<Role, string>;
const userIds: string[] = [];
let admin: SupabaseClient;

async function rest(path: string, token: string | null, init: RequestInit = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: publishable,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

describe.skipIf(!configured)("REST API by role", () => {
  beforeAll(async () => {
    admin = createClient(url, secret, { auth: { persistSession: false } });
    for (const role of ROLES) {
      const email = `ayra-api-${role}-${randomUUID().slice(0, 8)}@example.com`;
      const password = randomBytes(24).toString("base64url");
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      userIds.push(data.user.id);
      const { data: roleRow } = await admin.from("roles").select("id").eq("code", role).single();
      const { error: assignError } = await admin.from("profiles").update({ role_id: roleRow!.id }).eq("id", data.user.id);
      if (assignError) throw assignError;
      const client = createClient(url, publishable, { auth: { persistSession: false } });
      const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      tokens[role] = session.session!.access_token;
    }
  }, 60_000);

  afterAll(async () => {
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  });

  it("denies anonymous requests", async () => {
    const r = await rest("customers?select=id", null);
    expect(r.status).toBeGreaterThanOrEqual(401);
  });

  it.each([
    ["super_admin", true], ["manager", true], ["data_entry", false], ["viewer", false],
  ] as const)("%s sees confidential tables: %s", async (role, allowed) => {
    for (const table of ["employee_salaries", "financial_account_bank_details", "inventory_valuation", "secure_sales_invoice_costs"]) {
      const r = await rest(`${table}?select=*&limit=1`, tokens[role]);
      expect(r.status).toBe(200);
      if (!allowed) expect(r.body).toEqual([]);
    }
  });

  it("rejects hidden cost columns for every role", async () => {
    for (const role of ROLES) {
      const r = await rest("sales_invoices?select=cost_total&limit=1", tokens[role]);
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.body?.code).toBe("42501");
    }
  });

  it("restricts financial reports and user administration", async () => {
    for (const role of ["data_entry", "viewer"] as const) {
      expect((await rest("rpc/trial_balance", tokens[role], { method: "POST", body: JSON.stringify({ p_as_of: "2099-12-31" }) })).status).toBeGreaterThanOrEqual(400);
    }
    for (const role of ["manager", "data_entry", "viewer"] as const) {
      expect((await rest("rpc/admin_list_users", tokens[role], { method: "POST", body: "{}" })).status).toBeGreaterThanOrEqual(400);
    }
    expect((await rest("rpc/admin_list_users", tokens.super_admin, { method: "POST", body: "{}" })).status).toBe(200);
  });

  it("does not expose first-admin provisioning to signed-in users", async () => {
    const r = await rest("rpc/bootstrap_super_admin", tokens.super_admin, { method: "POST", body: JSON.stringify({ p_email: "x@example.com" }) });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it("keeps viewers read-only", async () => {
    const r = await rest("customers", tokens.viewer, { method: "POST", body: JSON.stringify({ code: `API-${Date.now()}`, name: "x" }) });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it("prevents users from granting themselves a role", async () => {
    const { data: role } = await admin.from("roles").select("id").eq("code", "super_admin").single();
    const me = JSON.parse(Buffer.from(tokens.viewer.split(".")[1]!, "base64url").toString()).sub;
    const r = await rest(`profiles?id=eq.${me}`, tokens.viewer, { method: "PATCH", body: JSON.stringify({ role_id: role!.id }) });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});
