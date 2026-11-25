import * as hb from "harfbuzzjs";
import { fontFace, type FontKey } from "./fonts";

/** The glyphs of one character (a letter with its dots) or of a few that belong together, as HarfBuzz placed them, in font units. */
export interface Cluster {
  /** From the left edge of the run. */
  x: number;
  advance: number;
  text: string;
  /** Positions from the left end of the cluster on the baseline. */
  parts: { id: number; x: number; y: number }[];
}

export interface Shaped {
  /** In visual order, left to right, whatever the direction of the text. */
  clusters: Cluster[];
  width: number;
  /** Highest and lowest ink, in font units above and below the baseline. */
  top: number;
  bottom: number;
}

const cache = new Map<string, Shaped>();
const CACHE_LIMIT = 20000;
const TABULAR = [new hb.Feature("tnum", 1)];

/** Shapes a run of one direction and one script. The characters are never reordered by hand: HarfBuzz does all of it. */
export function shape(key: FontKey, text: string, rtl: boolean, tabular = false): Shaped {
  const id = `${key}|${rtl ? 1 : 0}${tabular ? 1 : 0}|${text}`;
  const known = cache.get(id);
  if (known) return known;

  const { font } = fontFace(key);
  const buffer = new hb.Buffer();
  buffer.addText(text);
  buffer.setDirection(rtl ? hb.Direction.RTL : hb.Direction.LTR);
  const urdu = key === "urdu" || key === "urduBold";
  buffer.setScript(urdu ? "Arab" : "Latn");
  buffer.setLanguage(urdu ? "ur" : "en");
  // Marks keep clusters of their own.
  buffer.setClusterLevel(hb.ClusterLevel.MONOTONE_CHARACTERS);
  hb.shape(font, buffer, tabular ? TABULAR : undefined);
  const infos = buffer.getGlyphInfos();
  const positions = buffer.getGlyphPositions();

  // The characters of a cluster end where the next cluster begins.
  const starts = [...new Set(infos.map((g) => g.cluster))].sort((a, b) => a - b);
  const textOf = new Map(starts.map((start, i) => [start, text.slice(start, starts[i + 1] ?? text.length)]));

  let pen = 0;
  let top = 0;
  let bottom = 0;
  const clusters: Cluster[] = [];
  let open = -1;
  infos.forEach((g, i) => {
    const p = positions[i] ?? { xAdvance: 0, yAdvance: 0, xOffset: 0, yOffset: 0 };
    if (g.cluster !== open) {
      clusters.push({ x: pen, advance: 0, text: textOf.get(g.cluster) ?? "", parts: [] });
      open = g.cluster;
    }
    const cluster = clusters[clusters.length - 1];
    cluster?.parts.push({ id: g.codepoint, x: pen + p.xOffset - cluster.x, y: p.yOffset });
    if (cluster) cluster.advance += p.xAdvance;
    const ink = font.glyphExtents(g.codepoint);
    if (ink && ink.height !== 0) {
      top = Math.max(top, p.yOffset + ink.yBearing);
      bottom = Math.min(bottom, p.yOffset + ink.yBearing + ink.height);
    }
    pen += p.xAdvance;
  });
  const shaped = { clusters, width: pen, top, bottom };
  if (cache.size > CACHE_LIMIT) cache.clear();
  cache.set(id, shaped);
  return shaped;
}
