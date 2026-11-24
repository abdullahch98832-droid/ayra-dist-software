import type { Permission } from "@/lib/auth/permissions";

export type DashboardKind = "executive" | "manager" | "entry" | "viewer";

const ENTRY: Permission[] = [
  "sales.create", "sales.dispatch", "purchasing.create", "receivables.collect", "expenses.create", "inventory.count", "inventory.transfer",
];

/**
 * Which dashboard a user gets. System roles have their own; custom roles get the one that
 * fits what they are allowed to do. This only arranges the page: every figure is checked
 * again in the database.
 */
export function dashboardKind(roleCode: string | undefined, permissions: ReadonlySet<string>): DashboardKind {
  switch (roleCode) {
    case "super_admin": return "executive";
    case "manager": return "manager";
    case "data_entry": return "entry";
    case "viewer": return "viewer";
  }
  if (permissions.has("reports.financial")) return "manager";
  return ENTRY.some((p) => permissions.has(p)) ? "entry" : "viewer";
}
