import { z } from "zod";

// Shapes of the dashboard_* database functions. Money stays a decimal string until
// toPaisa(); a figure the caller may not see is absent.
const money = z.string().regex(/^-?\d+(\.\d{1,2})?$/);
const quantity = z.string().regex(/^-?\d+$/);

export const positionSchema = z.object({
  today: z.iso.date(),
  cash: money.optional(),
  bank: money.optional(),
  receivables: money.optional(),
  supplier_payables: money.optional(),
  company_outstanding: money.optional(),
  inventory_value: money.optional(),
  stock: z.object({
    products: z.number(),
    units: z.array(z.object({ name_en: z.string(), name_ur: z.string(), on_hand: quantity, reserved: quantity, damaged: quantity })),
  }).optional(),
  today_sales: z.object({ scope: z.enum(["all", "own"]), net: money, returns: money, invoices: z.number() }).optional(),
  today_purchases: z.object({ total: money, receipts: z.number() }).optional(),
  sol_pending: z.object({ amount: money, jobs: z.number() }).optional(),
});
export type Position = z.infer<typeof positionSchema>;

const totals = z.object({
  sales: money.optional(), returns: money.optional(), purchases: money.optional(), expenses: money.optional(),
  gross_profit: money.optional(), net_profit: money.optional(), sol_revenue: money.optional(),
});
export type PeriodTotals = z.infer<typeof totals>;

export const performanceSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  days: z.number(),
  bucket: z.enum(["day", "week", "month"]),
  sales_scope: z.enum(["all", "own"]).optional(),
  expense_scope: z.enum(["ledger", "documents"]).optional(),
  current: totals,
  previous: totals,
  sol_route_sales: money.optional(),
  series: z.array(z.object({
    start: z.iso.date(),
    sales: money.optional(), expenses: money.optional(), gross_profit: money.optional(), net_profit: money.optional(),
    stock_in: quantity.optional(), stock_out: quantity.optional(),
  })),
  expense_accounts: z.array(z.object({ name_en: z.string(), name_ur: z.string(), amount: money })).optional(),
});
export type Performance = z.infer<typeof performanceSchema>;

const overdueSide = z.object({
  total: money,
  count: z.number(),
  items: z.array(z.object({
    doc_no: z.string(), party: z.string(), party_ur: z.string().nullable(), due_date: z.iso.date(), days: z.number(), outstanding: money,
  })),
});
export type OverdueSide = z.infer<typeof overdueSide>;
export const overdueSchema = z.object({ receivables: overdueSide.optional(), payables: overdueSide.optional() });
export type Overdue = z.infer<typeof overdueSchema>;

export const lowStockSchema = z.object({
  count: z.number(),
  monitored: z.number(),
  items: z.array(z.object({
    sku: z.string(), name_en: z.string(), name_ur: z.string().nullable(), unit_en: z.string(), unit_ur: z.string(),
    available: quantity, reorder_level: quantity,
  })),
});
export type LowStock = z.infer<typeof lowStockSchema>;
