// Every PDF here is read back by pdf.js, a reader that shares no code with the writer.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { Bi, DocLanguage, DocModel } from "./model";
import { renderPdf } from "./render";
import { shape } from "./shape";
import { layoutText, linesWidth } from "./text";
import { jpegImage } from "./writer";

const b = (en: string, ur: string): Bi => ({ en, ur });
const options = (language: DocLanguage) => ({
  language, title: "Test", created: new Date("2026-11-25T00:00:00Z"),
  letterhead: { name: "AM TRADERS", nameUr: "اے ایم ٹریڈرز", subtitle: b("Distributor of products", "مصنوعات کے ڈسٹری بیوٹر"), address: b("Lahore", "لاہور"), phone: "042-1234567", email: "", ntn: "1234567-8" },
  words: { page: b("Page {page} of {pages}", "صفحہ {page} از {pages}"), ntn: b("NTN", "این ٹی این"), printed: b("Printed", "پرنٹ") },
});
const amount = (i: number) => `${(1234 * (i + 1)).toLocaleString("en")}.50`;
const model = (rows: number): DocModel => ({
  title: b("Sales invoice", "سیلز انوائس"), number: "INV-000123",
  party: { label: b("Customer", "گاہک"), name: b("Bismillah General Store", "بسم اللہ جنرل اسٹور"), lines: [{ text: "0300-1234567", code: true }] },
  meta: [{ label: b("Order", "آرڈر"), value: { text: "SO-000007", code: true } }],
  blocks: [
    { type: "table", numbered: true, columns: [{ label: b("Product", "مصنوعات"), flex: 1 }, { label: b("Unit", "اکائی") }, { label: b("Total", "کل"), figure: true }],
      rows: Array.from({ length: rows }, (_, i) => [{ text: b(`Shampoo ${i + 1}`, "ہیپینیس شیمپو"), sub: `SKU-${i + 1}` }, { text: b("Carton", "کارٹن") }, { text: amount(i), code: true }]) },
    { type: "totals", rows: [{ label: b("Total", "کل"), value: { text: "Rs 1,234,567.50", code: true }, strong: true }, { label: b("Outstanding", "بقایا"), value: { text: "-Rs 300.00", code: true } }] },
  ],
  signatures: [b("Prepared by", "تیار کنندہ")],
});

async function read(bytes: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({ data: new Uint8Array(bytes), stopAtErrors: true, verbosity: 0 }).promise;
  const pages: TextItem[][] = [];
  for (let i = 1; i <= pdf.numPages; i++) pages.push((await (await pdf.getPage(i)).getTextContent()).items.filter((x): x is TextItem => "str" in x && x.str.trim() !== ""));
  return { pages, text: pages.map((p) => p.map((i) => i.str).join(" ")), meta: await pdf.getMetadata() };
}
const raw = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("shaping", () => {
  it("joins Urdu letters: every word uses contextual forms and no missing glyph", () => {
    for (const word of ["بسم", "اللہ", "جنرل", "اسٹور", "ہیپینیس", "ٹھیکیدار", "کھجور", "پیٹرول", "ڈیٹرجنٹ", "لاہور", "۱۲۳", "۔", "،"]) {
      const { clusters, width } = shape("urdu", word, true);
      expect(clusters.flatMap((c) => c.parts).every((p) => p.id > 0), word).toBe(true);
      expect(clusters.map((c) => c.text).reverse().join(""), word).toBe(word);
      expect(width).toBeGreaterThan(0);
    }
    // A letter is drawn differently at the beginning, in the middle, at the end and alone.
    const forms = ["ب", "بب", "ببب"].map((t) => JSON.stringify(shape("urdu", t, true).clusters.map((c) => c.parts.map((p) => p.id))));
    expect(new Set(forms).size).toBe(3);
  });

  it("gives digits the same width in columns of figures", () => {
    const width = (text: string) => shape("sans", text, false, true).width;
    expect(width("1111")).toBe(width("8888"));
  });
});

describe("lines", () => {
  it("keeps numbers and codes left to right inside Urdu", () => {
    const [line] = layoutText("انوائس نمبر ⁦INV-000123⁩ کی رقم ⁦-Rs 1,234.50⁩ ہے", { size: 10 }, 1000, "rtl");
    const left = (text: string) => line?.pieces.find((p) => p.text === text)?.x ?? NaN;
    // Reading starts at the right.
    expect(left("انوائس")).toBeGreaterThan(left("نمبر"));
    expect(left("نمبر")).toBeGreaterThan(left("INV-000123"));
    expect(left("-Rs")).toBeLessThan(left("1,234.50"));
    expect(left("1,234.50")).toBeGreaterThan(left("ہے"));
  });

  it("wraps within the width, also words that are longer than the line", () => {
    for (const text of ["یہ ایک لمبا جملہ ہے جو خود بخود اگلی سطر پر منتقل ہو جائے گا", "A fairly long English sentence with several words", "SKU-0000000000000000000000000000000000000000000000000000"]) {
      const lines = layoutText(text, { size: 10 }, 90, "auto");
      expect(lines.length).toBeGreaterThan(1);
      expect(linesWidth(lines)).toBeLessThanOrEqual(90.5);
    }
  });

  it("drops control characters and survives odd input", () => {
    for (const text of ["", " ", "⁦⁩", "😀", "a\tb", "سطر\nدوسری سطر", "‏"]) expect(layoutText(text, { size: 10 }, 100, "auto").length).toBeGreaterThan(0);
  });
});

describe.each(["en", "ur", "both"] as const)("a document in %s", (language) => {
  it("is read back with its words, codes and amounts intact", async () => {
    const { text, meta } = await read(renderPdf([model(3)], options(language)));
    const all = text.join(" ");
    for (const code of ["INV-000123", "SO-000007", "0300-1234567", "1,234.50", "SKU-2"]) expect(all).toContain(code);
    if (language !== "ur") for (const word of ["Sales", "invoice", "Bismillah", "Carton", "Prepared"]) expect(all).toContain(word);
    if (language !== "en") for (const word of ["انوائس", "بسم", "جنرل", "کارٹن", "ہیپینیس", "تیار"]) expect(all).toContain(word);
    expect((meta.info as { Title?: string }).Title).toBe("Test");
  });

  it("repeats the table head and numbers its pages", async () => {
    const { pages, text } = await read(renderPdf([model(70)], options(language)));
    expect(pages.length).toBeGreaterThan(1);
    const head = language === "ur" ? "مصنوعات" : "Product";
    pages.forEach((_, i) => {
      if (language === "ur") expect(text[i]).toMatch(new RegExp(`صفحہ`));
      else expect(text[i]).toContain(`Page ${i + 1} of ${pages.length}`);
      if (text[i]?.includes("SKU-")) expect(text[i]).toContain(head);
      expect(text[i]).toContain("INV-000123");
    });
    // Every row is there once.
    const all = text.join(" ");
    for (let i = 1; i <= 70; i++) expect(all.split(new RegExp(`SKU-${i}(?!\\d)`)).length - 1, `row ${i}`).toBe(1);
  });

  it("lines figures up at their right edge", async () => {
    const { pages } = await read(renderPdf([model(12)], options(language)));
    const wanted = new Set(Array.from({ length: 12 }, (_, i) => amount(i)));
    const edges = pages.flat().filter((i) => wanted.has(i.str)).map((i) => (i.transform[4] as number) + i.width);
    expect(edges).toHaveLength(12);
    expect(Math.max(...edges) - Math.min(...edges)).toBeLessThan(0.6);
  });

  it("stays inside the paper", async () => {
    const { pages } = await read(renderPdf([model(40)], options(language)));
    for (const item of pages.flat()) {
      const x = item.transform[4] as number;
      const y = item.transform[5] as number;
      expect(x).toBeGreaterThan(20);
      expect(x + item.width).toBeLessThan(575.5);
      expect(y).toBeGreaterThan(10);
      expect(y).toBeLessThan(830);
    }
  });

  it("embeds every font it uses, as a subset", () => {
    const file = raw(renderPdf([model(3)], options(language)));
    const fonts = file.match(/\/Type \/Font \/Subtype \/Type0/g) ?? [];
    expect(file.match(/\/FontFile2 /g)).toHaveLength(fonts.length);
    expect(file.match(/\/BaseFont \/[A-Z]{6}\+/g)).toHaveLength(fonts.length * 2);
    expect(file.includes("NotoNastaliqUrdu")).toBe(language !== "en");
    expect(file).not.toMatch(/Helvetica|Times|Arial/);
  });
});

describe("several documents in one file", () => {
  it("numbers the pages of each on its own", async () => {
    const { text } = await read(renderPdf([model(2), model(2), model(70)], options("en")));
    expect(text[0]).toContain("Page 1 of 1");
    expect(text[1]).toContain("Page 1 of 1");
    expect(text[2]).toMatch(/Page 1 of [2-9]/);
  });

  it("marks what is not final, without hiding the figures", async () => {
    const { text } = await read(renderPdf([{ ...model(3), watermark: b("DRAFT", "مسودہ") }], options("en")));
    expect(text[0]).toContain("DRAFT");
    expect(text[0]).toContain("1,234.50");
  });
});

describe("the logo", () => {
  const logo = jpegImage(new Uint8Array(readFileSync(path.join(process.cwd(), "src/lib/pdf/brand/am-traders.jpg"))));

  it("is read from the JPEG as it is", () => {
    expect([logo.width, logo.height]).toEqual([900, 492]);
  });

  it("is embedded once for all pages, the text still intact", async () => {
    const bytes = renderPdf([model(70)], { ...options("en"), letterhead: { ...options("en").letterhead, logo } });
    const file = raw(bytes);
    expect(file.match(/\/Subtype \/Image /g)).toHaveLength(1);
    expect(file).toContain("/Filter /DCTDecode");
    const { pages, text } = await read(bytes);
    expect(pages.length).toBeGreaterThan(1);
    expect(text[0]).toContain("AM TRADERS");
    expect(text[0]).toContain("INV-000123");
  });
});
