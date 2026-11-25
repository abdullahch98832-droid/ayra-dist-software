import { describe, expect, it } from "vitest";
import { changeFrom } from "./change";
import { dashboardKind } from "./layout";
import { businessToday, parsePeriod } from "./period";

const today = "2026-11-24";

describe("date filter", () => {
  it.each([
    [{}, "2026-11-01", today],
    [{ range: "today" }, today, today],
    [{ range: "yesterday" }, "2026-11-23", "2026-11-23"],
    [{ range: "last7" }, "2026-11-18", today],
    [{ range: "thisYear" }, "2026-01-01", today],
    [{ range: "thisWeek" }, "2026-11-23", today],
    [{ range: "lastMonth" }, "2026-10-01", "2026-10-31"],
    [{ range: "last12Months" }, "2025-12-01", today],
    [{ range: "custom", from: "2026-01-05", to: "2026-02-10" }, "2026-01-05", "2026-02-10"],
  ])("%j gives %s to %s", (params, from, to) => {
    expect(parsePeriod(params, today)).toMatchObject({ from, to });
  });

  it.each([
    { range: "custom", from: "2026-02-10", to: "2026-01-05" },
    { range: "custom", from: "2026-02-31", to: "2026-03-05" },
    { range: "custom", from: "2015-01-01", to: today },
    { range: "custom", from: "x'; drop table", to: today },
    { range: "custom" },
    { range: ["today", "last7"] },
    { range: "nonsense" },
  ])("falls back to this month for %j", (params) => {
    expect(parsePeriod(params, today)).toEqual({ preset: "thisMonth", from: "2026-11-01", to: today });
  });

  it("handles January and leap years", () => {
    expect(parsePeriod({ range: "lastMonth" }, "2027-01-15")).toMatchObject({ from: "2026-12-01", to: "2026-12-31" });
    expect(parsePeriod({ range: "lastMonth" }, "2028-03-31")).toMatchObject({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("changes day at midnight in Pakistan, not in UTC", () => {
    expect(businessToday(new Date("2026-11-23T18:59:00Z"))).toBe("2026-11-23");
    expect(businessToday(new Date("2026-11-23T19:01:00Z"))).toBe("2026-11-24");
  });
});

describe("dashboard layout", () => {
  it.each([
    ["super_admin", [], "executive"], ["manager", [], "manager"], ["data_entry", [], "entry"], ["viewer", [], "viewer"],
    ["accountant", ["reports.financial", "expenses.create"], "manager"],
    ["order_taker", ["sales.view", "sales.create"], "entry"],
    ["driver", ["sales.view"], "viewer"],
    [undefined, [], "viewer"],
  ])("%s with %j gets %s", (role, permissions, kind) => {
    expect(dashboardKind(role, new Set(permissions))).toBe(kind);
  });
});

describe("change against the previous period", () => {
  const p = (n: number) => BigInt(n);
  it.each([
    [p(150), p(100), { permille: 500, direction: "up" }],
    [p(50), p(100), { permille: 500, direction: "down" }],
    [p(100), p(100), { permille: 0, direction: "flat" }],
    [p(-50), p(-100), { permille: 500, direction: "up" }],
    [p(50), p(-100), { permille: 1500, direction: "up" }],
  ])("%s from %s", (current, previous, expected) => expect(changeFrom(current, previous)).toEqual(expected));

  it("has no percentage when the previous period was zero", () => expect(changeFrom(p(5), p(0))).toBeNull());
});

describe("this week", () => {
  it.each([["2026-11-23", "2026-11-23"], ["2026-11-29", "2026-11-23"], ["2026-11-30", "2026-11-30"], ["2027-01-01", "2026-12-28"]])("on %s begins on Monday %s", (day, monday) => {
    expect(parsePeriod({ range: "thisWeek" }, day)).toMatchObject({ from: monday, to: day });
  });
});
