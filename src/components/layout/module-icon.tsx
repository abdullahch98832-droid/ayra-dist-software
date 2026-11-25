"use client";

import { usePathname } from "next/navigation";
import { isActivePath, NAV_ITEMS } from "@/config/navigation";
import { IconTile } from "@/components/shared/icon-tile";

/** Icon of the module the current page belongs to. */
export function ModuleIcon() {
  const pathname = usePathname();
  const item = NAV_ITEMS.filter((i) => isActivePath(pathname, i.href)).sort((a, b) => b.href.length - a.href.length)[0];
  return item ? <IconTile icon={item.icon} size="lg" className="hidden shadow-card sm:flex print:hidden" /> : null;
}
