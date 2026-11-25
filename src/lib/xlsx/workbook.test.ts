import { inflateRawSync, crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { sheetName, workbook, type XlsxSheet } from "./workbook";

/** Reads an archive back through its directory, checking sizes and checksums. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const b = Buffer.from(bytes);
  const end = b.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6]));
  const count = b.readUInt16LE(end + 10);
  let at = b.readUInt32LE(end + 16);
  const files = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    const [sum, packed, size, nameLength] = [b.readUInt32LE(at + 16), b.readUInt32LE(at + 20), b.readUInt32LE(at + 24), b.readUInt16LE(at + 28)];
    const local = b.readUInt32LE(at + 42);
    const name = b.toString("utf8", at + 46, at + 46 + nameLength);
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const data = inflateRawSync(b.subarray(start, start + packed));
    expect([data.length, crc32(data)]).toEqual([size, sum]);
    files.set(name, data.toString("utf8"));
    at += 46 + nameLength;
  }
  return files;
}

const sheet = (extra: Partial<XlsxSheet> = {}): XlsxSheet => ({
  name: "Sales", heading: ["Daily sales", "1 Nov to 2 Nov"], rtl: false, totalLabel: "Total", totals: [null, "3", "1234567890123.45"],
  columns: [{ header: "Customer", kind: "text" }, { header: "Invoices", kind: "quantity" }, { header: "Net", kind: "money" }], rows: [["=HYPERLINK(\"x\") <&>", "1", "1234567890000.45"], ["علی اسٹور", "2", "123.00"]], ...extra,
});
const read = (sheets: XlsxSheet[]) => unzip(workbook(sheets, { title: "T", author: "A", created: new Date("2026-11-25T00:00:00Z") }));

describe("workbook", () => {
  it("writes exact numbers, text that is never a formula, and totals that follow the filters", () => {
    const xml = read([sheet()]).get("xl/worksheets/sheet1.xml") ?? "";
    expect(xml).toContain('<v>1234567890000.45</v>');
    expect(xml).toContain('<f>SUBTOTAL(109,C5:C6)</f><v>1234567890123.45</v>');
    expect(xml).toContain('t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;x&quot;) &lt;&amp;&gt;</t></is>');
    expect(xml).toContain("علی اسٹور");
    expect(xml).toContain('<autoFilter ref="A4:C6"/>');
    expect(xml).not.toContain("<f>HYPERLINK");
  });

  it("writes dates as serial numbers and leaves what is not a number as text", () => {
    const xml = read([sheet({ columns: [{ header: "Date", kind: "date" }, { header: "When", kind: "datetime" }, { header: "Net", kind: "money" }], rows: [["2026-11-25", "2026-11-25T12:00:00Z", "n/a"]], totals: undefined })]).get("xl/worksheets/sheet1.xml") ?? "";
    expect(xml).toContain('<c r="A5" s="5"><v>46351</v></c>');
    expect(xml).toContain('<v>46351.5</v>');
    expect(xml).toContain(">n/a</t>");
  });

  it("gives Urdu sheets their direction and every sheet a legal, different name", () => {
    expect(read([sheet({ rtl: true })]).get("xl/worksheets/sheet1.xml")).toContain('rightToLeft="1"');
    const taken = new Set<string>();
    expect(sheetName("A/B:C*?[]", taken)).toBe("A B C");
    expect(sheetName("a b c", taken)).toBe("a b c 2");
    expect(sheetName("x".repeat(60), taken).length).toBeLessThanOrEqual(31);
    expect(sheetName("'", taken)).toBe("Sheet");
  });

  it("drops characters that XML does not allow", () => {
    const xml = read([sheet({ rows: [["a\u0000b\ud800c\u{1F600}", "1", "1"]] })]).get("xl/worksheets/sheet1.xml") ?? "";
    expect(xml).toContain(">abc\u{1F600}</t>");
  });

  it("has every column letter", () => {
    const xml = read([sheet({ columns: Array.from({ length: 30 }, (_, i) => ({ header: String(i), kind: "text" as const })), rows: [Array<string>(30).fill("x")], totals: undefined })]).get("xl/worksheets/sheet1.xml") ?? "";
    expect(xml).toContain('r="Z4"');
    expect(xml).toContain('r="AD5"');
  });
});
