import { BadgePercent, Banknote, Boxes, CalendarDays, CalendarRange, HandCoins, History, Package, PackageMinus, PackageX, Receipt, Store, Truck, UserCheck, Route, Users, Waypoints, type LucideIcon } from "lucide-react";
import type { Dictionary } from "@/i18n";
import type { Permission } from "@/lib/auth/permissions";

type ReportText = { [K in keyof Dictionary["reports"]]: Dictionary["reports"][K] extends string ? K : never }[keyof Dictionary["reports"]];

export interface ReportDefinition {
  slug: string;
  title: ReportText;
  hint: ReportText;
  icon: LucideIcon;
  /** Any one of these opens the report; the database checks again. */
  permissions: Permission[];
}

export const REPORTS = {
  dailySales: { slug: "daily-sales", title: "dailySales", hint: "dailySalesHint", icon: CalendarDays, permissions: ["sales.view", "sales.view_all"] },
  monthlySales: { slug: "monthly-sales", title: "monthlySales", hint: "monthlySalesHint", icon: CalendarRange, permissions: ["sales.view", "sales.view_all"] },
  customerSales: { slug: "customer-sales", title: "customerSales", hint: "customerSalesHint", icon: Store, permissions: ["sales.view", "sales.view_all"] },
  productSales: { slug: "product-sales", title: "productSales", hint: "productSalesHint", icon: Package, permissions: ["sales.view", "sales.view_all"] },
  orderTakers: { slug: "order-takers", title: "orderTakers", hint: "orderTakersHint", icon: UserCheck, permissions: ["sales.view", "sales.view_all"] },
  receivables: { slug: "receivables", title: "receivables", hint: "receivablesHint", icon: HandCoins, permissions: ["receivables.view"] },
  deliveries: { slug: "deliveries", title: "deliveries", hint: "deliveriesHint", icon: Truck, permissions: ["sales.view", "sales.view_all"] },
  collections: { slug: "collections", title: "collections", hint: "collectionsHint", icon: Banknote, permissions: ["receivables.view", "receivables.collect", "receivables.post"] },
  solJobs: { slug: "sol-jobs", title: "solJobs", hint: "solJobsHint", icon: Waypoints, permissions: ["sol.view"] },
  vehicles: { slug: "vehicles", title: "vehicles", hint: "vehiclesHint", icon: Truck, permissions: ["vehicles.view"] },
  vehicleTrips: { slug: "vehicle-trips", title: "vehicleTrips", hint: "vehicleTripsHint", icon: Route, permissions: ["vehicles.view"] },
  stock: { slug: "stock", title: "stock", hint: "stockHint", icon: Boxes, permissions: ["inventory.view"] },
  purchases: { slug: "purchases", title: "purchases", hint: "purchasesHint", icon: Receipt, permissions: ["purchasing.view"] },
  suppliers: { slug: "suppliers", title: "suppliers", hint: "suppliersHint", icon: Users, permissions: ["payables.view", "company.view"] },
  movements: { slug: "movements", title: "movements", hint: "movementsHint", icon: History, permissions: ["inventory.view"] },
  lowStock: { slug: "low-stock", title: "lowStock", hint: "lowStockHint", icon: PackageMinus, permissions: ["inventory.view"] },
  damaged: { slug: "damaged", title: "damaged", hint: "damagedHint", icon: PackageX, permissions: ["inventory.view"] },
  profitability: { slug: "profitability", title: "profitability", hint: "profitabilityHint", icon: BadgePercent, permissions: ["costs.view"] },
} satisfies Record<string, ReportDefinition>;
