import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, TEST_USER_ID } from "@/test/fake-supabase";

type Result = { data: unknown; error: unknown };
let profile: Result;
let permissions: Result;
let claims: unknown;

vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: (fn: unknown) => fn }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/supabase/env", () => ({ getSupabasePublicEnv: () => ({ url: "http://x", publishableKey: "k" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const { client } = fakeSupabase([]);
    client.auth.getClaims = vi.fn(async () => ({ data: claims ? { claims } : null, error: null })) as never;
    client.rpc = vi.fn(async () => permissions) as never;
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => profile };
    client.from = vi.fn(() => chain) as never;
    return client;
  },
}));

const { getSessionContext, requireActiveSession } = await import("./session");
const denied = { data: null, error: { code: "42501", message: "permission denied for table profiles" } };

beforeEach(() => {
  claims = { sub: TEST_USER_ID, email: "a@b.co" };
  permissions = { data: ["dashboard.view", "not.a.permission"], error: null };
  profile = { data: { full_name: "A", is_active: true, removed_at: null, employee_id: null, role: { id: "r", code: "x", name_en: "X", name_ur: "X" } }, error: null };
});

describe("session", () => {
  it("loads the profile and keeps only known permissions", async () => {
    const ctx = await requireActiveSession();
    expect([...ctx.permissions]).toEqual(["dashboard.view"]);
  });

  it("sends a signed-out visitor to the login page", async () => {
    claims = null;
    await expect(requireActiveSession()).rejects.toThrow("redirect:/login");
  });

  it("reports a refused database read instead of redirecting to login (which would loop)", async () => {
    profile = denied;
    await expect(requireActiveSession()).rejects.toMatchObject({ code: "42501" });
    profile = { data: null, error: null };
    permissions = denied;
    await expect(getSessionContext()).rejects.toMatchObject({ code: "42501" });
  });

  it("sends a signed-in user without a profile to the no-access page, never back to login", async () => {
    profile = { data: null, error: null };
    await expect(requireActiveSession()).rejects.toThrow("redirect:/no-access");
  });
});
