import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { fontFace, type FontKey } from "./fonts";
import type { Cluster } from "./shape";
import { layoutText, type Direction, type Line, type Piece, type TextStyle } from "./text";
import { concat, subsetTrueType, type Composite } from "./truetype";

/** "#14284f" */
export type Color = `#${string}`;

const rgb = (color: Color) => [1, 3, 5].map((i) => num(parseInt(color.slice(i, i + 2), 16) / 255)).join(" ");
const num = (value: number) => {
  const text = value.toFixed(3).replace(/\.?0+$/, "");
  return text === "-0" ? "0" : text;
};
const utf16 = (text: string) => {
  let hex = "";
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, "0");
  return hex.toUpperCase();
};
const textString = (text: string) => `<FEFF${utf16(text)}>`;

type Entry = { id: number; text: string } | { letter: Composite; text: string };

/**
 * One embedded face. A code stands for a glyph and the characters it shows. An Urdu letter is put together from the glyphs of
 * the font exactly as HarfBuzz placed them (Nastaliq draws its dots apart and lets letters step down along the word), so that
 * it is one unit on a straight line: readers can then search, select and copy the text.
 */
class EmbeddedFont {
  private codes = new Map<string, number>();
  readonly entries: Entry[] = [{ id: 0, text: "" }];
  constructor(readonly key: FontKey, readonly name: string) {}
  private code(key: string, entry: () => Entry): number {
    let code = this.codes.get(key);
    if (code === undefined) {
      code = this.entries.length;
      this.codes.set(key, code);
      this.entries.push(entry());
    }
    return code;
  }
  glyph(id: number, text: string): number {
    return this.code(`${id}|${text}`, () => ({ id, text }));
  }
  letter(cluster: Cluster): number {
    const { parts, advance, text } = cluster;
    return this.code(`${parts.map((p) => `${p.id},${p.x},${p.y}`).join(";")}|${advance}|${text}`, () => ({ letter: { parts, advance: Math.max(0, advance) }, text }));
  }
}

/** A page. Coordinates are points from the top left corner. */
export class Page {
  readonly content: string[] = [];
  constructor(private pdf: PdfDocument, readonly width: number, readonly height: number) {}

  private y = (y: number) => num(this.height - y);

  rect(x: number, y: number, width: number, height: number, options: { fill?: Color; stroke?: Color; lineWidth?: number; radius?: number }) {
    const { fill, stroke, lineWidth = 0.6, radius = 0 } = options;
    const r = Math.min(radius, width / 2, height / 2);
    const path: string[] = [];
    if (r <= 0) path.push(`${num(x)} ${this.y(y + height)} ${num(width)} ${num(height)} re`);
    else {
      const k = r * 0.5523;
      const [l, t, rt, b] = [x, y, x + width, y + height];
      path.push(
        `${num(l + r)} ${this.y(t)} m`, `${num(rt - r)} ${this.y(t)} l`, `${num(rt - r + k)} ${this.y(t)} ${num(rt)} ${this.y(t + r - k)} ${num(rt)} ${this.y(t + r)} c`,
        `${num(rt)} ${this.y(b - r)} l`, `${num(rt)} ${this.y(b - r + k)} ${num(rt - r + k)} ${this.y(b)} ${num(rt - r)} ${this.y(b)} c`,
        `${num(l + r)} ${this.y(b)} l`, `${num(l + r - k)} ${this.y(b)} ${num(l)} ${this.y(b - r + k)} ${num(l)} ${this.y(b - r)} c`,
        `${num(l)} ${this.y(t + r)} l`, `${num(l)} ${this.y(t + r - k)} ${num(l + r - k)} ${this.y(t)} ${num(l + r)} ${this.y(t)} c h`,
      );
    }
    this.content.push("q", ...(fill ? [`${rgb(fill)} rg`] : []), ...(stroke ? [`${rgb(stroke)} RG ${num(lineWidth)} w`] : []), ...path, fill && stroke ? "B" : fill ? "f" : "S", "Q");
  }

  line(x1: number, y1: number, x2: number, y2: number, color: Color, width = 0.6, dash?: number[]) {
    this.content.push("q", `${rgb(color)} RG ${num(width)} w${dash ? ` [${dash.map(num).join(" ")}] 0 d` : ""}`, `${num(x1)} ${this.y(y1)} m ${num(x2)} ${this.y(y2)} l S`, "Q");
  }

  /** Draws a laid out line with its left edge at `x`. */
  text(line: Line, x: number, baseline: number, color: Color) {
    for (const piece of line.pieces) this.content.push(...this.piece(piece, x + piece.x, this.height - baseline, color));
  }

  private piece(piece: Piece, x: number, y: number, color: Color): string[] {
    const face = fontFace(piece.font);
    const font = this.pdf.embed(piece.font);
    const hex = (code: number) => code.toString(16).padStart(4, "0").toUpperCase();
    const urdu = piece.font === "urdu" || piece.font === "urduBold";
    const codes: { code: number; x: number; advance: number }[] = urdu
      ? piece.clusters.map((c) => ({ code: font.letter(c), x: c.x, advance: Math.max(0, c.advance) }))
      : piece.clusters.flatMap((c) => c.parts.map((p, i) => ({ code: font.glyph(p.id, i === 0 ? c.text : ""), x: c.x + p.x, advance: face.font.glyphHAdvance(p.id) })));
    // One array, corrected where a glyph does not begin at the end of the one before.
    let pen = 0;
    const parts: string[] = [];
    for (const c of codes) {
      if (Math.abs(c.x - pen) > 0.5) parts.push(num(((pen - c.x) * 1000) / face.unitsPerEm));
      parts.push(`<${hex(c.code)}>`);
      pen = c.x + c.advance;
    }
    return [`BT /${font.name} ${num(piece.size)} Tf ${rgb(color)} rg 1 0 0 1 ${num(x)} ${num(y)} Tm [${parts.join("")}] TJ ET`];
  }

  /** Large pale text across the page, behind what is drawn afterwards. */
  watermark(text: string, base: Direction, color: Color) {
    const style: TextStyle = { size: 92, bold: true };
    let line = layoutText(text, style, 5000, base)[0];
    if (!line) return;
    const room = Math.hypot(this.width, this.height) * 0.62;
    if (line.width > room) line = layoutText(text, { ...style, size: (style.size * room) / line.width }, 5000, base)[0] ?? line;
    const angle = Math.atan2(this.height, this.width);
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    this.content.push("/Artifact BMC", "q", `${num(c)} ${num(s)} ${num(-s)} ${num(c)} ${num(this.width / 2)} ${num(this.height / 2)} cm`);
    const middle = (line.ascent - line.descent) / 2;
    for (const piece of line.pieces) {
      this.content.push(...this.piece(piece, piece.x - line.width / 2, -middle, color));
    }
    this.content.push("Q", "EMC");
  }
}

export interface PdfInfo { title: string; author: string; creator: string; language: string; created: Date }

/** A PDF 1.7 file with embedded, subset fonts. */
export class PdfDocument {
  readonly pages: Page[] = [];
  private fonts = new Map<FontKey, EmbeddedFont>();
  constructor(private info: PdfInfo) {}

  embed(key: FontKey): EmbeddedFont {
    let font = this.fonts.get(key);
    if (!font) {
      font = new EmbeddedFont(key, `F${this.fonts.size + 1}`);
      this.fonts.set(key, font);
    }
    return font;
  }

  addPage(width: number, height: number): Page {
    const page = new Page(this, width, height);
    this.pages.push(page);
    return page;
  }

  save(): Uint8Array {
    const encoder = new TextEncoder();
    const objects: Uint8Array[] = [];
    const reserve = () => objects.push(new Uint8Array(0));
    const set = (id: number, body: string | Uint8Array) => { objects[id - 1] = typeof body === "string" ? encoder.encode(body) : body; };
    const add = (body: string | Uint8Array) => { const id = reserve(); set(id, body); return id; };
    const stream = (data: Uint8Array, extra = "", compress = true) => {
      const body = compress ? new Uint8Array(deflateSync(data, { level: 9 })) : data;
      return add(concat([encoder.encode(`<<${extra}${compress ? " /Filter /FlateDecode" : ""} /Length ${body.length}>>\nstream\n`), body, encoder.encode("\nendstream")]));
    };

    const catalog = reserve();
    const tree = reserve();
    const fontIds = [...this.fonts.values()].map((font) => `/${font.name} ${this.writeFont(font, add, stream)} 0 R`);
    const resources = add(`<</Font <<${fontIds.join(" ")}>> /ProcSet [/PDF /Text]>>`);
    const kids = this.pages.map((page) => {
      const content = stream(encoder.encode(page.content.join("\n")));
      return add(`<</Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Resources ${resources} 0 R /Contents ${content} 0 R>>`);
    });
    set(tree, `<</Type /Pages /Count ${kids.length} /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}]>>`);

    const { title, author, creator, language, created } = this.info;
    const stamp = created.toISOString();
    const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const meta = stream(encoder.encode(
      `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xml(title)}</rdf:li></rdf:Alt></dc:title><dc:creator><rdf:Seq><rdf:li>${xml(author)}</rdf:li></rdf:Seq></dc:creator><dc:language><rdf:Bag><rdf:li>${language}</rdf:li></rdf:Bag></dc:language><xmp:CreatorTool>${xml(creator)}</xmp:CreatorTool><xmp:CreateDate>${stamp}</xmp:CreateDate></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`
    ), " /Type /Metadata /Subtype /XML", false);
    set(catalog, `<</Type /Catalog /Pages ${tree} 0 R /Lang (${language}) /Metadata ${meta} 0 R /ViewerPreferences <</DisplayDocTitle true /PrintScaling /None>>>>`);
    const pdfDate = `D:${stamp.replace(/[-:T]/g, "").slice(0, 14)}Z`;
    const info = add(`<</Title ${textString(title)} /Author ${textString(author)} /Creator ${textString(creator)} /Producer ${textString(creator)} /CreationDate (${pdfDate})>>`);

    const parts: Uint8Array[] = [concat([encoder.encode("%PDF-1.7\n%"), new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3, 0x0a])])];
    let offset = parts[0]?.length ?? 0;
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      const object = concat([encoder.encode(`${i + 1} 0 obj\n`), body, encoder.encode("\nendobj\n")]);
      offsets.push(offset);
      parts.push(object);
      offset += object.length;
    });
    const id = createHash("sha256").update(title).update(stamp).digest("hex").slice(0, 32).toUpperCase();
    parts.push(encoder.encode(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`
      + `trailer\n<</Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R /ID [<${id}> <${id}>]>>\nstartxref\n${offset}\n%%EOF\n`
    ));
    return concat(parts);
  }

  private writeFont(font: EmbeddedFont, add: (body: string) => number, stream: (data: Uint8Array, extra?: string) => number): number {
    const face = fontFace(font.key);
    const scale = 1000 / face.unitsPerEm;
    const letters = font.entries.flatMap((e) => ("letter" in e ? [e.letter] : []));
    const { file, glyph, composite } = subsetTrueType(face.data, font.entries.flatMap((e) => ("id" in e ? [e.id] : [])), letters);
    const tag = createHash("sha256").update(file).digest("hex").slice(0, 6).split("").map((c) => String.fromCharCode(65 + parseInt(c, 16))).join("");
    const name = `${tag}+${{ sans: "Geist-Regular", sansBold: "Geist-SemiBold", urdu: "NotoNastaliqUrdu-Regular", urduBold: "NotoNastaliqUrdu-Bold", heading: "Marcellus-Regular" }[font.key]}`;
    const head = new DataView(face.data.buffer, face.data.byteOffset);
    const box = (() => {
      for (let i = 0; i < head.getUint16(4); i++) {
        const at = 12 + i * 16;
        if (head.getUint32(at) === 0x68656164) { const t = head.getUint32(at + 8); return [36, 38, 40, 42].map((o) => Math.round(head.getInt16(t + o) * scale)); }
      }
      return [0, 0, 1000, 1000];
    })();
    const fileId = stream(file, ` /Length1 ${file.length}`);
    const descriptor = add(
      `<</Type /FontDescriptor /FontName /${name} /Flags 4 /FontBBox [${box.join(" ")}] /ItalicAngle 0 /Ascent ${Math.round(face.ascent * scale)} /Descent ${Math.round(face.descent * scale)} /CapHeight 700 /StemV ${font.key.endsWith("Bold") ? 120 : 80} /FontFile2 ${fileId} 0 R>>`
    );
    const map = new Uint8Array(font.entries.length * 2);
    let next = 0;
    font.entries.forEach((e, i) => {
      const gid = "letter" in e ? composite(next++) : glyph(e.id);
      map[i * 2] = gid >> 8;
      map[i * 2 + 1] = gid & 255;
    });
    const mapId = stream(map);
    const widths = font.entries.map((e) => num(("letter" in e ? e.letter.advance : face.font.glyphHAdvance(e.id)) * scale)).join(" ");
    const cid = add(
      `<</Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo <</Registry (Adobe) /Ordering (Identity) /Supplement 0>> /FontDescriptor ${descriptor} 0 R /DW 0 /W [0 [${widths}]] /CIDToGIDMap ${mapId} 0 R>>`
    );
    const mapped = font.entries.map((e, code) => ({ code, text: e.text })).filter((g) => g.code > 0 && g.text !== "");
    const blocks: string[] = [];
    for (let i = 0; i < mapped.length; i += 100) {
      const chunk = mapped.slice(i, i + 100);
      blocks.push(`${chunk.length} beginbfchar`, ...chunk.map((g) => `<${g.code.toString(16).padStart(4, "0").toUpperCase()}> <${utf16(g.text)}>`), "endbfchar");
    }
    const unicode = stream(new TextEncoder().encode(
      `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo <</Registry (Adobe) /Ordering (UCS) /Supplement 0>> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${blocks.join("\n")}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`
    ));
    return add(`<</Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${unicode} 0 R>>`);
  }
}
