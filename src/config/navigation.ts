import {
  Banknote, BarChart3, Boxes, Building2, ClipboardList, CreditCard, Factory, HandCoins, History, Landmark, LayoutDashboard,
  Package, Receipt, ScrollText, Settings, ShieldCheck, ShoppingCart, Truck, UserCog, Users, Wallet, Warehouse, Waypoints,
  type LucideIcon,
} from "lucide-react";
import type { Dictionary } from "@/i18n";
import type { Permission } from "@/lib/auth/permissions";

export type NavGroupKey = keyof Dictionary["nav"]["groups"];

export interface NavItem {
  href: string;
  label: (t: Dictionary) => string;
  icon: LucideIcon;
  permission: Permission;
  /** No screen exists yet: the route renders the planned-module page. Remove when the module is built. */
  planned?: true;
}

export interface NavGroup {
  key: NavGroupKey;
  items: NavItem[];
}

/**
 * The single source for the sidebar, the search palette, breadcrumbs and the
 * planned-module route. Items are shown only to users holding `permission`.
 */
export const NAVIGATION: NavGroup[] = [
  {
    key: "overview",
    items: [{ href: "/dashboard", label: (t) => t.nav.dashboard, icon: LayoutDashboard, permission: "dashboard.view" }],
  },
  {
    key: "sales",
    items: [
      { href: "/customers", label: (t) => t.modules.customers, icon: Building2, permission: "customers.view", planned: true },
      { href: "/sales", label: (t) => t.modules.sales, icon: ShoppingCart, permission: "sales.view", planned: true },
      { href: "/receivables", label: (t) => t.modules.receivables, icon: HandCoins, permission: "receivables.view", planned: true },
    ],
  },
  {
    key: "procurement",
    items: [
      { href: "/company", label: (t) => t.modules.company, icon: Factory, permission: "company.view", planned: true },
      { href: "/suppliers", label: (t) => t.modules.suppliers, icon: ClipboardList, permission: "suppliers.view", planned: true },
      { href: "/purchasing", label: (t) => t.modules.purchasing, icon: Receipt, permission: "purchasing.view", planned: true },
      { href: "/payables", label: (t) => t.modules.payables, icon: CreditCard, permission: "payables.view", planned: true },
    ],
  },
  {
    key: "stock",
    items: [
      { href: "/products", label: (t) => t.modules.products, icon: Package, permission: "products.view", planned: true },
      { href: "/warehouses", label: (t) => t.modules.warehouses, icon: Warehouse, permission: "warehouses.view", planned: true },
      { href: "/inventory", label: (t) => t.modules.inventory, icon: Boxes, permission: "inventory.view", planned: true },
    ],
  },
  {
    key: "sol",
    items: [
      { href: "/sol", label: (t) => t.modules.sol, icon: Waypoints, permission: "sol.view", planned: true },
      { href: "/vehicles", label: (t) => t.modules.vehicles, icon: Truck, permission: "vehicles.view", planned: true },
    ],
  },
  {
    key: "finance",
    items: [
      { href: "/cash-bank", label: (t) => t.modules.cash_bank, icon: Landmark, permission: "cash_bank.view", planned: true },
      { href: "/expenses", label: (t) => t.modules.expenses, icon: Wallet, permission: "expenses.view", planned: true },
      { href: "/accounting", label: (t) => t.modules.accounting, icon: ScrollText, permission: "accounting.view", planned: true },
    ],
  },
  {
    key: "people",
    items: [
      { href: "/employees", label: (t) => t.nav.employees, icon: Users, permission: "employees.view" },
      { href: "/payroll", label: (t) => t.modules.salaries, icon: Banknote, permission: "payroll.view", planned: true },
    ],
  },
  {
    key: "insights",
    items: [{ href: "/reports", label: (t) => t.modules.reports, icon: BarChart3, permission: "reports.view", planned: true }],
  },
  {
    key: "administration",
    items: [
      { href: "/admin/users", label: (t) => t.nav.users, icon: UserCog, permission: "users.view" },
      { href: "/admin/roles", label: (t) => t.nav.roles, icon: ShieldCheck, permission: "users.view" },
      { href: "/admin/audit", label: (t) => t.nav.accessHistory, icon: History, permission: "audit.view" },
      { href: "/settings", label: (t) => t.modules.settings, icon: Settings, permission: "settings.manage", planned: true },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAVIGATION.flatMap((group) => group.items);

export function visibleNavigation(permissions: ReadonlySet<string>): NavGroup[] {
  return NAVIGATION.map((group) => ({ ...group, items: group.items.filter((item) => permissions.has(item.permission)) }))
    .filter((group) => group.items.length > 0);
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
