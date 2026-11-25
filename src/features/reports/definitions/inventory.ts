import "server-only";
import { Boxes, Flame, History, PackageMinus, PackageX, Scale, Snail, BadgePercent } from "lucide-react";
import { loadProductName, loadReconciliation, loadStock } from "@/features/inventory/queries";
import { OTHER_VENDORS } from "@/config/vendors";
import { getDictionary } from "@/i18n";
import { uuidParam } from "@/lib/page-context";
import { toPaisa } from "@/lib/utils/money";
import { ledgerChecks } from "../checks";
import type { ReportChart, ReportDefinition, ReportRow } from "../model";
import { reportDamaged, reportLowStock, reportMovements, reportProductMovement, reportProfitability } from "../queries";
import { bi, biKey, can, categoryFilter, col, hint, lg, name, optional, sumOf, title, total, warehouseFilter, when, xl, xxl } from "./shared";

const MOVEMENT_TYPES = Object.keys(getDictionary("en").stock.movementTypes);

const product = (x: { product_id: string; name_en: string; name_ur: string | null; sku: string }): ReportRow => ({ id: x.product_id, name: name(x.name_en, x.name_ur), nameHref: `/products/${x.product_id}`, sku: x.sku });
const productColumn = col("name", (t) => t.documents.product, "link", { sub: "sku", subLabel: bi((t) => t.catalog.sku), primary: true });
const unitColumn = col("unit", (t) => t.documents.unit, "text", lg);

const ranking = (rows: Awaited<ReturnType<typeof reportProductMovement>>, key: "top" | "slow"): ReportChart => ({
  key, type: "bars", counts: true, title: bi((t) => t.analytics.charts.leaving), hint: bi((t) => t.analytics.charts.leavingHint), category: bi((t) => t.documents.product),
  series: [{ key: "out", label: bi((t) => t.analytics.quantityOut) }],
  points: rows.slice(0, 10).map((x) => ({ label: { en: x.name_en, ur: x.name_ur ?? x.name_en }, values: [BigInt(x.quantity_out)] })),
});

/** Fast- and slow-moving products are the same list, read from its two ends. */
const movement = (kind: "fast" | "slow"): ReportDefinition => ({
  slug: `${kind}-moving`, group: "inventory", title: title(kind === "fast" ? "fastMoving" : "slowMoving"), hint: hint(kind === "fast" ? "fastMoving" : "slowMoving"), icon: kind === "fast" ? Flame : Snail, permissions: ["inventory.view"], dates: "period",
  filters: categoryFilter,
  async load({ ctx, period, filter }) {
    const all = await reportProductMovement(period, filter("category"));
    const rows = kind === "fast" ? all.filter((x) => x.quantity_out > 0) : all.filter((x) => x.on_hand > 0).toSorted((a, b) => a.quantity_out - b.quantity_out || (a.last_out ?? "").localeCompare(b.last_out ?? "") || b.on_hand - a.on_hand);
    const costs = can(ctx, "costs.view");
    const idle = rows.filter((x) => x.quantity_out <= 0);
    return {
      figures: kind === "fast" ? [] : [
        { key: "idle", label: bi((t) => t.analytics.notMoved), value: { count: idle.length }, icon: Snail, attention: idle.length > 0 },
        ...when(costs, { key: "idleValue", label: bi((t) => t.analytics.notMovedValue), value: { money: sumOf(idle.map((x) => x.stock_value)) }, icon: Boxes }),
      ],
      charts: kind === "fast" && rows.length > 1 ? [ranking(rows, "top")] : [],
      tables: [{
        key: "products", title: title(kind === "fast" ? "fastMoving" : "slowMoving"), search: ["name", "sku", "category"],
        rows: rows.map((x): ReportRow => ({ ...product(x), category: optional(x.category_en, x.category_ur), unit: name(x.unit_en, x.unit_ur), out: x.quantity_out, perDay: x.per_day, sales: x.net_sales, onHand: x.on_hand, cover: x.days_of_cover, value: x.stock_value, last: x.last_out })),
        columns: [
          productColumn, col("category", (t) => t.catalog.category, "text", xxl), unitColumn, col("out", (t) => t.analytics.quantityOut, "quantity"), col("perDay", (t) => t.analytics.perDay, "decimal", lg),
          col("sales", (t) => t.reports.netSales, "money", { ...xl, total: true }), col("onHand", (t) => t.stock.onHand, "quantity"), col("cover", (t) => t.analytics.daysOfCover, "decimal", lg),
          ...when(costs, col("value", (t) => t.stock.value, "money", { ...xl, total: true })), col("last", (t) => t.analytics.lastOut, "date", lg),
        ],
      }],
      notes: [bi((t) => t.analytics.notes.movement)],
    };
  },
});

export const inventoryReports: ReportDefinition[] = [
  {
    slug: "stock", group: "inventory", title: bi((t) => t.reports.stock), hint: bi((t) => t.reports.stockHint), icon: Boxes, permissions: ["inventory.view"], dates: "now",
    filters: async () => [...(await warehouseFilter()), ...(await categoryFilter())],
    async load({ ctx, filter }) {
      const rows = await loadStock(filter("warehouse"), filter("category"));
      const costs = can(ctx, "costs.view");
      return {
        figures: [
          { key: "products", label: bi((t) => t.stock.productsInStock), value: { count: rows.filter((x) => x.on_hand > 0).length }, icon: Boxes },
          { key: "low", label: bi((t) => t.stock.belowMinimum), value: { count: rows.filter((x) => x.reorder_level > 0 && x.available <= x.reorder_level).length }, icon: PackageMinus },
          ...when(costs, { key: "value", label: bi((t) => t.stock.totalValue), value: { money: sumOf(rows.map((x) => x.stock_value)) }, icon: Scale }),
        ],
        tables: [{
          key: "stock", title: bi((t) => t.reports.stock), search: ["name", "sku", "barcode", "category", "brand"],
          rows: rows.map((x): ReportRow => ({
            ...product(x), barcode: x.barcode, category: optional(x.category_en, x.category_ur), brand: optional(x.brand_en, x.brand_ur), unit: name(x.unit_en, x.unit_ur),
            onHand: x.on_hand, reserved: x.reserved, available: x.available, damaged: x.damaged, minimum: x.reorder_level, cost: x.unit_cost, value: x.stock_value,
          })),
          columns: [
            productColumn, col("category", (t) => t.catalog.category, "text", xl), col("brand", (t) => t.catalog.brand, "text", { ...xxl, screenOnly: true }), unitColumn, col("onHand", (t) => t.stock.onHand, "quantity"),
            col("reserved", (t) => t.stock.reserved, "quantity", lg), col("available", (t) => t.stock.available, "quantity"), col("damaged", (t) => t.stock.damaged, "quantity", lg), col("minimum", (t) => t.stock.minimum, "quantity", xl),
            ...when(costs, col("cost", (t) => t.stock.unitCost, "money", lg), col("value", (t) => t.stock.value, "money", total)),
          ],
        }],
      };
    },
  },
  {
    slug: "stock-valuation", group: "inventory", title: title("stockValuation"), hint: hint("stockValuation"), icon: Scale, permissions: ["costs.view"], allowed: (ctx) => can(ctx, "inventory.view"), dates: "now",
    filters: categoryFilter,
    async load(input) {
      const { ctx, filter } = input;
      const [rows, agreement] = await Promise.all([loadStock(null, filter("category")), loadReconciliation(ctx)]);
      const held = rows.filter((x) => x.on_hand !== 0 || x.damaged !== 0 || toPaisa(x.stock_value ?? 0) !== toPaisa(0));
      const value = sumOf(held.map((x) => x.stock_value));
      const groups = Map.groupBy(held, (x) => x.category_en ?? "");
      const byCategory = [...groups.values()].map((list) => ({ en: list[0]?.category_en, ur: list[0]?.category_ur, value: sumOf(list.map((x) => x.stock_value)) })).toSorted((a, b) => (a.value < b.value ? 1 : a.value > b.value ? -1 : 0));
      const none = bi((t) => t.analytics.withoutCategory);
      return {
        figures: [{ key: "value", label: bi((t) => t.stock.totalValue), value: { money: value }, hint: bi((t) => t.stock.totalValueHint), icon: Scale }, { key: "products", label: bi((t) => t.stock.productsInStock), value: { count: held.filter((x) => x.on_hand > 0).length }, icon: Boxes }],
        charts: byCategory.length > 1 ? [{
          key: "category", type: "bars", title: bi((t) => t.analytics.charts.valueByCategory), hint: bi((t) => t.stock.totalValueHint), category: bi((t) => t.catalog.category), series: [{ key: "value", label: bi((t) => t.stock.value) }],
          points: byCategory.slice(0, 10).map((c) => ({ label: c.en ? { en: c.en, ur: c.ur ?? c.en } : none, values: [c.value] })),
        }] : [],
        tables: [{
          key: "valuation", title: title("stockValuation"), search: ["name", "sku", "category"], sort: { id: "value", descending: true },
          rows: held.map((x): ReportRow => ({ ...product(x), category: optional(x.category_en, x.category_ur), unit: name(x.unit_en, x.unit_ur), onHand: x.on_hand, damaged: x.damaged, cost: x.unit_cost, value: x.stock_value })),
          columns: [
            productColumn, col("category", (t) => t.catalog.category, "text", lg), unitColumn, col("onHand", (t) => t.stock.onHand, "quantity"), col("damaged", (t) => t.stock.damaged, "quantity", lg),
            col("cost", (t) => t.stock.unitCost, "money"), col("value", (t) => t.stock.value, "money", total),
          ],
        }],
        checks: input.whole && agreement ? [{ label: bi((t) => t.analytics.checks.inventory), report: value, other: toPaisa(0), ledger: toPaisa(agreement.ledger) }] : [],
      };
    },
  },
  movement("fast"),
  movement("slow"),
  {
    slug: "low-stock", group: "inventory", title: bi((t) => t.reports.lowStock), hint: bi((t) => t.reports.lowStockHint), icon: PackageMinus, permissions: ["inventory.view"], dates: "now",
    async load() {
      const rows = (await reportLowStock()).toSorted((a, b) => b.shortage - a.shortage);
      return {
        tables: [{
          key: "low", title: bi((t) => t.reports.lowStock), search: ["name", "sku", "supplier"], sort: { id: "shortage", descending: true }, empty: bi((t) => t.reports.lowStockEmpty),
          rows: rows.map((x): ReportRow => ({ ...product(x), unit: name(x.unit_en, x.unit_ur), available: x.available, minimum: x.reorder_level, shortage: x.shortage, onOrder: x.on_order, supplier: optional(x.supplier_en, x.supplier_ur), last: x.last_received })),
          columns: [
            productColumn, unitColumn, col("available", (t) => t.stock.available, "quantity"), col("minimum", (t) => t.stock.minimum, "quantity"), col("shortage", (t) => t.reports.shortage, "quantity"),
            col("onOrder", (t) => t.reports.onOrder, "quantity"), ...when(OTHER_VENDORS, col("supplier", (t) => t.documents.supplier, "text", lg)), col("last", (t) => t.reports.lastReceived, "date", xl),
          ],
        }],
      };
    },
  },
  {
    slug: "damaged", group: "inventory", title: bi((t) => t.reports.damaged), hint: bi((t) => t.reports.damagedHint), icon: PackageX, permissions: ["inventory.view"], dates: "period",
    async load({ ctx, period }) {
      const rows = await reportDamaged(period);
      const costs = can(ctx, "costs.view");
      return {
        tables: [{
          key: "damaged", title: bi((t) => t.reports.damaged), search: ["name", "sku"],
          rows: rows.map((x): ReportRow => ({
            ...product(x), unit: name(x.unit_en, x.unit_ur), onHand: x.on_hand, value: x.stock_value, received: x.received_damaged, customer: x.customer_returns, moved: x.moved_in, written: x.written_off, returned: x.returned_to_supplier,
          })),
          columns: [
            productColumn, col("onHand", (t) => t.reports.damagedNow, "quantity", { sub: "unit", subLabel: bi((t) => t.documents.unit), total: true }), ...when(costs, col("value", (t) => t.stock.value, "money", total)),
            col("received", (t) => t.stock.receivedDamaged, "quantity", total), col("customer", (t) => t.stock.customerReturns, "quantity", { ...lg, total: true }), col("moved", (t) => t.stock.movedIn, "quantity", { ...lg, total: true }),
            col("written", (t) => t.stock.writtenOff, "quantity", total), col("returned", (t) => t.stock.returnedToSupplier, "quantity", { ...lg, total: true }),
          ],
        }],
      };
    },
  },
  {
    slug: "profitability", group: "inventory", title: bi((t) => t.reports.profitability), hint: bi((t) => t.reports.profitabilityHint), icon: BadgePercent, permissions: ["costs.view"], dates: "period",
    async load(input) {
      const rows = await reportProfitability(input.period);
      const [sales, cost] = [sumOf(rows.map((x) => x.net_sales)), sumOf(rows.map((x) => x.cost))];
      const best = rows.toSorted((a, b) => b.gross_profit - a.gross_profit).slice(0, 10);
      return {
        figures: [
          { key: "sales", label: bi((t) => t.reports.netSales), value: { money: sales } }, { key: "cost", label: bi((t) => t.reports.cost), value: { money: cost } }, { key: "profit", label: bi((t) => t.reports.grossProfit), value: { money: sales - cost }, icon: BadgePercent },
        ],
        charts: best.length > 1 ? [{
          key: "profit", type: "bars", title: bi((t) => t.analytics.charts.profitByProduct), hint: bi((t) => t.reports.profitabilityHint), category: bi((t) => t.documents.product), series: [{ key: "profit", label: bi((t) => t.reports.grossProfit) }],
          points: best.filter((x) => x.gross_profit > 0).map((x) => ({ label: { en: x.name_en, ur: x.name_ur ?? x.name_en }, values: [toPaisa(x.gross_profit)] })),
        }] : [],
        tables: [{
          key: "profit", title: bi((t) => t.reports.profitability), search: ["name", "sku"], sort: { id: "profit", descending: true },
          rows: rows.map((x): ReportRow => ({ ...product(x), unit: name(x.unit_en, x.unit_ur), quantity: x.quantity, sales: x.net_sales, cost: x.cost, profit: x.gross_profit, margin: x.margin_percent })),
          columns: [
            productColumn, col("quantity", (t) => t.reports.soldQuantity, "quantity", { sub: "unit", subLabel: bi((t) => t.documents.unit) }), col("sales", (t) => t.reports.netSales, "money", total), col("cost", (t) => t.reports.cost, "money", total),
            col("profit", (t) => t.reports.grossProfit, "money", total), col("margin", (t) => t.reports.margin, "percent"),
          ],
        }],
        checks: await ledgerChecks(input, [
          { label: bi((t) => t.analytics.checks.sales), report: sales, keys: ["SALES", "SALES_RETURNS"], sources: ["sales_invoice", "customer_return"], from: input.period.from, to: input.period.to },
          { label: bi((t) => t.analytics.checks.cogs), report: cost, keys: ["COGS"], sources: ["sales_invoice", "customer_return"], from: input.period.from, to: input.period.to, debit: true },
        ]),
        notes: [bi((t) => t.analytics.notes.profitability)],
      };
    },
  },
  {
    slug: "movements", group: "inventory", title: bi((t) => t.reports.movements), hint: bi((t) => t.reports.movementsHint), icon: History, permissions: ["inventory.view"], dates: "period",
    filters: async (_ctx, query) => {
      const id = uuidParam(query.product);
      const one = id ? await loadProductName(id) : null;
      return [
        ...(await warehouseFilter()), { param: "type", label: bi((t) => t.stock.kind), all: bi((t) => t.stock.allTypes), options: MOVEMENT_TYPES.map((value) => ({ value, label: biKey((t) => t.stock.movementTypes, value) })) },
        ...when(!!id && !!one, { param: "product", label: bi((t) => t.documents.product), all: bi((t) => t.analytics.allProducts), options: [{ value: id ?? "", label: name(one?.name_en, one?.name_ur) }] }),
      ];
    },
    async load({ ctx, period, filter }) {
      const { rows, total: count } = await reportMovements({ from: period.from, to: period.to, productId: filter("product"), warehouseId: filter("warehouse"), type: filter("type") });
      const costs = can(ctx, "costs.view");
      return {
        tables: [{
          key: "movements", title: bi((t) => t.reports.movements), search: ["name", "sku", "no"], limited: { shown: rows.length, total: count },
          rows: rows.map((m): ReportRow => ({
            id: String(m.id), date: m.movement_date, name: name(m.name_en, m.name_ur), nameHref: `/products/${m.product_id}`, sku: m.sku, warehouse: name(m.warehouse_en, m.warehouse_ur), type: biKey((t) => t.stock.movementTypes, m.movement_type), no: m.doc_no, by: m.created_by_name, override: m.negative_override ? bi((t) => t.stock.overrideUsed) : null,
            quantity: m.quantity, unit: name(m.unit_en, m.unit_ur), balance: m.balance_after, value: m.value_change,
          })),
          columns: [
            col("date", (t) => t.documents.date, "date"), productColumn, col("warehouse", (t) => t.documents.warehouse, "text", lg), col("type", (t) => t.stock.kind, "text"), col("no", (t) => t.documents.number, "code", lg),
            col("quantity", (t) => t.documents.quantity, "quantity", { sub: "unit", subLabel: bi((t) => t.documents.unit) }), col("balance", (t) => t.stock.balanceAfter, "quantity", lg), ...when(costs, col("value", (t) => t.stock.valueChange, "money", xl)),
            ...when(rows.some((m) => m.negative_override), col("override", (t) => t.stock.overrideUsed, "text", xl)), col("by", (t) => t.stock.movedBy, "text", { ...xxl, screenOnly: true }),
          ],
        }],
      };
    },
  },
];
