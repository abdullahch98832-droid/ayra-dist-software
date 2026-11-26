/** Text in both languages. */
export interface Bi { en: string; ur: string }
/** A label in both languages, or text that is the same in every language. */
export type Value = string | Bi;

/** Language of a document: one language, or both side by side. */
export const DOC_LANGUAGES = ["en", "ur", "both"] as const;
export type DocLanguage = (typeof DOC_LANGUAGES)[number];

export interface Cell {
  text: Value;
  /** Second, smaller line. */
  sub?: Value;
  /** `code` covers numbers of documents, phones, amounts and dates: always read left to right. */
  code?: boolean;
  strong?: boolean;
  tone?: "danger" | "muted" | "success";
  /** A date: one language is enough in a bilingual document. */
  single?: boolean;
}

export interface Column {
  label: Bi;
  /** Figures line up at the right edge in both directions, so that their decimals stand under each other. */
  figure?: boolean;
  /** Share of the free width; columns without it are as wide as their content. */
  flex?: number;
}

export type Block =
  | { type: "table"; title?: Bi; columns: Column[]; rows: Cell[][]; footer?: Cell[]; empty?: Bi; numbered?: boolean }
  /** Figures at the end of a document. Kept together, and with the last row of the table before them. */
  | { type: "totals"; rows: { label: Bi; value: Cell; strong?: boolean; line?: boolean }[] }
  | { type: "fields"; title?: Bi; rows: { label: Bi; value: Cell }[] }
  | { type: "statement"; sections: { title?: Bi; rows: { label: Value; code?: string | null; value: Cell }[]; total?: { label: Bi; value: Cell }; strong?: boolean }[] }
  | { type: "text"; title?: Bi; text: Value };

export interface DocModel {
  title: Bi;
  number?: string;
  /** Under the title of a report: its period. */
  period?: Bi;
  landscape?: boolean;
  watermark?: Bi;
  party?: { label: Bi; name: Value; lines: Cell[] };
  meta: { label: Bi; value: Cell }[];
  blocks: Block[];
  signatures?: Bi[];
  note?: Bi;
}

export interface Letterhead {
  name: string; nameUr: string; subtitle: Bi; address: Bi; phone: string; email: string; ntn: string;
  /** The business's logo, a JPEG on its own navy background; without it a lettered emblem stands in. */
  logo?: PdfImage;
}

import type { PdfImage } from "./writer";

export interface RenderOptions {
  language: DocLanguage;
  letterhead: Letterhead;
  /** Words the frame of every page needs. */
  words: { page: Bi; ntn: Bi; printed: Bi };
  title: string;
  created: Date;
}
