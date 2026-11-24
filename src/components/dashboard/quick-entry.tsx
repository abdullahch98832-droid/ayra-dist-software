import Link from "next/link";
import { ArrowLeftRight, ClipboardCheck, HandCoins, PackagePlus, ShoppingCart, Truck, UserPlus, Wallet, type LucideIcon } from "lucide-react";
import { NAV_ITEMS } from "@/config/navigation";
import type { Dictionary } from "@/i18n";
import type { Permission } from "@/lib/auth/permissions";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";

interface QuickAction { key: keyof Dictionary["dashboard"]["quick"]; href: string; module: string; icon: LucideIcon; permission: Permission }

// `module` decides whether the action is open: it stays disabled while the module is planned.
const ACTIONS: QuickAction[] = [
  { key: "salesOrder", href: "/sales/orders/new", module: "/sales", icon: ShoppingCart, permission: "sales.create" },
  { key: "goodsReceipt", href: "/purchasing/company/receipts/new", module: "/purchasing/company", icon: PackagePlus, permission: "purchasing.create" },
  { key: "collection", href: "/receivables/payments/new", module: "/receivables", icon: HandCoins, permission: "receivables.collect" },
  { key: "expense", href: "/expenses/new", module: "/expenses", icon: Wallet, permission: "expenses.create" },
  { key: "stockCount", href: "/inventory/counts/new", module: "/inventory", icon: ClipboardCheck, permission: "inventory.count" },
  { key: "stockTransfer", href: "/inventory/transfers/new", module: "/inventory", icon: ArrowLeftRight, permission: "inventory.transfer" },
  { key: "delivery", href: "/inventory/dispatch", module: "/inventory", icon: Truck, permission: "sales.dispatch" },
  { key: "employee", href: "/employees/new", module: "/employees", icon: UserPlus, permission: "employees.manage" },
];

export function QuickEntry({ permissions, t }: { permissions: ReadonlySet<string>; t: Dictionary }) {
  const actions = ACTIONS.filter((a) => permissions.has(a.permission));
  if (actions.length === 0) return null;
  return (
    <SectionCard title={t.dashboard.work.quick} description={t.dashboard.work.quickHint}>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((a) => {
          const planned = NAV_ITEMS.find((i) => i.href === a.module)?.planned === true;
          const body = (
            <>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><a.icon className="size-5" aria-hidden /></span>
              <span className="min-w-0 flex-1 text-sm font-medium">{t.dashboard.quick[a.key]}</span>
              {planned && <StatusBadge tone="gray" dot={false}>{t.nav.planned}</StatusBadge>}
            </>
          );
          const classes = "flex items-center gap-3 rounded-lg border px-3 py-3";
          return (
            <li key={a.key}>
              {planned
                ? <div className={`${classes} bg-muted/40 text-muted-foreground`}>{body}</div>
                : <Link href={a.href} className={`${classes} transition-colors outline-none hover:border-primary/40 hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/40`}>{body}</Link>}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
