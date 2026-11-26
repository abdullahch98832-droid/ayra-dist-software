// The papers built from what the database returns, rendered and read back.
import { describe, expect, it } from "vitest";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { DocLanguage } from "@/lib/pdf/model";
import { renderPdf } from "@/lib/pdf/render";
import { buildDocument } from "./build";
import { DocumentMismatch, documentSchema, type DocumentSettings } from "./data";
import type { DocumentKind } from "./kinds";

const settings = {} as DocumentSettings;
const people = [{ name: "Aftab Chattha", amount: "250000.00" }, { name: "Mudassar Rao", amount: "250000.00" }];
const money = { number: "AXP-000001", date: "2026-11-19", status: "posted", account: "Cash in hand", method: "cash", recorded_by: "Owner", people, totals: { total: "500000.00" } };
const papers: [DocumentKind, unknown][] = [
  ["company_money", { ...money, description: "Initial investment", direction: "in", type_key: "capital" }],
  ["cash_voucher", { ...money, number: "CV-000001", description: "Capital", direction: "in", payee: "Owners", category: { en: "3100 · Capital", ur: "3100 · سرمایہ" } }],
  ["cash_deposit", { ...money, number: "DEP-000001", taker: { en: "Bilal", ur: null }, approved_by: "Owner" }],
  ["expense_voucher", { ...money, number: "EXP-000001", payee: "Cheema Sab", description: "Servant", category: { en: "Servant", ur: null }, receipt: false, no_receipt_reason: "none" }],
  ["supplier_return", {
    number: "PRT-000001", date: "2026-11-19", status: "posted", notes: "Broken seals", party: { en: "Ayra Happiness", principal: true }, warehouse: { en: "Main", ur: null }, receipts: ["GRN-000004"],
    lines: [{ sku: "SKU-1", en: "Shampoo", ur: null, unit: { en: "Carton", ur: null }, quantity: 3, price: "12.50", total: "37.50" }], totals: { lines: "37.50", total: "37.50" },
  }],
];

async function text(bytes: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({ data: new Uint8Array(bytes), stopAtErrors: true, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) out.push(...(await (await pdf.getPage(i)).getTextContent()).items.filter((x): x is TextItem => "str" in x).map((x) => x.str));
  return out.join(" ");
}
const render = (kind: DocumentKind, data: unknown, language: DocLanguage) => renderPdf([buildDocument(kind, documentSchema.parse(data), settings)], {
  language, title: kind, created: new Date("2026-11-26T00:00:00Z"),
  letterhead: { name: "AM TRADERS", nameUr: "", subtitle: { en: "Distributor", ur: "ڈسٹری بیوٹر" }, address: { en: "", ur: "" }, phone: "", email: "", ntn: "" },
  words: { page: { en: "Page {page} of {pages}", ur: "صفحہ {page} از {pages}" }, ntn: { en: "NTN", ur: "این ٹی این" }, printed: { en: "Printed", ur: "پرنٹ" } },
});

describe("new papers", () => {
  it.each(papers)("%s prints in English and Urdu", async (kind, data) => {
    const en = await text(render(kind, data, "en"));
    expect(en).toContain((data as { number: string }).number);
    if ((data as { people?: unknown[] }).people) expect(en).toMatch(/Paid by[\s\S]*Aftab Chattha[\s\S]*Mudassar Rao/);
    // With people, their accounts are in the table; the paper names no single account.
    if ((data as { people?: unknown[] }).people) expect(en).not.toContain("Cash in hand");
    expect(render(kind, data, "ur").length).toBeGreaterThan(1000);
    expect(render(kind, data, "both").length).toBeGreaterThan(1000);
  });

  it("a return whose lines and total differ is not printed", () => {
    const [, data] = papers.at(-1)!;
    const wrong = { ...(data as object), totals: { lines: "37.50", total: "40.00" } };
    expect(() => buildDocument("supplier_return", documentSchema.parse(wrong), settings)).toThrow(DocumentMismatch);
  });
});
