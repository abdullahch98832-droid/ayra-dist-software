import { APP_CONFIG } from "@/config/app";
import { figure, quantity, rupees, text as cellText, date as dateCell } from "@/features/documents/format";
import { fill } from "@/i18n/format";
import type { Bi, Block, Cell, DocModel, Value } from "@/lib/pdf/model";
import { toCsv } from "@/lib/utils/csv";
import { formatPaisa, toDbAmount } from "@/lib/utils/money";
import { workbook, type XlsxKind, type XlsxSheet } from "@/lib/xlsx/workbook";
import type { Locale } from "@/types";
import { formatDateTime } from "@/components/shared/format";
import { reconciles, type LoadedReport, type ReportColumn, type ReportFigure, type ReportRow, type ReportTable } from "./model";
import { bi } from "@/features/documents/format";
import { columnTotal, inLocale, isBi, plain, ZERO } from "./values";

const w = (pick: Parameters<typeof bi>[0], values?: Record<string, string | number>) => bi(pick, values);
const fileName = (report: LoadedReport, locale: Locale, extension: string) =>
  [report.definition.slug, report.definition.dates === "period" ? `${report.period.from}-${report.period.to}` : report.day, locale === "ur" ? "ur" : ""].filter(Boolean).join("-") + `.${extension}`;

/** A column, and the second line under it as a column of its own. */
const spread = (table: ReportTable): { key: string; label: Bi; kind: ReportColumn["kind"]; column: ReportColumn | null }[] => table.columns.flatMap((c) => [
  { key: c.key, label: c.label, kind: c.kind, column: c },
  ...(c.sub ? [{ key: c.sub, label: c.subLabel ?? c.label, kind: "text" as const, column: null }] : []),
]);
const limitedText = (table: ReportTable): Bi | null => (table.limited && table.limited.total > table.limited.shown ? w((t) => t.reports.limited, { count: table.limited.shown, total: table.limited.total }) : null);
export const figureText = (f: ReportFigure, locale: Locale): string => ("money" in f.value ? formatPaisa(f.value.money, locale) : "count" in f.value ? new Intl.NumberFormat(locale === "ur" ? "ur-PK" : "en-PK", { numberingSystem: "latn" }).format(f.value.count) : inLocale(f.value.text, locale));

/** The statement of a report as a table, for spreadsheets. */
function statementTable(report: LoadedReport): ReportTable[] {
  const parts = report.model.statement;
  if (!parts) return [];
  return [{
    key: "statement", title: report.definition.title,
    columns: [
      { key: "section", label: w((t) => t.analytics.section), kind: "text", primary: true }, { key: "code", label: w((t) => t.accounting.code), kind: "code" },
      { key: "label", label: w((t) => t.accounting.account), kind: "text" }, { key: "amount", label: w((t) => t.analytics.amount), kind: "money" },
    ],
    rows: parts.flatMap((p, i) => [
      ...p.rows.map((r): ReportRow => ({ id: `${i}-${r.key}`, section: p.title ?? p.total?.label ?? null, code: r.code ?? null, label: r.label, amount: toDbAmount(r.amount) })),
      ...(p.total ? [{ id: `${i}-total`, section: p.total.label, code: null, label: w((t) => t.documents.total), amount: toDbAmount(p.total.amount) } as ReportRow] : []),
    ]),
  }];
}
const tablesOf = (report: LoadedReport) => [...statementTable(report), ...report.model.tables];

// --- CSV -------------------------------------------------------------------------------------------------------------

/** One header row and the rows; further tables follow after a blank line and their title. */
export function reportCsv(report: LoadedReport, locale: Locale): { content: string; filename: string } {
  const rows: (string | null)[][] = [];
  tablesOf(report).forEach((table, i) => {
    if (i > 0) rows.push([], [table.title[locale]]);
    const columns = spread(table);
    rows.push(columns.map((c) => c.label[locale]));
    for (const row of table.rows) rows.push(columns.map((c) => plain(c.column ?? { kind: "text" }, row[c.key], locale)));
  });
  return { content: toCsv(rows), filename: fileName(report, locale, "csv") };
}

// --- Excel -----------------------------------------------------------------------------------------------------------

const XLSX_KIND: Record<ReportColumn["kind"], XlsxKind> = { text: "text", link: "text", code: "text", date: "date", datetime: "datetime", quantity: "quantity", decimal: "decimal", money: "money", percent: "percent", status: "text" };
/** Spreadsheets have no time zones: times are written as they read in Pakistan. */
function wallTime(value: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: APP_CONFIG.timeZone, dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
  return `${parts.replace(" ", "T")}Z`;
}

export function reportXlsx(report: LoadedReport, locale: Locale, by: string, now: Date): { bytes: Uint8Array; filename: string } {
  const rtl = locale === "ur";
  const title = report.definition.title[locale];
  const printed = fill(w((t) => t.analytics.exported)[locale], { date: formatDateTime(now.toISOString(), locale) ?? "", user: by });
  const heading = (table: ReportTable) => [
    tablesOf(report).length > 1 ? `${title} — ${table.title[locale]}` : title, APP_CONFIG.name, report.dates[locale],
    ...report.chosen.map((c) => `${c.label[locale]}: ${inLocale(c.value, locale)}`), ...[limitedText(table)?.[locale]].filter((x): x is string => !!x), ...(report.model.notes ?? []).map((n) => n[locale]), printed,
  ];
  const sheets: XlsxSheet[] = tablesOf(report).map((table) => {
    const columns = spread(table);
    return {
      name: tablesOf(report).length > 1 ? table.title[locale] : title, heading: heading(table), rtl,
      columns: columns.map((c) => ({ header: c.label[locale], kind: XLSX_KIND[c.kind] })),
      rows: table.rows.map((row) => columns.map((c) => {
        const value = plain(c.column ?? { kind: "text" }, row[c.key], locale);
        return value !== null && c.kind === "datetime" ? wallTime(value) : value;
      })),
      totals: columns.some((c) => c.column?.total) ? columns.map((c) => (c.column ? columnTotal(c.column, table.rows) : null)) : undefined,
      totalLabel: w((t) => t.documents.total)[locale],
    };
  });
  if (report.model.figures?.length) {
    sheets.push({
      name: w((t) => t.analytics.summary)[locale], heading: [`${title} — ${w((t) => t.analytics.summary)[locale]}`, report.dates[locale], printed], rtl,
      columns: [{ header: w((t) => t.analytics.figure)[locale], kind: "text" }, { header: w((t) => t.analytics.amount)[locale], kind: "money" }, { header: w((t) => t.analytics.number)[locale], kind: "quantity" }, { header: w((t) => t.analytics.value)[locale], kind: "text" }],
      rows: report.model.figures.map((f) => [f.label[locale], "money" in f.value ? toDbAmount(f.value.money) : null, "count" in f.value ? String(f.value.count) : null, "text" in f.value ? inLocale(f.value.text, locale) : null]),
    });
  }
  if (report.model.checks?.length) {
    sheets.push({
      name: w((t) => t.analytics.reconciliation)[locale], heading: [`${title} — ${w((t) => t.analytics.reconciliation)[locale]}`, report.dates[locale], printed], rtl,
      columns: [
        { header: w((t) => t.analytics.checked)[locale], kind: "text" }, { header: w((t) => t.analytics.thisReport)[locale], kind: "money" }, { header: w((t) => t.analytics.otherEntries)[locale], kind: "money" },
        { header: w((t) => t.analytics.ledger)[locale], kind: "money" }, { header: w((t) => t.analytics.difference)[locale], kind: "money" }, { header: w((t) => t.common.status)[locale], kind: "text" },
      ],
      rows: report.model.checks.map((c) => [c.label[locale], toDbAmount(c.report), toDbAmount(c.other), toDbAmount(c.ledger), toDbAmount(c.report + c.other - c.ledger), (reconciles(c) ? w((t) => t.analytics.agrees) : w((t) => t.analytics.differs))[locale]]),
    });
  }
  return { bytes: workbook(sheets, { title, author: APP_CONFIG.name, created: now }), filename: fileName(report, locale, "xlsx") };
}

// --- PDF -------------------------------------------------------------------------------------------------------------

const FIGURE = new Set<ReportColumn["kind"]>(["money", "quantity", "decimal", "percent"]);
const blank: Cell = { text: "" };

function pdfCell(column: ReportColumn, row: ReportRow): Cell {
  const value = row[column.key];
  const sub = column.sub ? row[column.sub] : undefined;
  const second = sub === null || sub === undefined || sub === "" ? {} : { sub: isBi(sub) ? sub : String(sub) };
  if (value === null || value === undefined || value === "") return cellText(null, second);
  if (isBi(value)) return { text: value, ...second, strong: column.primary };
  switch (column.kind) {
    case "money": return figure(value, second);
    case "quantity": case "decimal": return quantity(value, second);
    case "percent": return { text: `${value}%`, code: true, ...second };
    case "date": return { ...dateCell(String(value)), ...second };
    case "datetime": return { text: { en: formatDateTime(String(value), "en") ?? "", ur: formatDateTime(String(value), "ur") ?? "" }, single: true, ...second };
    case "code": return { text: String(value), code: true, ...second };
    case "status": return { text: column.options?.[String(value)]?.label ?? String(value), ...second };
    default: return { text: String(value), ...second, strong: column.primary };
  }
}

function pdfTable(table: ReportTable, titled: boolean): Extract<Block, { type: "table" }> {
  const columns = table.columns.filter((c) => !c.screenOnly);
  const totals = columns.map((c) => columnTotal(c, table.rows));
  const summed = table.rows.length > 0 && totals.some((v) => v !== null);
  const first = columns.findIndex((c) => c.primary);
  // Columns of words share the free width; the main one takes the largest part.
  const wide = columns.some((c) => c.primary && (c.kind === "text" || c.kind === "link"));
  return {
    type: "table", numbered: table.rows.length > 1, empty: table.empty ?? w((t) => t.docs.empty), ...(titled ? { title: table.title } : {}),
    columns: columns.map((c) => ({ label: c.kind === "money" ? { en: `${c.label.en} (Rs)`, ur: `${c.label.ur} (Rs)` } : c.label, figure: FIGURE.has(c.kind), ...(c.primary && wide ? { flex: 2 } : c.kind === "text" || (c.kind === "link" && !c.primary) ? { flex: 1 } : {}) })),
    rows: table.rows.map((row) => columns.map((c) => pdfCell(c, row))),
    ...(summed ? {
      footer: columns.map((c, i): Cell => {
        const total = totals[i] ?? null;
        if (total !== null) return c.kind === "money" ? figure(total) : quantity(total);
        return i === Math.max(first, 0) ? { text: w((t) => t.docs.totals.total) } : blank;
      }),
    } : {}),
  };
}

/** The report as a document of the PDF engine. */
/** The report as a paper; with `only`, just that one table, as a list screen shows it. */
export function reportDocument(report: LoadedReport, only?: string): DocModel {
  const { model, definition } = report;
  const picked = only ? model.tables.find((t) => t.key === only) : undefined;
  if (picked) {
    const block = pdfTable(picked, false);
    const limit = limitedText(picked);
    return {
      title: picked.title, period: report.dates, landscape: block.columns.length > 5,
      meta: report.chosen.map((c) => ({ label: c.label, value: cellText(c.value as Value) })),
      blocks: [...(limit ? [{ type: "text" as const, text: limit }] : []), block],
    };
  }
  const tables = model.tables.map((table) => ({ table, block: pdfTable(table, model.tables.length > 1 || !!model.statement) }));
  const many = tables.some(({ block }) => block.columns.length > 5);
  const blocks: Block[] = [
    ...(model.statement ? [{
      type: "statement" as const,
      sections: model.statement.map((p) => ({ title: p.title, rows: p.rows.map((r) => ({ label: r.label, code: r.code, value: rupees(r.amount) })), total: p.total && { label: p.total.label, value: rupees(p.total.amount) }, strong: p.strong })),
    }] : []),
    ...tables.flatMap(({ table, block }): Block[] => { const limit = limitedText(table); return [...(limit ? [{ type: "text" as const, text: limit }] : []), block]; }),
    ...(model.checks?.length ? [{
      type: "table" as const, title: w((t) => t.analytics.reconciliation),
      columns: [
        { label: w((t) => t.analytics.checked), flex: 1 }, ...[w((t) => t.analytics.thisReport), w((t) => t.analytics.otherEntries), w((t) => t.analytics.ledger), w((t) => t.analytics.difference)].map((label) => ({ label, figure: true })),
      ],
      rows: model.checks.map((c): Cell[] => {
        const gap = c.report + c.other - c.ledger;
        return [{ text: c.label }, figure(c.report), figure(c.other), figure(c.ledger), gap === ZERO ? figure(gap) : figure(gap, { tone: "danger", strong: true })];
      }),
    }] : []),
  ];
  const meta: { label: Bi; value: Cell }[] = [
    ...report.chosen.map((c) => ({ label: c.label, value: cellText(c.value as Value) })),
    ...(model.figures ?? []).slice(0, 8).map((f) => ({ label: f.label, value: "money" in f.value ? rupees(f.value.money) : "count" in f.value ? quantity(f.value.count) : cellText(f.value.text) })),
  ];
  const notes = model.notes ?? [];
  return {
    title: definition.title, period: report.dates, landscape: many, meta, blocks,
    ...(notes.length ? { note: { en: notes.map((n) => n.en).join(" "), ur: notes.map((n) => n.ur).join(" ") } } : {}),
  };
}
