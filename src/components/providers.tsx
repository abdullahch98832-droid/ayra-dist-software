"use client";

import type { Locale } from "@/types";
import { I18nProvider } from "@/i18n/context";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <I18nProvider locale={locale}>
      <TooltipProvider>{children}</TooltipProvider>
    </I18nProvider>
  );
}
