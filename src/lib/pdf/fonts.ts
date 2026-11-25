import { readFileSync } from "node:fs";
import path from "node:path";
import * as hb from "harfbuzzjs";

/** Faces of the documents, embedded in every PDF that uses them. Licences are beside the files. */
const FILES = {
  sans: "Geist-Regular.ttf",
  sansBold: "Geist-SemiBold.ttf",
  urdu: "NotoNastaliqUrdu-Regular.ttf",
  urduBold: "NotoNastaliqUrdu-Bold.ttf",
  heading: "Marcellus-Regular.ttf",
} as const;

export type FontKey = keyof typeof FILES;

export interface FontFace {
  key: FontKey;
  data: Uint8Array;
  font: hb.Font;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  glyphCount: number;
}

const loaded = new Map<FontKey, FontFace>();

/** A face, read once per process. */
export function fontFace(key: FontKey): FontFace {
  const known = loaded.get(key);
  if (known) return known;
  const file = readFileSync(path.join(/* turbopackIgnore: true */ process.cwd(), "src/lib/pdf/fonts", FILES[key]));
  const data = new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
  const font = new hb.Font(new hb.Face(new hb.Blob(data)));
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const head = tableOffset(view, "head");
  const hhea = tableOffset(view, "hhea");
  const unitsPerEm = view.getUint16(head + 18);
  font.setScale(unitsPerEm, unitsPerEm);
  const face: FontFace = {
    key, data, font, unitsPerEm, ascent: view.getInt16(hhea + 4), descent: view.getInt16(hhea + 6), glyphCount: view.getUint16(tableOffset(view, "maxp") + 4),
  };
  loaded.set(key, face);
  return face;
}

/** Offset of a table in a TrueType file, or -1. */
export function tableOffset(view: DataView, tag: string): number {
  const count = view.getUint16(4);
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    if (String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3)) === tag) return view.getUint32(at + 8);
  }
  return -1;
}
