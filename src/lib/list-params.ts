import { z } from "zod";
import { likeTerm } from "@/lib/supabase/like-term";

export const LIST_PAGE = 50;
const MAX_PAGE = 100_000;

export type SearchParams = Record<string, string | string[] | undefined>;
export interface ListFilter {
  q: string;
  status: string;
  page: number;
  supplierId: string | null;
}

/** Search, status, supplier and page of a list, from its address. Anything invalid is ignored. */
export function listParams(query: SearchParams, statuses: readonly string[]): ListFilter {
  const text = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");
  const page = Number.parseInt(text(query.page), 10);
  const supplier = z.uuid().safeParse(query.supplier);
  return {
    q: likeTerm(text(query.q).slice(0, 80)),
    status: statuses.includes(text(query.status)) ? text(query.status) : "",
    page: Number.isFinite(page) ? Math.min(Math.max(page, 1), MAX_PAGE) : 1,
    supplierId: supplier.success ? supplier.data : null,
  };
}

export const firstRow = (page: number) => (page - 1) * LIST_PAGE;
export const lastRow = (page: number) => page * LIST_PAGE - 1;
