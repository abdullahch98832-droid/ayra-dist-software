import { OTHER_VENDORS } from "@/config/vendors";
import {
  Banknote, Boxes, Factory, HandCoins, Landmark, PackageCheck, ReceiptText, ScrollText, ShoppingCart, Waypoints, type LucideIcon,
} from "lucide-react";
import type { DashboardKind } from "@/features/dashboard/layout";
import type { Position } from "@/features/dashboard/schema";
import { fill, isolate } from "@/i18n/format";
import type { Dictionary } from "@/i18n";
import { formatPaisa, toPaisa } from "@/lib/utils/money";
import type { Locale } from "@/types";
import { Ltr } from "@/components/shared/bidi";
import { formatNumber } from "@/components/shared/format";
import { StatGrid } from "@/components/shared/stat-grid";
import { StatCard } from "@/components/shared/stat-card";

interface Card { key: string; label: string; value: React.ReactNode; icon: LucideIcon; hint?: React.ReactNode; tone?: "default" | "attention" }

/** Goods and today's trade come first, then the money. */
const ACTIVITY = new Set(["stock", "value", "sales", "purchases"]);

/** Balances now and today's activity. Only figures present in `position` are shown. */
export function PositionCards({ position, kind, t, locale }: { position: Position; kind: DashboardKind; t: Dictionary; locale: Locale }) {
  const f = t.dashboard.figures;
  const rs = (amount: string) => formatPaisa(toPaisa(amount), locale);
  const money = (amount: string) => <Ltr>{rs(amount)}</Ltr>;
  const n = (value: string | number) => formatNumber(typeof value === "number" ? value : BigInt(value), locale);
  const cards: Card[] = [];

  if (position.stock) {
    const { units, products } = position.stock;
    const damaged = units.filter((u) => u.damaged !== "0");
    const unitName = (u: (typeof units)[number]) => (locale === "ur" ? u.name_ur : u.name_en);
    cards.push({
      key: "stock", label: f.stock, icon: Boxes,
      value: units.length === 0 ? n(0) : (
        <span className="flex flex-wrap items-baseline gap-x-3">
          {units.slice(0, 3).map((u) => (
            <span key={u.name_en}><Ltr>{n(u.on_hand)}</Ltr> <span className="text-sm font-normal text-muted-foreground">{unitName(u)}</span></span>
          ))}
        </span>
      ),
      hint: (
        <>
          {fill(f.stockHint, { products: n(products) })}
          {damaged.length > 0 && <> · {fill(f.stockDamaged, { quantity: damaged.map((u) => `${n(u.damaged)} ${unitName(u)}`).join(", ") })}</>}
        </>
      ),
    });
  }
  if (position.inventory_value) cards.push({ key: "value", label: f.inventoryValue, value: money(position.inventory_value), icon: PackageCheck, hint: f.inventoryValueHint });
  const sales = position.today_sales;
  // Data entry works with orders, not with the company's sales total.
  if (sales && (kind !== "entry" || sales.scope === "own")) {
    cards.push({
      key: "sales", label: sales.scope === "own" ? f.todaySalesOwn : f.todaySales, value: money(sales.net), icon: ShoppingCart,
      hint: (
        <>
          {fill(f.todaySalesHint, { count: n(sales.invoices) })}
          {toPaisa(sales.returns) !== BigInt(0) && <> · {fill(f.todaySalesReturns, { amount: isolate(rs(sales.returns)) })}</>}
        </>
      ),
    });
  }
  if (position.today_purchases) {
    cards.push({
      key: "purchases", label: f.todayPurchases, value: money(position.today_purchases.total), icon: ReceiptText,
      hint: fill(f.todayPurchasesHint, { count: n(position.today_purchases.receipts) }),
    });
  }
  if (position.cash) cards.push({ key: "cash", label: f.cash, value: money(position.cash), icon: Banknote });
  if (position.bank) cards.push({ key: "bank", label: f.bank, value: money(position.bank), icon: Landmark });
  if (position.receivables) cards.push({ key: "receivables", label: f.receivables, value: money(position.receivables), icon: HandCoins, hint: f.receivablesHint });
  // Money owed is never hidden, whether vendors are used or not.
  if (position.supplier_payables && (OTHER_VENDORS || toPaisa(position.supplier_payables) !== BigInt(0))) cards.push({ key: "payables", label: f.supplierPayables, value: money(position.supplier_payables), icon: ScrollText, hint: f.supplierPayablesHint });
  if (position.company_outstanding) cards.push({ key: "company", label: f.companyOutstanding, value: money(position.company_outstanding), icon: Factory, hint: f.companyOutstandingHint });
  if (position.sol_pending) {
    cards.push({
      key: "sol", label: f.solPending, value: money(position.sol_pending.amount), icon: Waypoints,
      hint: fill(f.solPendingHint, { count: n(position.sol_pending.jobs) }),
      tone: position.sol_pending.jobs > 0 ? "attention" : "default",
    });
  }
  if (cards.length === 0) return null;
  return (
    <div className="grid gap-4">
      {[cards.filter((c) => ACTIVITY.has(c.key)), cards.filter((c) => !ACTIVITY.has(c.key))].filter((group) => group.length > 0).map((group) => (
        <StatGrid key={group[0]?.key}>
          {group.map(({ key, ...card }) => <StatCard key={key} {...card} />)}
        </StatGrid>
      ))}
    </div>
  );
}

/** False when the user may see none of the balances, so the whole section is left out. */
export function hasPosition(permissions: ReadonlySet<string>, kind: DashboardKind): boolean {
  return ["inventory.view", "costs.view", "purchasing.view", "cash_bank.view", "receivables.view", "payables.view", "company.view"].some((p) => permissions.has(p))
    || (permissions.has("sales.view_all") ? kind !== "entry" : permissions.has("sales.view") && permissions.has("sales.create"));
}
