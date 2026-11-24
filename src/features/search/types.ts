export interface SearchHit {
  id: string;
  title: string;
  titleUr: string | null;
  detail: string;
  href: string;
}

export const SEARCH_GROUPS = ["customers", "orders", "solJobs", "vehicles", "products", "suppliers", "employees"] as const;
export type SearchGroup = (typeof SEARCH_GROUPS)[number];
export type SearchHits = Record<SearchGroup, SearchHit[]>;
export type SearchResult = { ok: true; hits: SearchHits } | { ok: false };
