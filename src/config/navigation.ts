import {
  Banknote, BarChart3, Boxes, Building2, ClipboardList, CreditCard, Factory, HandCoins, History, Landmark, LayoutDashboard,
  Package, Receipt, ScrollText, Settings, ShieldCheck, ShoppingCart, Truck, UserCheck, UserCog, Users, Wallet, Warehouse, Waypoints,
  type LucideIcon,
} from "lucide-react";
import type { Dictionary } from "@/i18n";
import { FLOW_ACCESS } from "@/features/purchasing/flow";
import type { Permission } from "@/lib/auth/permissions";

export type NavGroupKey = keyof Dictionary["nav"]["groups"];

export interface NavItem {
  href: string;
  label: (t: Dictionary) => string;
  icon: LucideIcon;
  /** Any one of these shows the item. */
  permission: Permission | readonly Permission[];
  /** No screen exists yet: the route renders the planned-module page. Remove when the module is built. */
  planned?: true;
}

export interface NavGroup {
  key: NavGroupKey;
  items: NavItem[];
}

/**
 * The single source for the sidebar, the search palette, breadcrumbs and the
 * planned-module route. Items are shown only to users holding a listed `permission`.
 */
export const NAVIGATION: NavGroup[] = [
  {
    key: "overview",
    items: [{ href: "/dashboard", label: (t) => t.nav.dashboard, icon: LayoutDashboard, permission: "dashboard.view" }],
  },
  {
    key: "sales",
    items: [
      { href: "/sales", label: (t) => t.modules.sales, icon: ShoppingCart, permission: ["sales.view", "sales.view_all"] },
      { href: "/customers", label: (t) => t.modules.customers, icon: Building2, permission: "customers.view" },
      { href: "/order-takers", label: (t) => t.takers.title, icon: UserCheck, permission: ["sales.team", "sales.view_all"] },
      { href: "/receivables", label: (t) => t.modules.receivables, icon: HandCoins, permission: ["receivables.view", "receivables.collect", "receivables.post", "receivables.adjust"] },
    ],
  },
  {
    key: "procurement",
    items: [
      { href: "/purchasing/company", label: (t) => t.purchasing.flows.company, icon: Factory, permission: FLOW_ACCESS.company },
      { href: "/purchasing/suppliers", label: (t) => t.purchasing.flows.suppliers, icon: Receipt, permission: FLOW_ACCESS.suppliers },
      { href: "/suppliers", label: (t) => t.modules.suppliers, icon: ClipboardList, permission: "suppliers.view" },
      { href: "/payables", label: (t) => t.modules.payables, icon: CreditCard, permission: ["payables.view", "company.view"] },
    ],
  },
  {
    key: "stock",
    items: [
      { href: "/products", label: (t) => t.modules.products, icon: Package, permission: "products.view" },
      { href: "/warehouses", label: (t) => t.modules.warehouses, icon: Warehouse, permission: "warehouses.view" },
      { href: "/inventory", label: (t) => t.modules.inventory, icon: Boxes, permission: ["inventory.view", "sales.dispatch"] },
    ],
  },
  {
    key: "sol",
    items: [
      { href: "/sol", label: (t) => t.modules.sol, icon: Waypoints, permission: ["sol.view", "sol.manage"] },
      { href: "/vehicles", label: (t) => t.modules.vehicles, icon: Truck, permission: "vehicles.view" },
    ],
  },
  {
    key: "finance",
    items: [
      { href: "/cash-bank", label: (t) => t.modules.cash_bank, icon: Landmark, permission: ["cash_bank.view", "cash_bank.close", "accounting.view"] },
      { href: "/expenses", label: (t) => t.modules.expenses, icon: Wallet, permission: ["expenses.view", "expenses.create", "expenses.post"] },
      { href: "/accounting", label: (t) => t.modules.accounting, icon: ScrollText, permission: ["accounting.view", "reports.financial", "accounting.close"] },
    ],
  },
  {
    key: "people",
    items: [
      { href: "/employees", label: (t) => t.nav.employees, icon: Users, permission: "employees.view" },
      { href: "/payroll", label: (t) => t.modules.salaries, icon: Banknote, permission: "payroll.view" },
    ],
  },
  {
    key: "insights",
    items: [{ href: "/reports", label: (t) => t.modules.reports, icon: BarChart3, permission: "reports.view" }],
  },
  {
    key: "administration",
    items: [
      { href: "/admin/users", label: (t) => t.nav.users, icon: UserCog, permission: "users.view" },
      { href: "/admin/roles", label: (t) => t.nav.roles, icon: ShieldCheck, permission: "users.view" },
      { href: "/admin/audit", label: (t) => t.nav.accessHistory, icon: History, permission: "audit.view" },
      { href: "/settings", label: (t) => t.modules.settings, icon: Settings, permission: "settings.manage" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAVIGATION.flatMap((group) => group.items);

export const itemPermissions = (item: NavItem): readonly Permission[] => (typeof item.permission === "string" ? [item.permission] : item.permission);

export function visibleNavigation(permissions: ReadonlySet<string>): NavGroup[] {
  return NAVIGATION.map((group) => ({ ...group, items: group.items.filter((item) => itemPermissions(item).some((p) => permissions.has(p))) }))
    .filter((group) => group.items.length > 0);
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
