import { tableOffset } from "./fonts";

/** Tables a PDF reader needs to draw glyphs by number. */
const KEPT = ["cvt ", "fpgm", "glyf", "head", "hhea", "hmtx", "loca", "maxp", "prep"];

/** A word drawn as one glyph: glyphs of the font at the places the shaper gave them, in font units. */
export interface Composite {
  parts: { id: number; x: number; y: number }[];
  advance: number;
}

export interface Subset {
  file: Uint8Array;
  /** New number of a glyph of the font. */
  glyph: (id: number) => number;
  /** New number of a composite, by its place in the list. */
  composite: (index: number) => number;
}

/**
 * The outlines of the used glyphs only, renumbered, followed by the composites. Glyphs made of other glyphs bring their parts along.
 */
export function subsetTrueType(data: Uint8Array, used: Iterable<number>, composites: readonly Composite[]): Subset {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const at = (tag: string) => tableOffset(view, tag);
  const length = (tag: string) => {
    const count = view.getUint16(4);
    for (let i = 0; i < count; i++) if (view.getUint32(12 + i * 16 + 8) === at(tag)) return view.getUint32(12 + i * 16 + 12);
    return 0;
  };
  const loca = at("loca");
  const glyf = at("glyf");
  const long = view.getInt16(at("head") + 50) === 1;
  const total = view.getUint16(at("maxp") + 4);
  const range = (gid: number): [number, number] => long
    ? [view.getUint32(loca + gid * 4), view.getUint32(loca + gid * 4 + 4)]
    : [view.getUint16(loca + gid * 2) * 2, view.getUint16(loca + gid * 2 + 2) * 2];
  /** Places of the glyph numbers inside a composite glyph of the font. */
  const references = (gid: number): number[] => {
    const [from, to] = range(gid);
    if (to - from < 10 || view.getInt16(glyf + from) >= 0) return [];
    const places: number[] = [];
    // Flags, glyph number, then 2 or 4 bytes of offsets and 0 to 8 of scale.
    for (let p = glyf + from + 10; ;) {
      const flags = view.getUint16(p);
      places.push(p + 2);
      p += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
      if (!(flags & 0x20)) return places;
    }
  };

  const keep = new Set<number>([0]);
  const queue = [...used, ...composites.flatMap((c) => c.parts.map((p) => p.id))].filter((g) => g < total);
  for (let gid = queue.pop(); gid !== undefined; gid = queue.pop()) {
    if (keep.has(gid)) continue;
    keep.add(gid);
    queue.push(...references(gid).map((p) => view.getUint16(p)));
  }
  const old = [...keep].sort((x, y) => x - y);
  const renumbered = new Map(old.map((gid, i) => [gid, i]));
  const glyph = (id: number) => renumbered.get(id) ?? 0;

  const count = old.length + composites.length;
  const newLoca = new Uint8Array((count + 1) * 4);
  const locaView = new DataView(newLoca.buffer);
  const newHmtx = new Uint8Array(count * 4);
  const hmtxView = new DataView(newHmtx.buffer);
  const outlines: Uint8Array[] = [];
  let size = 0;
  const push = (index: number, outline: Uint8Array, advance: number, bearing: number) => {
    locaView.setUint32(index * 4, size);
    hmtxView.setUint16(index * 4, advance);
    hmtxView.setInt16(index * 4 + 2, bearing);
    const padded = new Uint8Array((outline.length + 3) & ~3);
    padded.set(outline);
    outlines.push(padded);
    size += padded.length;
  };

  const metrics = view.getUint16(at("hhea") + 34);
  const hmtx = at("hmtx");
  old.forEach((gid, i) => {
    const [from, to] = range(gid);
    const outline = data.slice(glyf + from, glyf + to);
    const out = new DataView(outline.buffer);
    for (const place of references(gid)) out.setUint16(place - glyf - from, glyph(view.getUint16(place)));
    const bearing = gid < metrics ? view.getInt16(hmtx + gid * 4 + 2) : view.getInt16(hmtx + metrics * 4 + (gid - metrics) * 2);
    push(i, outline, view.getUint16(hmtx + Math.min(gid, metrics - 1) * 4), bearing);
  });
  let mostParts = 1;
  composites.forEach((c, i) => {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    const drawn = c.parts.filter((p) => { const [from, to] = range(p.id); return to - from >= 10; });
    for (const p of drawn) {
      const g = glyf + range(p.id)[0];
      box[0] = Math.min(box[0] ?? 0, view.getInt16(g + 2) + p.x);
      box[1] = Math.min(box[1] ?? 0, view.getInt16(g + 4) + p.y);
      box[2] = Math.max(box[2] ?? 0, view.getInt16(g + 6) + p.x);
      box[3] = Math.max(box[3] ?? 0, view.getInt16(g + 8) + p.y);
    }
    const outline = new Uint8Array(drawn.length ? 10 + drawn.length * 8 : 0);
    const out = new DataView(outline.buffer);
    if (drawn.length) {
      out.setInt16(0, -1);
      box.forEach((v, n) => out.setInt16(2 + n * 2, Math.round(v)));
      drawn.forEach((p, n) => {
        // Offsets are words, are x and y, are not scaled; another part follows.
        out.setUint16(10 + n * 8, 0x1003 | (n < drawn.length - 1 ? 0x20 : 0));
        out.setUint16(12 + n * 8, glyph(p.id));
        out.setInt16(14 + n * 8, Math.round(p.x));
        out.setInt16(16 + n * 8, Math.round(p.y));
      });
      mostParts = Math.max(mostParts, drawn.length);
    }
    // The bearing must be the left edge of the box, or readers shift the word.
    push(old.length + i, outline, Math.round(c.advance), drawn.length ? Math.round(box[0] ?? 0) : 0);
  });
  locaView.setUint32(count * 4, size);

  const copy = (tag: string) => data.slice(at(tag), at(tag) + length(tag));
  const newHead = copy("head");
  const headView = new DataView(newHead.buffer);
  headView.setUint32(8, 0);
  headView.setInt16(50, 1);
  const newHhea = copy("hhea");
  new DataView(newHhea.buffer).setUint16(34, count);
  const newMaxp = copy("maxp");
  const maxpView = new DataView(newMaxp.buffer);
  maxpView.setUint16(4, count);
  if (composites.length && newMaxp.length >= 32) {
    maxpView.setUint16(10, 0xffff);
    maxpView.setUint16(12, 0xffff);
    maxpView.setUint16(28, Math.max(maxpView.getUint16(28), mostParts));
    maxpView.setUint16(30, Math.max(maxpView.getUint16(30), 1) + 1);
  }
  const tables: Record<string, Uint8Array> = { glyf: size ? concat(outlines) : new Uint8Array(4), head: newHead, hhea: newHhea, hmtx: newHmtx, loca: newLoca, maxp: newMaxp };
  for (const tag of ["cvt ", "fpgm", "prep"]) if (at(tag) >= 0) tables[tag] = copy(tag);
  const file = assemble(tables);
  const fileView = new DataView(file.buffer);
  fileView.setUint32(tableOffset(fileView, "head") + 8, (0xb1b0afba - checksum(file)) >>> 0);
  return { file, glyph, composite: (index) => old.length + index };
}

function assemble(tables: Record<string, Uint8Array>): Uint8Array {
  const tags = KEPT.filter((t) => tables[t]).sort();
  const power = Math.floor(Math.log2(tags.length));
  const header = new Uint8Array(12 + tags.length * 16);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, tags.length);
  view.setUint16(6, 16 << power);
  view.setUint16(8, power);
  view.setUint16(10, tags.length * 16 - (16 << power));
  const parts: Uint8Array[] = [header];
  let offset = header.length;
  tags.forEach((tag, i) => {
    const table = tables[tag] ?? new Uint8Array(0);
    const padded = new Uint8Array((table.length + 3) & ~3);
    padded.set(table);
    const record = 12 + i * 16;
    for (let c = 0; c < 4; c++) view.setUint8(record + c, tag.charCodeAt(c));
    view.setUint32(record + 4, checksum(padded));
    view.setUint32(record + 8, offset);
    view.setUint32(record + 12, table.length);
    parts.push(padded);
    offset += padded.length;
  });
  return concat(parts);
}

function checksum(data: Uint8Array): number {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let sum = 0;
  for (let i = 0; i + 3 < data.length; i += 4) sum = (sum + view.getUint32(i)) >>> 0;
  return sum;
}

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
