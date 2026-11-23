import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { NAV_ITEMS, isActivePath, visibleNavigation } from "./navigation";

const pageExists = (href: string) => existsSync(join(process.cwd(), "src/app/(dashboard)", href, "page.tsx"));

describe("navigation", () => {
  it("marks exactly the modules without a page as planned", () => {
    for (const item of NAV_ITEMS) expect(pageExists(item.href), item.href).toBe(!item.planned);
  });

  it("uses one path segment for planned modules, so the [module] route can serve them", () => {
    for (const item of NAV_ITEMS.filter((i) => i.planned)) expect(item.href).toMatch(/^\/[a-z-]+$/);
  });

  it("has unique links and real permissions", () => {
    expect(new Set(NAV_ITEMS.map((i) => i.href)).size).toBe(NAV_ITEMS.length);
    for (const item of NAV_ITEMS) expect(PERMISSIONS).toContain(item.permission);
  });

  it("shows only permitted items and drops empty groups", () => {
    const groups = visibleNavigation(new Set(["dashboard.view", "audit.view"]));
    expect(groups.flatMap((g) => g.items.map((i) => i.href))).toEqual(["/dashboard", "/admin/audit"]);
    expect(visibleNavigation(new Set())).toEqual([]);
  });

  it("matches whole path segments", () => {
    expect(isActivePath("/sales/orders", "/sales")).toBe(true);
    expect(isActivePath("/salesforce", "/sales")).toBe(false);
  });
});
