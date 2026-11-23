"use client";

import Link from "next/link";
import { Suspense, use, useState } from "react";
import { Bell, CircleCheck, TriangleAlert, UserCog } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { fill } from "@/i18n/format";
import type { AppNotification, NotificationResult } from "@/features/notifications/types";
import { StateMessage } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

const ICON = { usersWithoutRole: UserCog } satisfies Record<AppNotification["kind"], unknown>;

export function NotificationsMenu({ result }: { result: Promise<NotificationResult> }) {
  const { t } = useI18n();
  return (
    <Suspense fallback={<Button variant="ghost" size="icon" aria-label={t.notifications.title} disabled><Bell /></Button>}>
      <Menu result={result} />
    </Suspense>
  );
}

function Menu({ result }: { result: Promise<NotificationResult> }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const data = use(result);
  const items = data.ok ? data.items : [];
  const label = items.length ? `${t.notifications.title}: ${fill(t.notifications.unread, { count: items.length })}` : t.notifications.title;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="relative" />} aria-label={label}>
        <Bell className="size-5!" aria-hidden />
        {items.length > 0 && (
          <span className="font-latin absolute end-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[0.625rem] leading-none font-semibold text-white" aria-hidden>
            {items.length > 9 ? "9+" : items.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-0">
        <PopoverTitle className="border-b px-4 py-3 font-semibold text-navy">{t.notifications.title}</PopoverTitle>
        {!data.ok ? (
          <StateMessage icon={TriangleAlert} tone="warning" headingLevel="p" title={t.notifications.failed} className="py-8" />
        ) : items.length === 0 ? (
          <StateMessage icon={CircleCheck} headingLevel="p" title={t.notifications.empty} description={t.notifications.emptyHint} className="py-8" />
        ) : (
          <ul className="max-h-96 overflow-y-auto p-1">
            {items.map((item) => {
              const Icon = ICON[item.kind];
              return (
                <li key={item.id}>
                  <Link href={item.href} onClick={() => setOpen(false)} className="flex gap-3 rounded-md px-3 py-2.5 outline-none hover:bg-accent focus-visible:bg-accent">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning"><Icon className="size-4.5" aria-hidden /></span>
                    <span className="min-w-0">
                      <span className="block font-medium">{fill(t.notifications[item.kind], { count: item.count })}</span>
                      <span className="block text-xs text-muted-foreground">{t.notifications[`${item.kind}Hint`]}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
