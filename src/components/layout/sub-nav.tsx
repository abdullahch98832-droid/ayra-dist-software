"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface SubNavItem {
  href: string;
  label: string;
  /** Active only on this exact path (an overview page whose path prefixes the others). */
  exact?: boolean;
}

/** Tabs between the pages of a module. Scrolls sideways inside itself on small screens. */
export function SubNav({ label, items }: { label: string; items: SubNavItem[] }) {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  const active = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!nav.current || !active.current) return;
    // Scrolls the tab bar only; scrollIntoView would also be allowed to move the page. Works in both directions.
    const bar = nav.current.getBoundingClientRect();
    const tab = active.current.getBoundingClientRect();
    nav.current.scrollLeft += tab.left + tab.width / 2 - (bar.left + bar.width / 2);
  }, [pathname]);
  return (
    <nav ref={nav} aria-label={label} className="no-scrollbar mb-6 max-w-full overflow-x-auto rounded-xl border bg-card p-1 shadow-card sm:w-fit print:hidden">
      <ul className="flex w-max gap-1">
        {items.map((item) => {
          const current = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                ref={current ? active : undefined}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "block rounded-lg px-3.5 py-1.5 text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40",
                  current ? "bg-gradient-action font-medium text-primary-foreground shadow-action" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
