import { vi } from "vitest";

export const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Minimal Supabase client double: a signed-in active user holding `permissions`.
 * Records every table and RPC touched so tests can assert nothing was written.
 */
export function fakeSupabase(permissions: string[]) {
  const touched: { tables: string[]; rpcs: string[] } = { tables: [], rpcs: [] };
  const chain = (table: string): Record<string, unknown> => {
    const result = table === "profiles"
      ? { data: { full_name: "Test", is_active: true, removed_at: null, employee_id: null, role: { id: "r", code: "x", name_en: "X", name_ur: "X" } }, error: null }
      : { data: [{ id: "00000000-0000-4000-8000-000000000099" }], error: null };
    const proxy: Record<string, unknown> = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === "then") return (resolve: (v: unknown) => unknown) => resolve(result);
        if (prop === "maybeSingle" || prop === "single") return async () => result;
        return () => proxy;
      },
    });
    return proxy;
  };
  const client = {
    auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: TEST_USER_ID, email: "test@example.com" } }, error: null })) },
    rpc: vi.fn(async (fn: string) => {
      if (fn === "my_permissions") return { data: permissions, error: null };
      touched.rpcs.push(fn);
      return { data: null, error: null };
    }),
    from: vi.fn((table: string) => {
      if (table !== "profiles") touched.tables.push(table);
      return chain(table);
    }),
    storage: { from: vi.fn(() => { touched.tables.push("storage"); return {}; }) },
  };
  return { client, touched };
}
