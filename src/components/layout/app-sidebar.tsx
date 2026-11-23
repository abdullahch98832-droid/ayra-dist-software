"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActivePath, visibleNavigation } from "@/config/navigation";
import { useI18n } from "@/i18n/context";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { Brand } from "./brand";

export function AppSidebar({ permissions }: { permissions: ReadonlySet<string> }) {
  const { t, direction } = useI18n();
  const { setOpenMobile } = useSidebar();
  const pathname = usePathname();

  return (
    <Sidebar side={direction === "rtl" ? "right" : "left"} collapsible="icon" className="z-30">
      <SidebarHeader className="h-16 justify-center border-b px-3 group-data-[collapsible=icon]:items-center">
        <Link href="/dashboard" onClick={() => setOpenMobile(false)} className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
          <Brand subtitle={t.common.subtitle} />
        </Link>
      </SidebarHeader>
      <SidebarContent className="py-2 group-data-[collapsible=icon]:overflow-y-auto">
        <nav aria-label={t.nav.menu}>
          {visibleNavigation(permissions).map((group) => (
            <SidebarGroup key={group.key} className="px-3 py-1.5">
              <SidebarGroupLabel className="text-muted-foreground group-data-[collapsible=icon]:hidden">{t.nav.groups[group.key]}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:items-center">
                  {group.items.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    const label = item.label(t);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          isActive={active}
                          tooltip={label}
                          render={<Link href={item.href} onClick={() => setOpenMobile(false)} aria-current={active ? "page" : undefined} />}
                          className="h-auto min-h-9 gap-3 px-2.5 py-1.5 group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! before:absolute before:inset-y-1.5 before:start-0 before:w-[3px] before:rounded-full before:bg-primary before:opacity-0 data-active:before:opacity-100"
                        >
                          <item.icon aria-hidden />
                          <span className="flex min-w-0 flex-1 items-center gap-2 group-data-[collapsible=icon]:hidden">
                            <span className="min-w-0 flex-1 truncate">{label}</span>
                            {item.planned && <span className="shrink-0 rounded-full bg-muted px-2 text-[0.6875rem] font-normal text-muted-foreground">{t.nav.planned}</span>}
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
    </Sidebar>
  );
}
