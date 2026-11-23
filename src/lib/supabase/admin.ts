import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { requireSupabasePublicEnv } from "./env";

/**
 * Secret-key client: bypasses RLS. Use only for Supabase Auth administration
 * (invite, ban) AFTER the caller's permission has been verified.
 */
export function createAdminClient() {
  const { url } = requireSupabasePublicEnv();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error("SUPABASE_SECRET_KEY is not set; user administration is unavailable.");
  }
  return createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
