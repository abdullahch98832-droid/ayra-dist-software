import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";

const PAGE = 1000; // Supabase returns at most this many rows per request.
const MAX_PAGES = 50;

/** Reads every row of an ordered query, so totals are never calculated from a cut-off list. */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(rows.length, rows.length + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return rows;
  }
  throw new Error("Too many rows to load at once");
}
