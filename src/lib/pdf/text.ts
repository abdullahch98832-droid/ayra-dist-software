import bidiFactory from "bidi-js";
import { fontFace, type FontKey } from "./fonts";
import { shape, type Cluster } from "./shape";

const bidi = bidiFactory();

export type Direction = "ltr" | "rtl";

export interface TextStyle {
  size: number;
  bold?: boolean;
  /** Marcellus, for the wordmark. Urdu text stays in Nastaliq. */
  heading?: boolean;
  /** Digits of equal width, for columns of figures. */
  tabular?: boolean;
}

/** A shaped piece of a line. `x` is its left edge from the left edge of the line. */
export interface Piece {
  font: FontKey;
  size: number;
  x: number;
  width: number;
  text: string;
  rtl: boolean;
  clusters: Cluster[];
}

export interface Line {
  width: number;
  ascent: number;
  descent: number;
  /** In visual order, left to right. */
  pieces: Piece[];
}

/** Nastaliq is drawn small on its body; this brings it level with Geist. */
const URDU_SCALE = 1.13;

const isUrdu = (code: number) =>
  (code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f) || (code >= 0x08a0 && code <= 0x08ff)
  || (code >= 0xfb50 && code <= 0xfdff) || (code >= 0xfe70 && code <= 0xfefc) || code === 0x200c || code === 0x200d;
/** Characters that steer the bidi algorithm and draw nothing. */
const isControl = (code: number) => (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069) || code === 0x200e || code === 0x200f || code === 0x061c || code === 0xfeff;
const isSpace = (code: number) => code === 0x20 || code === 0x09 || code === 0xa0 || code === 0x202f;
const isStrongLatin = (code: number) => (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || (code >= 0xc0 && code <= 0x24f);

/** Largest part of a word of one direction and one face. */
interface Item {
  start: number;
  end: number;
  level: number;
  urdu: boolean;
  space: boolean;
  word: number;
}

function itemize(text: string, levels: Uint8Array): Item[] {
  // Which face each character belongs to; punctuation follows the letters before it, or else those after it.
  const urdu: (boolean | null)[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    urdu.push(isUrdu(code) ? true : isStrongLatin(code) || code > 0x24f ? false : null);
  }
  let before: boolean | null = null;
  for (let i = 0; i < text.length; i++) {
    if (isSpace(text.charCodeAt(i))) { before = null; continue; }
    if (urdu[i] === null || urdu[i] === undefined) urdu[i] = before;
    before = urdu[i] ?? null;
  }
  let after: boolean | null = null;
  for (let i = text.length - 1; i >= 0; i--) {
    if (isSpace(text.charCodeAt(i))) { after = null; continue; }
    if (urdu[i] === null || urdu[i] === undefined) urdu[i] = after ?? false;
    after = urdu[i] ?? null;
  }

  // Between two Urdu words stands the space of Nastaliq.
  const around = (i: number, step: 1 | -1) => {
    let j = i;
    while (j >= 0 && j < text.length && (isSpace(text.charCodeAt(j)) || isControl(text.charCodeAt(j)))) j += step;
    return urdu[j] === true;
  };
  const items: Item[] = [];
  let word = 0;
  let last: Item | undefined;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isControl(code)) { last = undefined; continue; }
    const space = isSpace(code);
    const level = levels[i] ?? 0;
    const face = space ? around(i, -1) && around(i, 1) : urdu[i] ?? false;
    if (last && last.space === space && !space && last.level === level && last.urdu === face && last.end === i) {
      last.end = i + 1;
      continue;
    }
    if (space || items.at(-1)?.space) word++;
    last = { start: i, end: i + 1, level, urdu: face, space, word };
    items.push(last);
  }
  return items;
}

const faceOf = (style: TextStyle, urdu: boolean): FontKey => (urdu ? (style.bold ? "urduBold" : "urdu") : style.heading ? "heading" : style.bold ? "sansBold" : "sans");

function measure(text: string, style: TextStyle, item: Item) {
  const key = faceOf(style, item.urdu);
  const size = item.urdu ? style.size * URDU_SCALE : style.size;
  const shaped = shape(key, text, item.level % 2 === 1, style.tabular && !item.urdu);
  return { key, size, shaped, width: (shaped.width / fontFace(key).unitsPerEm) * size };
}

/** The order in which a line is drawn from left to right (rule L2 of the Unicode bidi algorithm). */
function visualOrder(items: Item[]): Item[] {
  const line = [...items];
  const highest = Math.max(0, ...line.map((i) => i.level));
  for (let level = highest; level > 0; level--) {
    for (let i = 0; i < line.length; i++) {
      if ((line[i]?.level ?? 0) < level) continue;
      let j = i;
      while (j + 1 < line.length && (line[j + 1]?.level ?? 0) >= level) j++;
      line.splice(i, j - i + 1, ...line.slice(i, j + 1).reverse());
      i = j;
    }
  }
  return line;
}

function buildLine(text: string, items: Item[], style: TextStyle, baseLevel: number): Line {
  let from = 0;
  let to = items.length;
  while (to > from && items[to - 1]?.space) to--;
  while (from < to && items[from]?.space) from++;
  const visible = items.slice(from, to);
  const pieces: Piece[] = [];
  let x = 0;
  // A line of Geist always has the same height; Nastaliq takes what its letters need.
  let ascent = style.size * 0.96;
  let descent = style.size * 0.3;
  // Spaces take the base direction, so that they separate words and never join a number to the wrong side.
  void baseLevel;
  for (const item of visualOrder(visible)) {
    const part = text.slice(item.start, item.end).replace(/[\t  ]/g, " ");
    const { key, size, shaped, width } = measure(part, style, item);
    const unit = size / fontFace(key).unitsPerEm;
    if (item.urdu) {
      ascent = Math.max(ascent, size * 0.98, shaped.top * unit + size * 0.07);
      descent = Math.max(descent, size * 0.44, -shaped.bottom * unit + size * 0.07);
    }
    pieces.push({ font: key, size, x, width, text: part, rtl: item.level % 2 === 1, clusters: shaped.clusters });
    x += width;
  }
  return { width: x, ascent, descent, pieces };
}

/** Parts of a word that is wider than the line, at the widths that fit. */
function splitWord(text: string, item: Item, style: TextStyle, maxWidth: number): Item[] {
  const parts: Item[] = [];
  let start = item.start;
  while (start < item.end) {
    let end = item.end;
    while (end > start + 1 && measure(text.slice(start, end), style, item).width > maxWidth) end--;
    parts.push({ ...item, start, end });
    start = end;
  }
  return parts;
}

/**
 * Lines of a text inside a width. The base direction decides where mixed text starts; the Unicode bidi
 * algorithm orders it and HarfBuzz joins the letters.
 */
export function layoutText(text: string, style: TextStyle, maxWidth: number, base: Direction | "auto"): Line[] {
  const lines: Line[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    const { levels, paragraphs } = bidi.getEmbeddingLevels(paragraph, base);
    const baseLevel = paragraphs[0]?.level ?? (base === "rtl" ? 1 : 0);
    const items = itemize(paragraph, levels);
    let line: Item[] = [];
    let width = 0;
    const flush = () => {
      if (line.some((i) => !i.space)) lines.push(buildLine(paragraph, line, style, baseLevel));
      line = [];
      width = 0;
    };
    for (let i = 0; i < items.length;) {
      const first = items[i];
      if (!first) break;
      let j = i;
      while (j < items.length && items[j]?.word === first.word) j++;
      const word = items.slice(i, j);
      const widths = word.map((w) => measure(paragraph.slice(w.start, w.end).replace(/[\t  ]/g, " "), style, w).width);
      const total = widths.reduce((a, b) => a + b, 0);
      if (first.space) {
        line.push(...word);
        width += total;
      } else if (width + total <= maxWidth + 0.01) {
        line.push(...word);
        width += total;
      } else if (total <= maxWidth + 0.01) {
        flush();
        line.push(...word);
        width = total;
      } else {
        if (line.length) flush();
        for (const part of word.flatMap((w) => splitWord(paragraph, w, style, maxWidth))) {
          const w = measure(paragraph.slice(part.start, part.end), style, part).width;
          if (width + w > maxWidth + 0.01) flush();
          line.push(part);
          width += w;
        }
      }
      i = j;
    }
    flush();
  }
  if (lines.length === 0) lines.push({ width: 0, ascent: style.size * 0.96, descent: style.size * 0.3, pieces: [] });
  return lines;
}

/** Two lines on one baseline: the second `gap` after the first, or at the far edge of `width`. */
export function joinLines(a: Line, b: Line, gap: number, width?: number): Line {
  const shift = width === undefined ? a.width + gap : Math.max(a.width + gap, width - b.width);
  return { width: shift + b.width, ascent: Math.max(a.ascent, b.ascent), descent: Math.max(a.descent, b.descent), pieces: [...a.pieces, ...b.pieces.map((p) => ({ ...p, x: p.x + shift }))] };
}

export const linesHeight = (lines: readonly Line[]) => lines.reduce((sum, l) => sum + l.ascent + l.descent, 0);
export const linesWidth = (lines: readonly Line[]) => Math.max(0, ...lines.map((l) => l.width));
