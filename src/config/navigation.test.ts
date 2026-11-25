import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { NAV_ITEMS, isActivePath, itemPermissions, visibleNavigation } from "./navigation";

const pageFile = (path: string) => existsSync(join(process.cwd(), "src/app/(dashboard)", path, "page.tsx"));
// Both procurement workflows are served by the same [flow] route.
const pageExists = (href: string) => pageFile(href) || (/^\/purchasing\/(company|suppliers)$/.test(href) && pageFile("/purchasing/[flow]"));

describe("navigation", () => {
  it("marks exactly the modules without a page as planned", () => {
    for (const item of NAV_ITEMS) expect(pageExists(item.href), item.href).toBe(!item.planned);
  });

  it("uses one path segment for planned modules, so the [module] route can serve them", () => {
    for (const item of NAV_ITEMS.filter((i) => i.planned)) expect(item.href).toMatch(/^\/[a-z-]+$/);
  });

  it("has unique links and real permissions", () => {
    expect(new Set(NAV_ITEMS.map((i) => i.href)).size).toBe(NAV_ITEMS.length);
    for (const permission of NAV_ITEMS.flatMap(itemPermissions)) expect(PERMISSIONS).toContain(permission);
  });

  it("shows only permitted items and drops empty groups", () => {
    const groups = visibleNavigation(new Set(["dashboard.view", "audit.view"]));
    expect(groups.flatMap((g) => g.items.map((i) => i.href))).toEqual(["/dashboard", "/admin/audit"]);
    expect(visibleNavigation(new Set())).toEqual([]);
    const company = visibleNavigation(new Set(["company.view"])).flatMap((g) => g.items.map((i) => i.href));
    expect(company).toEqual(["/purchasing/company"]);
  });

  it("matches whole path segments", () => {
    expect(isActivePath("/sales/orders", "/sales")).toBe(true);
    expect(isActivePath("/salesforce", "/sales")).toBe(false);
  });
});
