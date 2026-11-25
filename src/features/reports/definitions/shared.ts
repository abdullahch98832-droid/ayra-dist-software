import "server-only";
import { bi, biKey, name } from "@/features/documents/format";
import { OTHER_VENDORS } from "@/config/vendors";
import type { Dictionary } from "@/i18n";
import type { Bi, Value } from "@/lib/pdf/model";
import { can, type SessionContext } from "@/lib/auth/session";
import { loadTakers } from "@/features/takers/queries";
import { loadCategories } from "@/features/inventory/queries";
import { loadWarehouseChoices } from "@/features/catalog/queries";
import { loadSupplierChoices } from "../queries";
import type { ColumnKind, ReportCheck, ReportColumn, ReportFilter, ReportInput } from "../model";
import { sumOf, ZERO } from "../values";
import type { Paisa } from "@/lib/utils/money";

export { bi, biKey, can, name, sumOf, ZERO };
export type { Bi, Paisa, ReportCheck, ReportFilter, ReportInput, Value };

type Pick = (t: Dictionary) => string;
export const col = (key: string, label: Pick, kind: ColumnKind, extra: Partial<ReportColumn> = {}): ReportColumn => ({ key, label: bi(label), kind, ...extra });
/** Columns a user may see. */
export const when = <T,>(condition: boolean, ...items: T[]): T[] => (condition ? items : []);
export const lg = { hideBelow: "lg" } as const;
export const xl = { hideBelow: "xl" } as const;
export const xxl = { hideBelow: "2xl" } as const;
export const total = { total: true } as const;

export const title = (key: keyof Dictionary["analytics"]["titles"]): Bi => bi((t) => t.analytics.titles[key]);
export const hint = (key: keyof Dictionary["analytics"]["hints"]): Bi => bi((t) => t.analytics.hints[key]);
export const reversal = (is: boolean): Bi | null => (is ? bi((t) => t.accounting.reversal) : null);
export const optional = (en: string | null | undefined, ur: string | null | undefined): Value | null => (en ? name(en, ur) : null);

export const seesAllSales = (ctx: SessionContext) => can(ctx, "sales.view_all");
/** Whole days from one date to another. */
export const daysFrom = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

// --- filters -----------------------------------------------------------------------------------------------------------

export const takerFilter = async (): Promise<ReportFilter[]> => [{ param: "taker", label: bi((t) => t.customers.orderTaker), all: bi((t) => t.customers.allOrderTakers), options: (await loadTakers()).map((x) => ({ value: x.id, label: name(x.nameEn, x.nameUr) })) }];
export const categoryFilter = async (): Promise<ReportFilter[]> => {
  const list = await loadCategories();
  return list.length ? [{ param: "category", label: bi((t) => t.catalog.category), all: bi((t) => t.stock.allStock), options: list.map((c) => ({ value: c.id, label: name(c.name_en, c.name_ur) })) }] : [];
};
export const warehouseFilter = async (): Promise<ReportFilter[]> => [{ param: "warehouse", label: bi((t) => t.documents.warehouse), all: bi((t) => t.stock.allWarehouses), options: (await loadWarehouseChoices()).map((x) => ({ value: x.id, label: name(x.nameEn, x.nameUr) })) }];
export const supplierFilter = async (ctx: SessionContext): Promise<ReportFilter[]> => {
  const list = OTHER_VENDORS && can(ctx, "suppliers.view") ? await loadSupplierChoices() : [];
  return list.length ? [{ param: "supplier", label: bi((t) => t.documents.supplier), all: bi((t) => t.documents.allSuppliers), options: list.map((s) => ({ value: s.id, label: name(s.name, s.name_ur) })) }] : [];
};
export const sourceFilters = (): ReportFilter[] => (OTHER_VENDORS ? [sourceFilter()] : []);
const sourceFilter = (): ReportFilter => ({ param: "source", label: bi((t) => t.analytics.source), all: bi((t) => t.reports.allSources), options: [{ value: "company", label: bi((t) => t.reports.company) }, { value: "external", label: bi((t) => t.reports.external) }] });
export const principalOf = (value: string | null) => (value === "company" ? true : value === "external" ? false : null);
/** Both sides of the payables, as far as the user sees them. */
/** Group of reports on purchases from anyone: with Ayra alone they belong to Ayra. */
export const PURCHASE_GROUP = OTHER_VENDORS ? ("suppliers" as const) : ("company" as const);
export const payableKeys = (ctx: SessionContext) => [...when(can(ctx, "company.view"), "AP_PRINCIPAL"), ...when(can(ctx, "payables.view"), "AP_SUPPLIERS")];
