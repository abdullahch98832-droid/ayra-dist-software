import { describe, expect, it } from "vitest";
import { Boxes } from "lucide-react";
import { reportCsv, reportDocument } from "./export";
import { reconciles, type LoadedReport } from "./model";
import { columnTotal } from "./values";

const bi = (en: string, ur: string) => ({ en, ur });
const report = (): LoadedReport => ({
  definition: { slug: "sample", group: "sales", title: bi("Sample", "نمونہ"), hint: bi("", ""), icon: Boxes, permissions: ["sales.view"], dates: "period", load: async () => ({ tables: [] }) },
  period: { preset: "custom", from: "2026-11-01", to: "2026-11-25" }, day: "2026-11-25", today: "2026-11-25", filters: [], chosen: [{ label: bi("Category", "زمرہ"), value: bi("Sweets", "مٹھائی") }], dates: bi("1 to 25", "1 سے 25"), params: {},
  model: {
    tables: [{
      key: "t", title: bi("Sample", "نمونہ"),
      columns: [
        { key: "name", label: bi("Product", "پروڈکٹ"), kind: "link", sub: "sku", subLabel: bi("SKU", "کوڈ"), primary: true }, { key: "n", label: bi("Sold", "فروخت"), kind: "quantity", total: true }, { key: "extra", label: bi("Extra", "اضافی"), kind: "text", screenOnly: true },
        { key: "net", label: bi("Net", "خالص"), kind: "money", total: true }, { key: "s", label: bi("Status", "حیثیت"), kind: "status", options: { ok: { label: bi("Good", "ٹھیک"), tone: "green" } } },
      ],
      rows: [
        { id: "1", name: bi("Candy", "ٹافی"), sku: "A-1", n: 3, extra: "x", net: 0.1, s: "ok" },
        { id: "2", name: "=cmd()", sku: "A-2", n: 4, extra: null, net: 0.2, s: "ok" },
      ],
    }],
    checks: [{ label: bi("Sales", "فروخت"), report: BigInt(30), other: BigInt(0), ledger: BigInt(30) }],
  },
});

describe("exports of a report", () => {
  it("adds money exactly", () => {
    const [table] = report().model.tables;
    const net = table?.columns.find((c) => c.key === "net");
    expect(net && table && columnTotal(net, table.rows)).toBe("0.30");
  });

  it("CSV has every column in the chosen language, exact decimals, and no formulas", () => {
    expect(reportCsv(report(), "en").content.split("\r\n").slice(0, 3)).toEqual(["﻿Product,SKU,Sold,Extra,Net,Status", "Candy,A-1,3,x,0.10,Good", "'=cmd(),A-2,4,,0.20,Good"]);
    const ur = reportCsv(report(), "ur");
    expect(ur.content).toContain("ٹافی,A-1,3,x,0.10,ٹھیک");
    expect(ur.filename).toBe("sample-2026-11-01-2026-11-25-ur.csv");
  });

  it("PDF leaves out columns that are only for the screen and shows the agreement with the ledger", () => {
    const model = reportDocument(report());
    const [first, second] = model.blocks;
    expect(first?.type === "table" && [first.columns.length, first.rows.length, first.footer?.at(2)?.text]).toEqual([4, 2, "0.30"]);
    expect(second?.type === "table" && second.rows[0]?.map((c) => c.text)).toEqual([bi("Sales", "فروخت"), "0.30", "0.00", "0.30", "0.00"]);
    expect(model.meta[0]?.label.en).toBe("Category");
  });

  it("says when a total does not agree", () => {
    expect(reconciles({ label: bi("", ""), report: BigInt(1), other: BigInt(2), ledger: BigInt(3) })).toBe(true);
    expect(reconciles({ label: bi("", ""), report: BigInt(1), other: BigInt(2), ledger: BigInt(4) })).toBe(false);
  });
});
