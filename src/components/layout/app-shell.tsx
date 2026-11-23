"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { History, LayoutDashboard, LogOut, Menu, ShieldCheck, UserCog, Users, type LucideIcon } from "lucide-react";
import { APP_CONFIG } from "@/config/app";
import { useI18n } from "@/i18n/context";
import type { Dictionary } from "@/i18n";
import type { Permission } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Footer } from "./footer";
import { LocaleSwitcher } from "./locale-switcher";

interface NavItem {
  href: string;
  label: keyof Dictionary["nav"];
  icon: LucideIcon;
  permission: Permission;
}

const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { href: "/employees", label: "employees", icon: Users, permission: "employees.view" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin/users", label: "users", icon: UserCog, permission: "users.view" },
  { href: "/admin/roles", label: "roles", icon: ShieldCheck, permission: "users.view" },
  { href: "/admin/audit", label: "accessHistory", icon: History, permission: "audit.view" },
];

export interface ShellUser {
  fullName: string;
  email: string;
  roleName: string;
}

function NavLinks({ items, permissions, onNavigate }: { items: NavItem[]; permissions: ReadonlySet<string>; onNavigate?: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <ul className="grid gap-1">
      {items.filter((i) => permissions.has(i.permission)).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{t.nav[item.label]}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarBody({ permissions, onNavigate }: { permissions: ReadonlySet<string>; onNavigate?: () => void }) {
  const { t } = useI18n();
  const showAdmin = ADMIN_NAV.some((i) => permissions.has(i.permission));
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-5 py-5">
        <p className="font-latin text-lg font-bold tracking-tight text-white">{APP_CONFIG.name}</p>
        <p className="text-xs text-sidebar-foreground/70">{t.common.subtitle}</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label={t.nav.menu}>
        <NavLinks items={MAIN_NAV} permissions={permissions} onNavigate={onNavigate} />
        {showAdmin && (
          <>
            <p className="mt-6 mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
              {t.nav.administration}
            </p>
            <NavLinks items={ADMIN_NAV} permissions={permissions} onNavigate={onNavigate} />
          </>
        )}
      </nav>
    </div>
  );
}

export function AppShell({ user, permissions, children }: { user: ShellUser; permissions: string[]; children: React.ReactNode }) {
  const { t, direction } = useI18n();
  const [open, setOpen] = useState(false);
  const [signingOut, startSignOut] = useTransition();
  const permissionSet = new Set(permissions);

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 border-e border-sidebar-border lg:block">
        <SidebarBody permissions={permissionSet} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={direction === "rtl" ? "right" : "left"} className="w-64 p-0">
          <SheetTitle className="sr-only">{t.nav.menu}</SheetTitle>
          <SidebarBody permissions={permissionSet} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col lg:ms-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label={t.nav.menu}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
          <LocaleSwitcher />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" className="gap-2 px-2" />}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {user.fullName.trim().charAt(0).toUpperCase() || "?"}
              </span>
              <span className="hidden max-w-40 truncate text-sm sm:inline">{user.fullName || user.email}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <p className="truncate font-medium text-foreground">{user.fullName}</p>
                  <p className="truncate text-xs" dir="ltr">{user.email}</p>
                  <p className="mt-1 text-xs">{user.roleName}</p>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={signingOut} onClick={() => startSignOut(() => signOutAction())}>
                <LogOut className="h-4 w-4" />
                {t.auth.signOut}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        <Footer />
      </div>
    </div>
  );
}
