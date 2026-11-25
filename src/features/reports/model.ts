import type { LucideIcon } from "lucide-react";
import type { Period } from "@/features/dashboard/period";
import type { Permission } from "@/lib/auth/permissions";
import type { SessionContext } from "@/lib/auth/session";
import type { Bi, Value } from "@/lib/pdf/model";
import type { Paisa } from "@/lib/utils/money";
import type { BadgeTone } from "@/components/shared/status-badge";

export const REPORT_GROUPS = ["inventory", "sales", "suppliers", "company", "sol", "finance", "operations"] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];

export type Query = Record<string, string | string[] | undefined>;

export type ColumnKind = "text" | "link" | "code" | "date" | "datetime" | "quantity" | "decimal" | "money" | "percent" | "status";
export interface ReportColumn {
  key: string;
  label: Bi;
  kind: ColumnKind;
  /** Second line in small print on screen and in the PDF; a column of its own in Excel and CSV, headed `subLabel`. */
  sub?: string;
  subLabel?: Bi;
  total?: boolean;
  hideBelow?: "lg" | "xl" | "2xl";
  primary?: boolean;
  options?: Record<string, { label: Bi; tone: BadgeTone }>;
  /** Left out of the PDF, whose pages hold fewer columns. Excel and CSV have every column. */
  screenOnly?: boolean;
}

export type ReportValue = Value | number | null | undefined;
export type ReportRow = { id: string } & Record<string, ReportValue>;

export interface ReportTable {
  key: string;
  title: Bi;
  columns: ReportColumn[];
  rows: ReportRow[];
  search?: string[];
  sort?: { id: string; descending?: boolean };
  empty?: Bi;
  /** Counted rows; a warning says how many of them are shown. */
  limited?: { shown: number; total: number };
}

export interface ReportFigure { key: string; label: Bi; value: { money: Paisa } | { count: number } | { text: Value }; hint?: Bi; attention?: boolean; icon?: LucideIcon }

export interface ReportChart {
  key: string;
  type: "columns" | "bars";
  title: Bi;
  hint: Bi;
  category: Bi;
  series: { key: string; label: Bi }[];
  /** Exact amounts; only the drawing rounds them. Absent values (null) are drawn as zero and named as a dash. */
  points: { label: Bi; values: Paisa[] }[];
  /** The values are numbers of things instead of money. */
  counts?: boolean;
}

/** A total of the report beside the general ledger. `other` are ledger entries of other documents, which are not part of the report. */
export interface ReportCheck { label: Bi; report: Paisa; other: Paisa; ledger: Paisa }
export const reconciles = (check: ReportCheck) => check.report + check.other === check.ledger;

export interface StatementPart { key: string; title?: Bi; rows: { key: string; label: Value; code?: string | null; amount: Paisa }[]; total?: { label: Bi; amount: Paisa }; strong?: boolean }

export interface ReportModel {
  figures?: ReportFigure[];
  charts?: ReportChart[];
  statement?: StatementPart[];
  tables: ReportTable[];
  checks?: ReportCheck[];
  notes?: Bi[];
}

export interface ReportFilter { param: string; label: Bi; /** What no choice means: "All customers". */ all: Bi; options: { value: string; label: Value }[]; /** Changes the grouping or one date, not what is included. */ keeps?: boolean }

export interface ReportInput {
  ctx: SessionContext;
  period: Period;
  /** The date of a report "as of" a day. */
  day: string;
  today: string;
  query: Query;
  /** The chosen option of a filter, or null: anything that is not an option counts as not chosen. */
  filter: (param: string) => string | null;
  /** No filter leaves anything out, so that totals can be compared with the ledger. */
  whole: boolean;
}

export interface ReportDefinition {
  slug: string;
  group: ReportGroup;
  title: Bi;
  hint: Bi;
  icon: LucideIcon;
  /** Any one of these opens the report, besides reports.view; the database checks again. */
  permissions: readonly Permission[];
  /** A further condition. */
  allowed?: (ctx: SessionContext) => boolean;
  /** Dates it depends on: a period, one day, or the present moment. */
  dates: "period" | "day" | "now";
  filters?: (ctx: SessionContext, query: Query) => Promise<ReportFilter[]> | ReportFilter[];
  load: (input: ReportInput) => Promise<ReportModel>;
}

/** What a report shows, with the selection that led to it. */
export interface LoadedReport {
  definition: ReportDefinition;
  model: ReportModel;
  period: Period;
  day: string;
  today: string;
  filters: ReportFilter[];
  /** Chosen filters, for headings. */
  chosen: { label: Bi; value: Value }[];
  /** "1 November 2026 to 25 November 2026", or a day. */
  dates: Bi;
  /** The selection as parameters of an address. */
  params: Record<string, string>;
}
