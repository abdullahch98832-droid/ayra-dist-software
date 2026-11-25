import { ArrowLeftRight, ClipboardCheck, HandCoins, PackagePlus, Phone, ShoppingCart, Truck, UserPlus, Wallet, type LucideIcon } from "lucide-react";
import { NAV_ITEMS } from "@/config/navigation";
import type { Dictionary } from "@/i18n";
import type { Permission } from "@/lib/auth/permissions";

export interface QuickAction { key: keyof Dictionary["dashboard"]["quick"]; href: string; module: string; icon: LucideIcon; permission: Permission }

// `module` decides whether the action is open: it stays disabled while the module is planned.
const ACTIONS: QuickAction[] = [
  { key: "salesOrder", href: "/sales/orders/new", module: "/sales", icon: ShoppingCart, permission: "sales.create" },
  { key: "distributorOrder", href: "/sol/orders/new", module: "/sol", icon: Phone, permission: "sol.manage" },
  { key: "goodsReceipt", href: "/purchasing/company/receipts/new", module: "/purchasing/company", icon: PackagePlus, permission: "purchasing.create" },
  { key: "collection", href: "/receivables/payments/new", module: "/receivables", icon: HandCoins, permission: "receivables.collect" },
  { key: "expense", href: "/expenses/new", module: "/expenses", icon: Wallet, permission: "expenses.create" },
  { key: "stockCount", href: "/inventory/counts/new", module: "/inventory", icon: ClipboardCheck, permission: "inventory.count" },
  { key: "stockTransfer", href: "/inventory/transfers/new", module: "/inventory", icon: ArrowLeftRight, permission: "inventory.transfer" },
  { key: "delivery", href: "/inventory/dispatch", module: "/inventory", icon: Truck, permission: "sales.dispatch" },
  { key: "employee", href: "/employees/new", module: "/employees", icon: UserPlus, permission: "employees.manage" },
];

export const isPlanned = (action: QuickAction) => NAV_ITEMS.find((i) => i.href === action.module)?.planned === true;

export const quickActions = (permissions: ReadonlySet<string>) => ACTIONS.filter((a) => permissions.has(a.permission));
