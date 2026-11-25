import { zip } from "./zip";

export type XlsxKind = "text" | "money" | "quantity" | "decimal" | "percent" | "date" | "datetime";
/** Numbers are exact decimal text, dates ISO text; Excel gets real numbers and dates, never text that looks like one. */
export interface XlsxCell { value: string | null; kind: XlsxKind; bold?: boolean }
export interface XlsxColumn { header: string; kind: XlsxKind; total?: boolean }
export interface XlsxSheet {
  name: string;
  /** Lines above the table; the first is the title. */
  heading: string[];
  columns: XlsxColumn[];
  rows: (string | null)[][];
  /** Exact totals by column, beside which the sheet carries a formula that follows its filters. */
  totals?: (string | null)[];
  totalLabel?: string;
  rtl: boolean;
}

// Style numbers: 0 text, then one per kind; +8 for bold totals. 16 title, 17 heading line, 18 column head, 19 head of figures; 20 and 21 are 16 and 17 read from right to left.
const STYLE: Record<XlsxKind, number> = { text: 0, money: 1, quantity: 2, decimal: 3, percent: 4, date: 5, datetime: 6 };

const FORBIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;
const xml = (text: string) => text.replace(FORBIDDEN, "").replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const column = (index: number): string => (index >= 26 ? column(Math.floor(index / 26) - 1) : "") + String.fromCharCode(65 + (index % 26));
/** Excel counts days from 30 December 1899. */
const serial = (iso: string): string | null => {
  const ms = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(ms) ? null : String(Math.round(((ms - Date.UTC(1899, 11, 30)) / 86_400_000) * 1e6) / 1e6);
};

function cell(reference: string, value: string | null | undefined, kind: XlsxKind, style: number, formula?: string): string {
  if (value === null || value === undefined || value === "") return `<c r="${reference}" s="${style}"/>`;
  if (kind === "date" || kind === "datetime") {
    const number = serial(value);
    if (number !== null) return `<c r="${reference}" s="${style}"><v>${number}</v></c>`;
  } else if (kind !== "text" && /^-?\d+(\.\d+)?$/.test(value)) {
    return `<c r="${reference}" s="${style}">${formula ? `<f>${formula}</f>` : ""}<v>${value}</v></c>`;
  }
  // Inline text is never read as a formula, whatever it begins with.
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

/** Sheet names may not contain \ / ? * [ ] : and have at most 31 characters. */
export const sheetName = (name: string, taken: Set<string>): string => {
  const base = name.replace(/[\\/?*[\]:]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 28) || "Sheet";
  let result = base;
  for (let i = 2; taken.has(result.toLowerCase()); i++) result = `${base} ${i}`;
  taken.add(result.toLowerCase());
  return result;
};

function sheetXml(sheet: XlsxSheet): { body: string; headRow: number } {
  const rows: string[] = [];
  sheet.heading.forEach((line, i) => rows.push(`<row r="${i + 1}"${i === 0 ? ' ht="24" customHeight="1"' : ""}>${cell(`A${i + 1}`, line, "text", (i === 0 ? 16 : 17) + (sheet.rtl ? 4 : 0))}</row>`));
  const headRow = sheet.heading.length + 2;
  rows.push(`<row r="${headRow}" ht="22" customHeight="1">${sheet.columns.map((c, i) => cell(`${column(i)}${headRow}`, c.header, "text", c.kind === "text" || c.kind === "date" || c.kind === "datetime" ? 18 : 19)).join("")}</row>`);
  sheet.rows.forEach((row, r) => {
    const n = headRow + 1 + r;
    rows.push(`<row r="${n}">${sheet.columns.map((c, i) => cell(`${column(i)}${n}`, row[i], c.kind, STYLE[c.kind])).join("")}</row>`);
  });
  const last = headRow + sheet.rows.length;
  if (sheet.totals && sheet.rows.length) {
    const n = last + 1;
    rows.push(`<row r="${n}">${sheet.columns.map((c, i) => {
      const value = sheet.totals?.[i] ?? null;
      const label = i === 0 && value === null ? sheet.totalLabel ?? null : null;
      return cell(`${column(i)}${n}`, value ?? label, value === null ? "text" : c.kind, STYLE[value === null ? "text" : c.kind] + 8, value === null ? undefined : `SUBTOTAL(109,${column(i)}${headRow + 1}:${column(i)}${last})`);
    }).join("")}</row>`);
  }
  // Columns as wide as their content, within reason.
  const widths = sheet.columns.map((c, i) => Math.min(48, Math.max(c.header.length + 4, c.kind === "date" ? 13 : c.kind === "datetime" ? 18 : 8, ...sheet.rows.slice(0, 500).map((r) => (r[i]?.length ?? 0) + (c.kind === "money" ? 5 : 2)))));
  const end = column(Math.max(sheet.columns.length - 1, 0));
  return {
    headRow,
    body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`
      + `<sheetViews><sheetView showGridLines="0" workbookViewId="0"${sheet.rtl ? ' rightToLeft="1"' : ""}><pane ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      + `<sheetFormatPr defaultRowHeight="16"/><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
      + `<sheetData>${rows.join("")}</sheetData>${sheet.rows.length ? `<autoFilter ref="A${headRow}:${end}${last}"/>` : ""}`
      + `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;CPage &amp;P / &amp;N</oddFooter></headerFooter></worksheet>`,
  };
}

const numFmts = ['#,##0.00;[Red]\\-#,##0.00', "#,##0", "#,##0.###", '0.0"%"', "dd\\-mmm\\-yyyy", "dd\\-mmm\\-yyyy\\ hh:mm"];
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="${numFmts.length}">${numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xml(f)}"/>`).join("")}</numFmts>`
  + `<fonts count="5"><font><sz val="11"/><color rgb="FF16233B"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF14284F"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FF14284F"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF55627A"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>`
  + `<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF14284F"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE9F0FD"/><bgColor indexed="64"/></patternFill></fill></fills>`
  + `<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD6DEEA"/></bottom><diagonal/></border><border><left/><right/><top style="medium"><color rgb="FF14284F"/></top><bottom/><diagonal/></border></borders>`
  + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="22">`
  + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<xf numFmtId="${i === 0 || i === 7 ? 0 : 163 + i}" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"${i === 0 ? ' applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' : "/>"}`).join("")
  + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<xf numFmtId="${i === 0 || i === 7 ? 0 : 163 + i}" fontId="1" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>`).join("")
  + `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="4" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="4" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>`
  + `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" readingOrder="2"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" readingOrder="2"/></xf>`
  + `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** An Excel workbook (.xlsx). */
export function workbook(sheets: readonly XlsxSheet[], info: { title: string; author: string; created: Date }): Uint8Array {
  const taken = new Set<string>();
  const named = sheets.map((s) => ({ name: sheetName(s.name, taken), ...sheetXml(s) }));
  const main = "http://schemas.openxmlformats.org";
  return zip([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="${main}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${main}/package/2006/relationships"><Relationship Id="rId1" Type="${main}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="${main}/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: "docProps/core.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="${main}/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(info.title)}</dc:title><dc:creator>${xml(info.author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${info.created.toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${main}/spreadsheetml/2006/main" xmlns:r="${main}/officeDocument/2006/relationships"><sheets>${named.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><definedNames>${named.map((s, i) => `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${xml(s.name.replace(/'/g, "''"))}'!$${s.headRow}:$${s.headRow}</definedName>`).join("")}</definedNames><calcPr fullCalcOnLoad="1"/></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${main}/package/2006/relationships">${named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${main}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${named.length + 1}" Type="${main}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", content: STYLES },
    ...named.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, content: s.body })),
  ]);
}
