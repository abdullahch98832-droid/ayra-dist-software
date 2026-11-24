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
    <nav ref={nav} aria-label={label} className="no-scrollbar -mx-4 mb-6 overflow-x-auto border-b px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 print:hidden">
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
                  "block border-b-2 px-3 py-2.5 text-sm whitespace-nowrap outline-none transition-colors focus-visible:bg-accent",
                  current ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:border-input hover:text-foreground"
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
