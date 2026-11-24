import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";

/** One page of a counted query. A page past the end is empty, not an error. */
export async function listPage<T>(query: PromiseLike<{ data: T[] | null; error: PostgrestError | null; count: number | null }>): Promise<{ rows: T[]; total: number }> {
  const { data, error, count } = await query;
  if (error?.code === "PGRST103") return { rows: [], total: 0 };
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}
