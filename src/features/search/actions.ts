"use server";

import { z } from "zod";
import { can, getSessionContext } from "@/lib/auth/session";
import { likeTerm } from "@/lib/supabase/like-term";
import { createClient } from "@/lib/supabase/server";

export interface SearchHit {
  id: string;
  title: string;
  titleUr: string | null;
  detail: string;
  href: string;
}

export type SearchResult = { ok: true; employees: SearchHit[] } | { ok: false };

const querySchema = z.string().trim().min(2).max(80);

/**
 * Global record search. Several permissions are involved, so each source is checked
 * on its own and skipped when missing; RLS applies to every query as well.
 */
export async function searchRecordsAction(input: unknown): Promise<SearchResult> {
  const ctx = await getSessionContext();
  if (!ctx?.isActive) return { ok: false };
  const parsed = querySchema.safeParse(input);
  const term = parsed.success ? likeTerm(parsed.data) : "";
  if (!term || !can(ctx, "employees.view")) return { ok: true, employees: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, employee_code, full_name, full_name_ur")
    .or(`full_name.ilike.%${term}%,full_name_ur.ilike.%${term}%,employee_code.ilike.%${term}%,phone.ilike.%${term}%`)
    .order("full_name")
    .limit(8);
  if (error) {
    console.error(error);
    return { ok: false };
  }
  return {
    ok: true,
    employees: data.map((e) => ({
      id: e.id, title: e.full_name, titleUr: e.full_name_ur, detail: e.employee_code, href: `/employees/${e.id}`,
    })),
  };
}
