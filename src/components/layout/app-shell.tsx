"use client";

import type { NotificationResult } from "@/features/notifications/types";
import { useI18n } from "@/i18n/context";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { Footer } from "./footer";
import { LanguageMenu } from "./language-menu";
import { NotificationsMenu } from "./notifications-menu";
import { SearchPalette } from "./search-palette";
import { UserMenu, type ShellUser } from "./user-menu";

export function AppShell({
  user, permissions, notifications, sidebarOpen, children,
}: {
  user: ShellUser;
  permissions: string[];
  notifications: Promise<NotificationResult>;
  sidebarOpen: boolean;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const permissionSet = new Set(permissions);

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <a href="#main-content" className="sr-only z-50 rounded-lg bg-navy px-4 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:start-4 focus:top-3">
        {t.common.skipToContent}
      </a>
      <AppSidebar permissions={permissionSet} />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur sm:gap-3 sm:px-5">
          <SidebarTrigger className="size-9 shrink-0" />
          <div className="flex min-w-0 flex-1"><SearchPalette permissions={permissionSet} /></div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <LanguageMenu compact />
            <NotificationsMenu result={notifications} />
            <UserMenu user={user} />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8">{children}</main>
        <Footer />
      </SidebarInset>
    </SidebarProvider>
  );
}
