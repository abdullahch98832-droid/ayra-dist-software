import type { Block, Cell, Column, DocModel, RenderOptions, Value, Bi } from "./model";
import { joinLines, layoutText, linesHeight, linesWidth, type Line, type TextStyle } from "./text";
import { PdfDocument, type Color, type Page } from "./writer";

const A4: readonly [number, number] = [595.28, 841.89];
const MARGIN = 38;
const FOOTER = 46;
const NAVY: Color = "#14284f";
const PRIMARY: Color = "#1f56c9";
const INK: Color = "#16233b";
const MUTED: Color = "#55627a";
const LINE: Color = "#d6deea";
const SOFT: Color = "#f4f7fc";
const ACCENT: Color = "#e9f0fd";
const WHITE: Color = "#ffffff";
const TONES: Record<NonNullable<Cell["tone"]>, Color> = { danger: "#c0282f", muted: MUTED, success: "#12704a" };
const PALE: Color = "#f3e1e2";

type Align = "left" | "right" | "center";
/** How both languages stand in one place: one under the other, side by side, or at the two edges. */
type Pairing = "stack" | "inline" | "spread";
interface Text { lines: { line: Line; color: Color }[]; height: number; width: number }

/** Lays a document model out on pages. Nothing here calculates: every figure arrives as text. */
class Renderer {
  private page!: Page;
  private y = 0;
  private bottom = 0;
  private x0 = MARGIN;
  private x1 = 0;
  private model!: DocModel;
  private readonly rtl: boolean;
  private readonly both: boolean;

  constructor(private pdf: PdfDocument, private options: RenderOptions) {
    this.rtl = options.language === "ur";
    this.both = options.language === "both";
  }

  // --- text -------------------------------------------------------------------------------------------------------

  private lines(text: string, style: TextStyle, width: number, color: Color, code: boolean): Text {
    const lines = layoutText(text, style, width, code ? "ltr" : "auto").map((line) => ({ line, color }));
    return { lines, height: linesHeight(lines.map((l) => l.line)), width: linesWidth(lines.map((l) => l.line)) };
  }

  /** In a bilingual document the Urdu stands beside or under the English; a name without Urdu stands alone. */
  private value(value: Value, style: TextStyle, width: number, color: Color, code = false, pairing: Pairing = "stack"): Text {
    if (typeof value === "string") return this.lines(value, style, width, color, code);
    if (!this.both) return this.lines((this.rtl ? value.ur : value.en) || value.en || value.ur, style, width, color, code);
    const parts = [value.en, value.ur !== value.en ? value.ur : ""].filter(Boolean).map((text) => this.lines(text, style, width, color, code));
    const [en, ur] = parts;
    const [a, b] = [en?.lines[0]?.line, ur?.lines[0]?.line];
    if (pairing !== "stack" && a && b && en?.lines.length === 1 && ur?.lines.length === 1 && a.width + b.width + 7 <= width) {
      const line = joinLines(a, b, 7, pairing === "spread" ? width : undefined);
      return { lines: [{ line, color }], height: line.ascent + line.descent, width: line.width };
    }
    return stack(parts);
  }

  private cell(cell: Cell, size: number, width: number, tabular = false, pairing: Pairing = "inline"): Text {
    const color = cell.tone ? TONES[cell.tone] : INK;
    const text = cell.single && this.both && typeof cell.text !== "string" ? cell.text.en : cell.text;
    const main = this.value(text, { size, bold: cell.strong, tabular }, width, color, cell.code, pairing);
    if (!cell.sub) return main;
    return stack([main, this.value(cell.sub, { size: size - 1.4 }, width, MUTED)]);
  }

  private draw(text: Text, left: number, right: number, top: number, align: Align): number {
    let y = top;
    for (const { line, color } of text.lines) {
      y += line.ascent;
      this.page.text(line, align === "left" ? left : align === "right" ? right - line.width : (left + right - line.width) / 2, y, color);
      y += line.descent;
    }
    return y;
  }

  /** Reading-start and reading-end of the page. */
  private get start(): Align { return this.rtl ? "right" : "left"; }
  private get end(): Align { return this.rtl ? "left" : "right"; }

  // --- pages ------------------------------------------------------------------------------------------------------

  render(model: DocModel) {
    this.model = model;
    this.newPage(true);
    this.party();
    model.blocks.forEach((block, i) => {
      this.y += i === 0 ? 2 : 9;
      const next = model.blocks[i + 1];
      this.block(block, next?.type === "totals" ? this.totalsHeight(next) + 9 : 0);
    });
    if (model.note && (model.note.en || model.note.ur)) {
      const text = this.value({ en: model.note.en || model.note.ur, ur: model.note.ur || model.note.en }, { size: 8.5 }, this.x1 - this.x0, MUTED);
      this.ensure(text.height + 10);
      this.y += 10;
      this.y = this.draw(text, this.x0, this.x1, this.y, this.start);
    }
    this.signatures();
  }

  private newPage(first: boolean) {
    const [w, h] = this.model.landscape ? [A4[1], A4[0]] : A4;
    this.page = this.pdf.addPage(w, h);
    this.x1 = w - MARGIN;
    this.bottom = h - FOOTER;
    if (this.model.watermark) this.watermark(this.model.watermark);
    if (first) this.letterhead();
    else this.runningHead();
  }

  private watermark(text: Bi) {
    this.page.watermark(this.rtl ? text.ur : text.en, this.rtl ? "rtl" : "ltr", PALE);
  }

  /** Starts a page when the height does not fit on this one. */
  private ensure(height: number): boolean {
    if (this.y + height <= this.bottom) return false;
    this.newPage(false);
    return true;
  }

  /** Width of the emblem `height` points high: the logo keeps its proportions. */
  private emblemWidth(height: number) {
    const logo = this.options.letterhead.logo;
    return logo ? (height * logo.width) / logo.height : height;
  }

  private emblem(x: number, y: number, size: number) {
    const logo = this.options.letterhead.logo;
    if (logo) {
      // The logo is made for navy: a navy panel with rounded corners, the picture just inside it.
      const width = this.emblemWidth(size);
      const inset = Math.max(1, size * 0.04);
      this.page.rect(x, y, width, size, { fill: NAVY, radius: size * 0.14 });
      this.page.image(logo, x + inset, y + inset, width - inset * 2, size - inset * 2);
      return;
    }
    this.page.rect(x, y, size, size, { fill: NAVY, radius: size * 0.24 });
    const line = layoutText("A", { size: size * 0.6, heading: true }, 100, "ltr")[0];
    if (line) this.page.text(line, x + (size - line.width) / 2, y + size * 0.71, WHITE);
  }

  private letterhead() {
    const { letterhead: l, words } = this.options;
    const top = 34;
    const mark = this.options.letterhead.logo ? 60 : 40;
    const markWidth = this.emblemWidth(mark);
    const width = this.x1 - this.x0;
    this.emblem(this.rtl ? this.x1 - markWidth : this.x0, top, mark);
    const [bl, br] = this.rtl ? [this.x0 + width * 0.44, this.x1 - markWidth - 11] : [this.x0 + markWidth + 11, this.x0 + width * 0.56];
    let y = this.draw(this.lines(l.name, { size: 18, heading: true }, br - bl, NAVY, true), bl, br, top - 1, this.start);
    if ((this.rtl || this.both) && l.nameUr) y = this.draw(this.lines(l.nameUr, { size: 11, bold: true }, br - bl, NAVY, false), bl, br, y, this.start);
    // Whose paper this is: the distributor's.
    y = this.draw(this.value(l.subtitle, { size: 9, bold: true }, br - bl, PRIMARY, false, "inline"), bl, br, y + 1, this.start);
    const small = { size: 8.2 };
    if (l.address.en || l.address.ur) {
      const address = { en: l.address.en || l.address.ur, ur: l.address.ur || l.address.en };
      y = this.draw(this.value(address, small, br - bl, MUTED, false, "inline"), bl, br, y + 1, this.start);
    }
    const reach = [l.phone, l.email, !this.rtl && l.ntn ? `${words.ntn.en}: ${l.ntn}` : ""].filter(Boolean).join("   ·   ");
    if (reach) y = this.draw(this.lines(reach, small, br - bl, MUTED, true), bl, br, y + 1, this.start);
    // A code in an Urdu line stays in its own direction.
    if (this.rtl && l.ntn) y = this.draw(this.lines(`${words.ntn.ur}: \u2066${l.ntn}\u2069`, small, br - bl, MUTED, false), bl, br, y + 1, this.start);

    const [tl, tr] = this.rtl ? [this.x0, this.x0 + width * 0.42] : [this.x0 + width * 0.58, this.x1];
    let ty = this.title(this.model.title, tl, tr, top - 3);
    if (this.model.number) {
      const number = this.lines(this.model.number, { size: 11, bold: true }, tr - tl - 20, PRIMARY, true);
      const box = number.width + 20;
      const left = this.rtl ? tl : tr - box;
      this.page.rect(left, ty + 5, box, number.height + 7, { fill: ACCENT, radius: 5 });
      this.draw(number, left, left + box, ty + 8.5, "center");
      ty += number.height + 14;
    }
    if (this.model.period) ty = this.draw(this.value(this.model.period, { size: 9 }, tr - tl, MUTED), tl, tr, ty + 4, this.end);
    this.y = Math.max(y, ty, top + mark) + 8;
    this.page.rect(this.x0, this.y, width, 2.4, { fill: NAVY });
    this.page.rect(this.rtl ? this.x1 - 110 : this.x0, this.y, 110, 2.4, { fill: PRIMARY });
    this.y += 12;
  }

  private title(title: Bi, left: number, right: number, top: number): number {
    if (!this.both) return this.draw(this.value(title, { size: 20, bold: true }, right - left, NAVY), left, right, top, this.end);
    const y = this.draw(this.lines(title.en, { size: 18, bold: true }, right - left, NAVY, false), left, right, top, this.end);
    return this.draw(this.lines(title.ur, { size: 14, bold: true }, right - left, NAVY, false), left, right, y, this.end);
  }

  private runningHead() {
    const top = 26;
    const markWidth = this.emblemWidth(18);
    this.emblem(this.rtl ? this.x1 - markWidth : this.x0, top, 18);
    const name = this.lines(this.options.letterhead.name, { size: 10, heading: true }, 200, NAVY, true);
    this.draw(name, this.x0 + markWidth + 7, this.x1 - markWidth - 7, top + (18 - name.height) / 2, this.start);
    const title = this.rtl ? this.model.title.ur : this.model.title.en;
    const text = this.lines(this.model.number ? `${title}   ⁦${this.model.number}⁩` : title, { size: 9, bold: true }, 320, MUTED, false);
    this.draw(text, this.x0, this.x1, top + (18 - text.height) / 2, this.end);
    this.page.line(this.x0, top + 26, this.x1, top + 26, LINE, 0.8);
    this.y = top + 36;
  }

  // --- parts ------------------------------------------------------------------------------------------------------

  /** Who the document is for, beside its dates and references. */
  private party() {
    const { party, meta } = this.model;
    if (!party && meta.length === 0) return;
    const width = this.x1 - this.x0;
    const gap = 12;
    const half = party && meta.length ? (width - gap) / 2 : width;
    const pad = 9;
    const inner = half - pad * 2;
    const left = party ? stack([
      this.value(party.label, { size: 7.8 }, inner, MUTED, false, "spread"),
      this.value(party.name, { size: 11.5, bold: true }, inner, NAVY, false, "spread"),
      ...party.lines.map((l) => this.cell(l, 9, inner, false, "spread")),
    ]) : null;
    const rows = meta.map((m) => this.field(m, inner));
    const rowsHeight = rows.reduce((sum, r) => sum + r.height + 2, 0);
    // Without a party the details use both halves of the width.
    const height = Math.max((left?.height ?? 0) + pad * 2, rows.length ? rowsHeight + pad * 2 - 2 : 0);
    const [pl, ml] = this.rtl ? [this.x1 - half, this.x0] : [this.x0, this.x1 - half];
    if (left) {
      this.page.rect(pl, this.y, half, height, { fill: SOFT, stroke: LINE, lineWidth: 0.5, radius: 7 });
      this.draw(left, pl + pad, pl + half - pad, this.y + pad, this.start);
    }
    if (rows.length) {
      const boxLeft = left ? ml : this.x0;
      this.page.rect(boxLeft, this.y, half, height, { stroke: LINE, lineWidth: 0.7, radius: 7 });
      let y = this.y + pad;
      for (const row of rows) {
        row.draw(boxLeft + pad, boxLeft + half - pad, y);
        y += row.height + 2;
      }
    }
    this.y += height + 10;
  }

  /** Label and value on one line; in a bilingual document the Urdu label closes the line. */
  private field(row: { label: Bi; value: Cell }, width: number) {
    const size = 9;
    const labelWidth = width * (this.both ? 0.3 : 0.4);
    const valueWidth = this.both ? width * 0.4 - 8 : width - labelWidth - 8;
    const en = this.lines(this.rtl ? row.label.ur : row.label.en, { size: 8.4 }, labelWidth, MUTED, false);
    const ur = this.both ? this.lines(row.label.ur, { size: 8.4 }, labelWidth, MUTED, false) : null;
    const value = this.cell({ ...row.value, strong: row.value.strong ?? true }, size, valueWidth, row.value.code);
    const first = (t: Text | null) => t?.lines[0]?.line.ascent ?? 0;
    const ascent = Math.max(first(en), first(ur), first(value));
    const height = Math.max(...[en, ur, value].map((t) => (t ? ascent - first(t) + t.height : 0)));
    return {
      height,
      draw: (left: number, right: number, top: number) => {
        this.draw(en, left, right, top + ascent - first(en), this.start);
        if (ur) {
          this.draw(value, left + labelWidth + 4, right - labelWidth - 4, top + ascent - first(value), "center");
          this.draw(ur, left, right, top + ascent - first(ur), "right");
        } else this.draw(value, left, right, top + ascent - first(value), this.end);
      },
    };
  }

  private block(block: Block, keep: number) {
    switch (block.type) {
      case "table": return this.table(block, keep);
      case "totals": return this.totals(block);
      case "fields": return this.fields(block);
      case "statement": return this.statement(block);
      case "text": return this.paragraph(block);
    }
  }

  private heading(title: Bi, needed: number) {
    const text = this.value(title, { size: 10.5, bold: true }, this.x1 - this.x0, NAVY, false, "inline");
    this.ensure(text.height + 5 + needed);
    this.y = this.draw(text, this.x0, this.x1, this.y, this.start) + 5;
  }

  // --- tables -----------------------------------------------------------------------------------------------------

  private table(block: Extract<Block, { type: "table" }>, keep: number) {
    const numbered = block.numbered ?? false;
    const columns: Column[] = numbered ? [{ label: { en: "#", ur: "#" }, figure: true }, ...block.columns] : block.columns;
    const rows = numbered ? block.rows.map((r, i): Cell[] => [{ text: String(i + 1), code: true, tone: "muted" }, ...r]) : block.rows;
    const footer = block.footer && numbered ? [{ text: "" }, ...block.footer] : block.footer;
    const all = footer ? [...rows, footer] : rows;
    let size = 9;
    let widths = this.widths(columns, all, size);
    while (!widths && size > 6.4) { size -= 0.4; widths = this.widths(columns, all, size); }
    const total = this.x1 - this.x0;
    widths ??= columns.map(() => total / columns.length);

    // Left edges in reading order.
    const edges: number[] = [];
    let at = this.rtl ? this.x1 : this.x0;
    for (const w of widths) {
      if (this.rtl) { at -= w; edges.push(at); } else { edges.push(at); at += w; }
    }
    const px = 5;
    const alignOf = (c: Column): Align => (c.figure ? "right" : this.start);
    const layoutRow = (cells: Cell[], rowSize: number) => {
      const texts = columns.map((c, i) => this.cell(cells[i] ?? { text: "" }, rowSize, (widths[i] ?? 0) - px * 2, c.figure, c.flex ? "spread" : "inline"));
      const ascent = Math.max(...texts.map((t) => t.lines[0]?.line.ascent ?? 0));
      const height = Math.max(...texts.map((t) => ascent - (t.lines[0]?.line.ascent ?? 0) + t.height)) + 7;
      return { texts, ascent, height };
    };
    const head = columns.map((c, i) => this.value(c.label, { size: Math.min(8.4, size), bold: true }, (widths[i] ?? 0) - px * 2, WHITE));
    const headAscent = Math.max(...head.map((t) => t.lines[0]?.line.ascent ?? 0));
    const headHeight = Math.max(...head.map((t) => headAscent - (t.lines[0]?.line.ascent ?? 0) + t.height)) + 8;
    const drawHead = () => {
      this.page.rect(this.x0, this.y, total, headHeight, { fill: NAVY, radius: 5 });
      columns.forEach((c, i) => {
        const text = head[i];
        if (text) this.draw(text, (edges[i] ?? 0) + px, (edges[i] ?? 0) + (widths[i] ?? 0) - px, this.y + 4 + headAscent - (text.lines[0]?.line.ascent ?? 0), alignOf(c));
      });
      this.y += headHeight;
    };
    const drawRow = (row: ReturnType<typeof layoutRow>, fill?: Color) => {
      if (fill) this.page.rect(this.x0, this.y, total, row.height, { fill });
      columns.forEach((c, i) => {
        const text = row.texts[i];
        if (text) this.draw(text, (edges[i] ?? 0) + px, (edges[i] ?? 0) + (widths[i] ?? 0) - px, this.y + 3.5 + row.ascent - (text.lines[0]?.line.ascent ?? 0), alignOf(c));
      });
      this.y += row.height;
      this.page.line(this.x0, this.y, this.x1, this.y, LINE, 0.5);
    };

    const laid = rows.map((r) => layoutRow(r, size));
    const foot = footer ? layoutRow(footer.map((c) => ({ ...c, strong: true })), size) : null;
    const firstNeed = headHeight + (laid[0]?.height ?? 24);
    if (block.title) this.heading(block.title, Math.min(firstNeed, this.bottom - 120));
    else this.ensure(firstNeed);
    drawHead();
    if (laid.length === 0 && block.empty) {
      const text = this.value(block.empty, { size }, total - 20, MUTED);
      this.draw(text, this.x0 + 10, this.x1 - 10, this.y + 9, "center");
      this.y += text.height + 18;
      this.page.line(this.x0, this.y, this.x1, this.y, LINE, 0.5);
    }
    laid.forEach((row, i) => {
      const last = i === laid.length - 1;
      // The last row stays with the totals; a single row cannot.
      const need = row.height + (last ? (foot?.height ?? 0) + (laid.length > 1 ? keep : 0) : 0);
      if (this.y + (last && laid.length === 1 ? row.height : need) > this.bottom) {
        this.newPage(false);
        drawHead();
      }
      drawRow(row, i % 2 === 1 && !this.model.watermark ? "#f9fbfe" : undefined);
    });
    if (foot) {
      if (this.ensure(foot.height)) drawHead();
      this.page.line(this.x0, this.y, this.x1, this.y, NAVY, 1);
      drawRow(foot, ACCENT);
    }
  }

  /** Columns of figures and codes are as wide as their content; the others share the rest. Null when the text would be too narrow. */
  private widths(columns: Column[], rows: Cell[][], size: number): number[] | null {
    const total = this.x1 - this.x0;
    const pad = 10;
    const natural = columns.map((c, i) => {
      if (c.flex) return 0;
      // A heading takes one line when it is short, otherwise about two.
      const wide = (text: string) => this.lines(text, { size: Math.min(8.4, size), bold: true }, 1000, INK, false).width + 1;
      const head = Math.max(...(this.both ? [c.label.en, c.label.ur] : [this.rtl ? c.label.ur : c.label.en]).map((label) => {
        const full = wide(label);
        return full <= 56 ? full : Math.max(full * 0.56, ...label.split(" ").map(wide));
      }));
      const cells = rows.map((r) => (r[i] ? this.cell({ ...r[i], strong: true } as Cell, size, 1000, c.figure).width : 0));
      return Math.min(Math.max(head, ...cells, 14) + pad, total * 0.4);
    });
    const flex = columns.reduce((sum, c) => sum + (c.flex ?? 0), 0);
    const used = natural.reduce((a, b) => a + b, 0);
    if (flex === 0) {
      if (used > total + 0.5) return null;
      return natural.map((w) => w + (total - used) / columns.length);
    }
    const rest = total - used;
    if (rest < columns.reduce((sum, c) => sum + (c.flex ? 74 * Math.min(1, c.flex) : 0), 0)) return null;
    return columns.map((c, i) => (c.flex ? (rest * c.flex) / flex : natural[i] ?? 0));
  }

  // --- totals -----------------------------------------------------------------------------------------------------

  private totalRows(block: Extract<Block, { type: "totals" }>) {
    const width = Math.min(this.both ? 320 : 270, this.x1 - this.x0);
    const rows = block.rows.map((r) => {
      const size = r.strong ? 10.5 : 9.2;
      const valueWidth = width * (this.both ? 0.44 : 0.52) - 10;
      const labelWidth = this.both ? width * 0.28 - 10 : width - valueWidth - 24;
      const color = r.strong ? NAVY : MUTED;
      const label = this.lines(this.rtl ? r.label.ur : r.label.en, { size: r.strong ? 9.8 : 8.8, bold: r.strong }, labelWidth, color, false);
      const ur = this.both ? this.lines(r.label.ur, { size: r.strong ? 9.8 : 8.8, bold: r.strong }, labelWidth, color, false) : null;
      const value = this.cell({ ...r.value, strong: r.strong || r.value.strong }, size, valueWidth, true);
      const first = (t: Text | null) => t?.lines[0]?.line.ascent ?? 0;
      const ascent = Math.max(first(label), first(ur), first(value));
      const height = Math.max(...[label, ur, value].map((t) => (t ? ascent - first(t) + t.height : 0))) + (r.strong ? 7 : 4);
      return { ...r, text: label, ur, figure: value, ascent, height, first };
    });
    return { width, rows };
  }

  private totalsHeight(block: Extract<Block, { type: "totals" }>): number {
    return this.totalRows(block).rows.reduce((sum, r) => sum + r.height, 0) + 4;
  }

  private totals(block: Extract<Block, { type: "totals" }>) {
    const { width, rows } = this.totalRows(block);
    this.ensure(rows.reduce((sum, r) => sum + r.height, 0) + 4);
    const left = this.rtl ? this.x0 : this.x1 - width;
    const right = left + width;
    const figures = Math.max(...rows.map((r) => r.figure.width));
    for (const r of rows) {
      if (r.strong) this.page.rect(left, this.y, width, r.height, { fill: ACCENT, radius: 4 });
      else if (r.line) this.page.line(left, this.y, right, this.y, LINE, 0.7);
      const top = this.y + (r.strong ? 3.5 : 2) + r.ascent;
      if (this.both) {
        this.draw(r.text, left + 10, right, top - r.first(r.text), "left");
        this.draw(r.figure, left, left + width * 0.7, top - r.first(r.figure), "right");
        if (r.ur) this.draw(r.ur, left, right - 10, top - r.first(r.ur), "right");
      } else {
        this.draw(r.text, left + 10, right - 10, top - r.first(r.text), this.start);
        // Decimals stand under each other, also when the figures are on the left.
        this.draw(r.figure, left + 10, this.rtl ? left + 10 + figures : right - 10, top - r.first(r.figure), "right");
      }
      this.y += r.height;
    }
    this.y += 4;
  }

  // --- other blocks -------------------------------------------------------------------------------------------------

  private fields(block: Extract<Block, { type: "fields" }>) {
    const pad = 11;
    const rows = block.rows.map((r) => this.field(r, this.x1 - this.x0 - pad * 2));
    const height = rows.reduce((sum, r) => sum + r.height + 6, 0) + pad * 2 - 6;
    if (block.title) this.heading(block.title, height);
    else this.ensure(height);
    this.page.rect(this.x0, this.y, this.x1 - this.x0, height, { stroke: LINE, lineWidth: 0.7, radius: 7 });
    let y = this.y + pad;
    rows.forEach((row, i) => {
      row.draw(this.x0 + pad, this.x1 - pad, y);
      y += row.height + 6;
      if (i < rows.length - 1) this.page.line(this.x0 + pad, y - 3, this.x1 - pad, y - 3, "#e9eef6", 0.5);
    });
    this.y += height;
  }

  private statement(block: Extract<Block, { type: "statement" }>) {
    const pad = 10;
    const width = this.x1 - this.x0;
    // One column of amounts for the whole statement.
    const amounts = Math.max(...block.sections.flatMap((x) => [...x.rows.map((r) => this.cell(r.value, 9.2, 150, true).width), x.total ? this.cell({ ...x.total.value, strong: true }, 10, 150, true).width : 0]));
    const row = (label: Value, code: string | null | undefined, value: Cell, strong: boolean) => {
      const figure = this.cell({ ...value, strong }, strong ? 10 : 9.2, 150, true);
      const color = strong ? NAVY : INK;
      const text = this.value(label, { size: strong ? 10 : 9.2, bold: strong }, width - 150 - pad * 2 - 60, color, false, "inline");
      const number = code ? this.lines(code, { size: 8, tabular: true }, 60, MUTED, true) : null;
      const ascent = Math.max(text.lines[0]?.line.ascent ?? 0, figure.lines[0]?.line.ascent ?? 0);
      const height = Math.max(ascent - (text.lines[0]?.line.ascent ?? 0) + text.height, ascent - (figure.lines[0]?.line.ascent ?? 0) + figure.height) + (strong ? 9 : 5);
      return {
        height,
        draw: (fill?: Color) => {
          if (fill) this.page.rect(this.x0, this.y, width, height, { fill, radius: 4 });
          const base = this.y + (strong ? 4.5 : 2.5) + ascent;
          const indent = strong ? pad : pad + 8;
          const codeRoom = 46;
          const first = text.lines[0]?.line.ascent ?? 0;
          if (number) this.draw(number, this.x0 + indent, this.x1 - indent, base - (number.lines[0]?.line.ascent ?? 0), this.start);
          const shift = number ? codeRoom : 0;
          this.draw(text, this.rtl ? this.x0 : this.x0 + indent + shift, this.rtl ? this.x1 - indent - shift : this.x1, base - first, this.start);
          // Amounts form one column at the end of the page, decimals under each other.
          this.draw(figure, this.x0 + pad, this.rtl ? this.x0 + pad + amounts : this.x1 - pad, base - (figure.lines[0]?.line.ascent ?? 0), "right");
          this.y += height;
        },
      };
    };
    for (const section of block.sections) {
      const body = section.rows.map((r) => row(r.label, r.code, r.value, false));
      const total = section.total ? row(section.total.label, null, section.total.value, true) : null;
      if (section.title && body.length) {
        const title = this.value(section.title, { size: 9.6, bold: true }, width - pad * 2, PRIMARY, false, "inline");
        this.ensure(title.height + 4 + (body[0]?.height ?? 0));
        this.y = this.draw(title, this.x0 + pad, this.x1 - pad, this.y + 4, this.start) + 1;
      }
      body.forEach((r, i) => {
        // The total stays with the last line.
        this.ensure(r.height + (i === body.length - 1 ? total?.height ?? 0 : 0));
        r.draw();
      });
      if (total) {
        this.ensure(total.height);
        if (body.length) this.page.line(this.x0 + pad, this.y, this.x1 - pad, this.y, LINE, 0.6);
        total.draw(section.strong ? ACCENT : undefined);
      }
      this.y += 4;
    }
  }

  private paragraph(block: Extract<Block, { type: "text" }>) {
    const text = this.value(block.text, { size: 9.2 }, this.x1 - this.x0, INK);
    if (block.title) this.heading(block.title, Math.min(text.height, 60));
    for (const { line, color } of text.lines) {
      this.ensure(line.ascent + line.descent);
      this.y += line.ascent;
      this.page.text(line, this.rtl ? this.x1 - line.width : this.x0, this.y, color);
      this.y += line.descent;
    }
  }

  private signatures() {
    const labels = this.model.signatures ?? [];
    if (!labels.length) return;
    const gap = 26;
    const width = (this.x1 - this.x0 - gap * (labels.length - 1)) / labels.length;
    const texts = labels.map((l) => this.value(l, { size: 8.4 }, width, MUTED, false, "inline"));
    const height = 34 + Math.max(...texts.map((t) => t.height)) + 4;
    this.ensure(height);
    // Lower down when there is room.
    this.y = Math.max(this.y, Math.min(this.bottom - height, this.y + 80));
    labels.forEach((_, i) => {
      const index = this.rtl ? labels.length - 1 - i : i;
      const left = this.x0 + index * (width + gap);
      this.page.line(left, this.y + 32, left + width, this.y + 32, MUTED, 0.7);
      const text = texts[i];
      if (text) this.draw(text, left, left + width, this.y + 35, "center");
    });
    this.y += height;
  }

  /** Page numbers and origin, once the number of pages is known. */
  footers(from: number) {
    const { words, letterhead } = this.options;
    const pages = this.pdf.pages.slice(from);
    const fill = (text: string, page: number) => text.replace("{page}", `⁦${page}⁩`).replace("{pages}", `⁦${pages.length}⁩`);
    pages.forEach((page, i) => {
      this.page = page;
      const x1 = page.width - MARGIN;
      const top = page.height - FOOTER + 12;
      page.line(MARGIN, top, x1, top, LINE, 0.6);
      const size = { size: 7.6 };
      const number = this.value({ en: fill(words.page.en, i + 1), ur: fill(words.page.ur, i + 1) }, size, 170, MUTED, false, "inline");
      this.draw(number, MARGIN, x1, top + 4, this.end);
      const origin = this.lines(this.rtl ? words.printed.ur : words.printed.en, size, x1 - MARGIN - number.width - 14, MUTED, false);
      this.draw(origin, MARGIN, x1, top + 4, this.start);
      void letterhead;
    });
  }
}

function stack(parts: Text[]): Text {
  return { lines: parts.flatMap((p) => p.lines), height: parts.reduce((sum, p) => sum + p.height, 0), width: Math.max(0, ...parts.map((p) => p.width)) };
}

/** A PDF of one or more documents, each starting on a new page with its own page numbers. */
export function renderPdf(models: readonly DocModel[], options: RenderOptions): Uint8Array {
  const pdf = new PdfDocument({ title: options.title, author: options.letterhead.name, creator: `${options.letterhead.name} DMS`, language: options.language === "ur" ? "ur-PK" : "en-PK", created: options.created });
  const renderer = new Renderer(pdf, options);
  for (const model of models) {
    const from = pdf.pages.length;
    renderer.render(model);
    renderer.footers(from);
  }
  return pdf.save();
}
